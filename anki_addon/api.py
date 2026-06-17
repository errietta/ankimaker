"""HTTP client for the Ankimaker backend."""

from __future__ import annotations

import json
import urllib.request
import urllib.error


class APIError(Exception):
    def __init__(self, message: str, status_code: int = 0) -> None:
        super().__init__(message)
        self.status_code = status_code


def get_meaning(text: str, language: str, token: str, api_base_url: str) -> dict:
    """
    POST /meaning and return {'sentence': str, 'meaning': str, 'reading': str}.
    Raises APIError on HTTP or network failure.
    """
    url = api_base_url.rstrip("/") + "/meaning"
    body = json.dumps({"text": text, "language": language}).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise APIError(f"HTTP {exc.code}: {exc.reason}", status_code=exc.code) from exc
    except urllib.error.URLError as exc:
        raise APIError(f"Network error: {exc.reason}") from exc

    reply = data.get("reply", {})
    return {
        "sentence": reply.get("sentence", text),
        "meaning": reply.get("meaning", ""),
        "reading": reply.get("reading", ""),
    }
