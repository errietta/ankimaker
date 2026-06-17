# Ankimaker Configuration

| Key | Description |
|-----|-------------|
| `auth0_domain` | Auth0 tenant domain. Change this if you self-host the backend with a different tenant. |
| `auth0_client_id` | Auth0 application Client ID. Must match the app that has Device Authorization Flow enabled. |
| `auth0_audience` | Auth0 API audience identifier. |
| `auth0_scope` | OAuth scopes. Include `offline_access` to enable token refresh (avoids re-login after expiry). |
| `api_base_url` | Base URL of the Ankimaker backend. Change this to point at a self-hosted instance. |
| `deck` | Last-used deck name (updated automatically when you add cards). |
| `language` | Last-used language: `jp-JP` for Japanese, `zh-CN` for Chinese. |
| `model` | Last-used note type name (updated automatically). |

## Auth0 setup required

Before logging in for the first time you must enable **Device Authorization Flow** on your Auth0 application:

> Auth0 Dashboard → Applications → *[your app]* → Settings → Advanced Settings → Grant Types → enable **Device Code** → Save

To get refresh tokens (avoid logging in every session), also enable **offline_access** in your Auth0 API settings:

> Auth0 Dashboard → APIs → *[your API]* → Settings → Allow Offline Access → toggle on → Save
