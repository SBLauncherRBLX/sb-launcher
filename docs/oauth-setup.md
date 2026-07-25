# OAuth setup (Roblox)

## Register the app

1. Open [Creator Dashboard → Credentials](https://create.roblox.com/dashboard/credentials).
2. Create an **OAuth 2.0** application named **SB Launcher**.
3. Choose category **User Tools**.
4. Add redirect URL exactly (copy-paste):
   - `http://localhost:8787/auth/roblox/callback`
   Optionally also add `http://127.0.0.1:8787/auth/roblox/callback` if Roblox allows it.
   The desktop app uses the **localhost** URL.
5. Request the minimum scopes you need. Start with:

```text
openid profile
```

Additional scopes (subject to Roblox review / category policy):

- `user.social:read` — friends & presence

## Configure the native app

Open **Settings** in SB Launcher, paste the numeric Client ID, and click
**Save**. The native client uses OAuth Authorization Code + PKCE, so it does
not embed a client secret.

For a separately hosted confidential backend, use `apps/api/.env.example` and
keep `ROBLOX_CLIENT_SECRET` only on that server.

## Desktop deep link

After browser OAuth, the API redirects to:

```text
sblauncher://auth?token=<session>
```

The native WPF host registers the `sblauncher` protocol and stores only the SB
session token locally. Roblox access and refresh tokens remain encrypted in the
local API database.

## Publishing beyond 10 test users

Roblox keeps new OAuth apps in private mode (limited test users) until you submit for review with:

- Privacy policy URL
- Terms of use URL
- Clear non-affiliation language
- Entry / homepage URL over HTTPS
- Accurate scope justification

Ready-to-host pages live in [`docs/site`](site/):

1. Upload everything from `docs/site/` to the public GitHub Pages repo
   (`kotipipa7-debug/SR-launcher`), including `assets/` and `downloads/`.
2. In the repo: **Settings → Pages → Deploy from a branch → `main` / root**.
3. After a minute, use:

```text
Entry Link:          https://kotipipa7-debug.github.io/SR-launcher/
Privacy Policy URL:  https://kotipipa7-debug.github.io/SR-launcher/privacy.html
Terms of Service URL: https://kotipipa7-debug.github.io/SR-launcher/terms.html
Download:            https://kotipipa7-debug.github.io/SR-launcher/#download
```

4. Save those URLs in the OAuth app, request scopes, then submit/publish.

See [policy.md](policy.md).
