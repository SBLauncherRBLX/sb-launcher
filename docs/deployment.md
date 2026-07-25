# Deployment

## API

1. Provision a host with Node 20+.
2. Set production env vars (see `.env.example`).
3. Prefer PostgreSQL for a hosted multi-user backend by changing Prisma
   `provider` + `DATABASE_URL`. The native app uses a private local SQLite DB.
4. Run:

```bash
pnpm install
pnpm --filter @sb/api db:generate
pnpm --filter @sb/api exec prisma db push
pnpm --filter @sb/api build
pnpm --filter @sb/api start
```

5. Put TLS termination (Caddy/nginx) in front of the API.
6. Update Roblox OAuth redirect URI to the HTTPS callback.

## Desktop

```bash
pnpm pack:win
```

Artifacts land in `release/`.

Sign the native executable and Inno Setup installer with an Authenticode
certificate before public distribution. Publish versioned installers over HTTPS.

## Health check

`GET /health` returns `{ ok, demoMode, oauthConfigured }`.
