# Google Connectors Setup

This guide walks through creating the Google Cloud OAuth client that backs
Gmail + Google Calendar ingest in nimi (ROADMAP #8, ADR 0007).

## 1. Create a Google Cloud project (or use an existing one)

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project or select an existing one.

## 2. Enable the required APIs

In **APIs & Services → Library**, enable:
- **Gmail API**
- **Google Calendar API**

## 3. Create an OAuth consent screen

1. **APIs & Services → OAuth consent screen**.
2. Choose **External** (works for test users without domain verification).
3. Fill in the required fields (App name, support email). Logo and links are optional for testing.
4. Under **Scopes**, add:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/calendar.readonly`
   - `openid`, `email`, `profile` (these are pre-listed)
5. Under **Test users**, add every Google account that will connect to nimi.
   Unverified apps can have up to 100 test users without going through Google verification.
6. Save and continue.

## 4. Create OAuth credentials

1. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
2. Application type: **Desktop app**.
3. Name it anything (e.g. "nimi local").
4. Click **Create**.
5. Copy the **Client ID** and **Client Secret**.

> **Why Desktop app?**
> Google's Desktop app client type allows loopback redirects (`http://127.0.0.1:<any-port>`)
> without pre-registering the exact port. nimi uses a random OS-assigned port for each OAuth
> flow, so Desktop app is the right type. Web app clients require exact URI pre-registration.
>
> The client secret for a Desktop app is **non-confidential** — Google's documentation
> acknowledges it can't be kept secret in a native app binary. It is safe to put in `.env`.

## 5. Configure nimi

Add to `apps/desktop/.env` (create if it doesn't exist — git-ignored):

```bash
MAIN_VITE_GOOGLE_CLIENT_ID=<your-client-id>.apps.googleusercontent.com
MAIN_VITE_GOOGLE_CLIENT_SECRET=GOCSPX-<your-secret>
```

Optional overrides:

```bash
# Force-disable connectors (overrides credentials):
NEEME_CONNECTORS=off

# Polling interval in minutes (default 15):
NEEME_CONNECTOR_SYNC_MINUTES=15

# Override the OAuth scopes (space-separated, baked into the build):
MAIN_VITE_GOOGLE_SCOPES=openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar.readonly
```

## 6. Test the flow

```bash
NEEME_EMBEDDER=hash pnpm dev
```

1. The connector panel appears in the header (Gmail + Google Calendar rows).
2. Click **Connect** next to Gmail → your system browser opens to Google's consent screen.
3. Sign in with a **test user** account, grant the scopes.
4. The browser shows "Connected to nimi — you can close this tab."
5. nimi starts an immediate sync; messages appear in the Feed and Archive.
6. Repeat for Google Calendar.

## Two OAuth flows in nimi

nimi has two separate, independent OAuth flows:

| Flow | Module | Redirect | Token owner | Purpose |
|------|--------|----------|-------------|---------|
| **Logto app login** | `auth/logto.ts` | `neeme://callback` (custom scheme) | `neeme-auth.bin` | Identifies the user to nimi |
| **Google connectors** | `connectors/google-auth.ts` | `http://127.0.0.1:<port>` (loopback) | `neeme-connectors.bin` | Grants nimi read access to Gmail + Calendar |

These are independent: connecting Gmail does not require being signed in to Logto,
and vice versa.

## Troubleshooting

**"This app is blocked" / "Access denied"**
→ The Google account is not in the test user list. Add it in the OAuth consent screen.

**"redirect_uri_mismatch"**
→ You accidentally created a **Web app** client instead of a **Desktop app** client.
   Web app clients need exact redirect URIs pre-registered. Create a Desktop app client instead.

**"Google did not return a refresh_token"**
→ The account previously authorized this client and Google is reusing the existing grant.
   Go to [myaccount.google.com/permissions](https://myaccount.google.com/permissions),
   revoke nimi's access, then try connecting again. The `prompt=consent` + `access_type=offline`
   flags in the authorize URL ensure a fresh refresh token is issued.

**Sync not starting**
→ Check that `MAIN_VITE_GOOGLE_CLIENT_ID` and `MAIN_VITE_GOOGLE_CLIENT_SECRET` are set and that
   `NEEME_CONNECTORS` is not `off`. Check the Electron DevTools console for `[connectors]` logs.
