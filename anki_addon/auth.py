"""
Auth0 Device Authorization Flow with secure token storage.

Tokens are stored in the OS keychain (macOS Keychain, Windows Credential Manager,
Linux SecretService) via the `keyring` library. If keyring is unavailable,
tokens fall back to ~/.config/ankimaker/tokens.json (chmod 600).
"""

from __future__ import annotations

import base64
import json
import os
import time
import threading
import urllib.request
import urllib.parse
import urllib.error
import webbrowser
from typing import Callable, Optional

_KEYRING_SERVICE = "ankimaker"
_FALLBACK_DIR = os.path.expanduser(os.path.join("~", ".config", "ankimaker"))
_FALLBACK_FILE = os.path.join(_FALLBACK_DIR, "tokens.json")


# ---------------------------------------------------------------------------
# Secure token storage (keyring + file fallback)
# ---------------------------------------------------------------------------

def _keyring_key(domain: str, client_id: str, kind: str) -> str:
    return f"{kind}|{domain}|{client_id}"


def _store(key: str, value: str) -> None:
    try:
        import keyring
        keyring.set_password(_KEYRING_SERVICE, key, value)
        return
    except Exception:
        pass
    _file_store(key, value)


def _load(key: str) -> Optional[str]:
    try:
        import keyring
        val = keyring.get_password(_KEYRING_SERVICE, key)
        if val is not None:
            return val
    except Exception:
        pass
    return _file_load(key)


def _delete(key: str) -> None:
    try:
        import keyring
        keyring.delete_password(_KEYRING_SERVICE, key)
    except Exception:
        pass
    _file_delete(key)


def _file_store(key: str, value: str) -> None:
    os.makedirs(_FALLBACK_DIR, exist_ok=True)
    data: dict = {}
    if os.path.exists(_FALLBACK_FILE):
        try:
            with open(_FALLBACK_FILE, "r") as f:
                data = json.load(f)
        except Exception:
            pass
    data[key] = value
    with open(_FALLBACK_FILE, "w") as f:
        json.dump(data, f)
    try:
        os.chmod(_FALLBACK_FILE, 0o600)
    except Exception:
        pass


def _file_load(key: str) -> Optional[str]:
    if not os.path.exists(_FALLBACK_FILE):
        return None
    try:
        with open(_FALLBACK_FILE, "r") as f:
            return json.load(f).get(key)
    except Exception:
        return None


def _file_delete(key: str) -> None:
    if not os.path.exists(_FALLBACK_FILE):
        return
    try:
        with open(_FALLBACK_FILE, "r") as f:
            data = json.load(f)
        data.pop(key, None)
        with open(_FALLBACK_FILE, "w") as f:
            json.dump(data, f)
        os.chmod(_FALLBACK_FILE, 0o600)
    except Exception:
        pass


def _save_tokens(config: dict, token_data: dict) -> None:
    domain = config["auth0_domain"]
    client_id = config["auth0_client_id"]
    expires_at = time.time() + token_data.get("expires_in", 86400)

    _store(_keyring_key(domain, client_id, "access_token"), token_data["access_token"])
    _store(_keyring_key(domain, client_id, "expires_at"), str(expires_at))
    if "refresh_token" in token_data:
        _store(_keyring_key(domain, client_id, "refresh_token"), token_data["refresh_token"])


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_or_refresh_token(config: dict) -> Optional[str]:
    """Return a valid access token, refreshing silently if expired. None if not logged in."""
    domain = config["auth0_domain"]
    client_id = config["auth0_client_id"]

    access_token = _load(_keyring_key(domain, client_id, "access_token"))
    if not access_token:
        return None

    expires_at_str = _load(_keyring_key(domain, client_id, "expires_at"))
    if expires_at_str:
        try:
            if time.time() < float(expires_at_str) - 60:
                return access_token
        except ValueError:
            pass

    # Token expired — try to refresh
    refresh_token = _load(_keyring_key(domain, client_id, "refresh_token"))
    if refresh_token:
        new_tokens = _do_refresh(config, refresh_token)
        if new_tokens:
            _save_tokens(config, new_tokens)
            return new_tokens["access_token"]

    return None


def clear_tokens(config: dict) -> None:
    """Delete all stored tokens for this config (logout)."""
    domain = config["auth0_domain"]
    client_id = config["auth0_client_id"]
    for kind in ("access_token", "refresh_token", "expires_at"):
        _delete(_keyring_key(domain, client_id, kind))


def get_permissions(token: str) -> list:
    """Decode the JWT payload and return the permissions list."""
    try:
        payload_b64 = token.split(".")[1]
        padding = 4 - len(payload_b64) % 4
        payload = json.loads(base64.urlsafe_b64decode(payload_b64 + "=" * padding))
        return payload.get("permissions", [])
    except Exception:
        return []


def device_flow_login(
    config: dict,
    on_code: Callable[[str, str, str], None],
    on_success: Callable[[str], None],
    on_error: Callable[[str], None],
) -> threading.Thread:
    """
    Start Auth0 Device Authorization Flow in a background thread.

    Callbacks are invoked from the background thread — callers are responsible
    for dispatching to the main thread (e.g. via mw.taskman.run_on_main).

    on_code(user_code, verification_uri, verification_uri_complete)
    on_success(access_token)
    on_error(message)
    """
    thread = threading.Thread(target=_device_flow_worker, args=(config, on_code, on_success, on_error), daemon=True)
    thread.start()
    return thread


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _post_form(url: str, params: dict) -> dict:
    data = urllib.parse.urlencode(params).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _do_refresh(config: dict, refresh_token: str) -> Optional[dict]:
    try:
        return _post_form(
            f"https://{config['auth0_domain']}/oauth/token",
            {
                "grant_type": "refresh_token",
                "client_id": config["auth0_client_id"],
                "refresh_token": refresh_token,
            },
        )
    except Exception:
        return None


def _device_flow_worker(
    config: dict,
    on_code: Callable,
    on_success: Callable,
    on_error: Callable,
) -> None:
    domain = config["auth0_domain"]
    client_id = config["auth0_client_id"]
    audience = config["auth0_audience"]
    scope = config.get("auth0_scope", "read:current_user offline_access")

    # Step 1: Request device + user codes
    try:
        device_data = _post_form(
            f"https://{domain}/oauth/device/code",
            {"client_id": client_id, "audience": audience, "scope": scope},
        )
    except Exception as exc:
        on_error(f"Could not start login: {exc}")
        return

    user_code = device_data.get("user_code", "")
    verification_uri = device_data.get("verification_uri", "")
    verification_uri_complete = device_data.get("verification_uri_complete", verification_uri)
    device_code = device_data.get("device_code", "")
    interval = device_data.get("interval", 5)
    expires_in = device_data.get("expires_in", 300)

    on_code(user_code, verification_uri, verification_uri_complete)
    webbrowser.open(verification_uri_complete)

    # Step 2: Poll for token
    deadline = time.time() + expires_in
    token_url = f"https://{domain}/oauth/token"

    while time.time() < deadline:
        time.sleep(interval)
        try:
            token_data = _post_form(
                token_url,
                {
                    "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
                    "device_code": device_code,
                    "client_id": client_id,
                },
            )
            _save_tokens(config, token_data)
            on_success(token_data["access_token"])
            return
        except urllib.error.HTTPError as exc:
            try:
                body = json.loads(exc.read().decode("utf-8"))
            except Exception:
                body = {}
            error = body.get("error", "")
            if error == "authorization_pending":
                continue
            elif error == "slow_down":
                interval += 5
                continue
            else:
                on_error(body.get("error_description", error) or f"HTTP {exc.code}")
                return
        except Exception as exc:
            on_error(f"Login failed: {exc}")
            return

    on_error("Login timed out. Please try again.")
