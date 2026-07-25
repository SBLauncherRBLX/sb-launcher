# SB Launcher Cloud (Cloudflare Workers)

Public services for:

1. **Player registry** — Roblox accounts that signed in via SB Launcher  
2. **Update manifest** — latest version / buildId / download URL (no silent install)

## One-time setup

1. Install deps from repo root (or in this folder):

```powershell
cd services/cloud
pnpm install
```

2. Create KV namespaces:

```powershell
npx wrangler kv namespace create PLAYERS
npx wrangler kv namespace create PLAYERS --preview
npx wrangler kv namespace create META
npx wrangler kv namespace create META --preview
```

3. Paste the returned IDs into [`wrangler.toml`](wrangler.toml) (`REPLACE_WITH_*`).

4. Deploy:

```powershell
npx wrangler deploy
```

Note the workers.dev URL, e.g. `https://sb-launcher-cloud.<account>.workers.dev`.

5. Set the admin secret (for publishing updates):

```powershell
npx wrangler secret put UPDATE_ADMIN_TOKEN
```

6. Point the desktop API at the Worker:

- Native ships `SB_CLOUD_URL` (see `MainWindow.xaml.cs`) — default matches this Worker name.  
- Or set `SB_CLOUD_URL` in `apps/api/.env` for local API dev.

7. Seed the update manifest after `pnpm pack:win`:

```powershell
$env:SB_UPDATE_ADMIN_TOKEN = "your-secret"
$env:SB_CLOUD_URL = "https://sb-launcher-cloud.<account>.workers.dev"
powershell -ExecutionPolicy Bypass -File scripts/publish-update-manifest.ps1
```

## API

| Method | Path | Auth |
|--------|------|------|
| `POST` | `/v1/players/register` | Roblox OAuth `Bearer` access token |
| `GET` | `/v1/players/:id` | public (includes cosmetics) |
| `GET` | `/v1/players/count` | public |
| `PUT` | `/v1/players/me/cosmetics` | Roblox OAuth `Bearer` |
| `POST` | `/v1/presence/heartbeat` | Roblox OAuth `Bearer` (launcher online ping) |
| `POST` | `/v1/presence/batch` | Roblox OAuth `Bearer` (`{ userIds }`) |
| `POST` | `/v1/media` | Roblox OAuth `Bearer` (raw image/gif/video bytes, max ~3.5 MB) |
| `GET` | `/v1/media/:userId/:id` | public |
| `GET` | `/v1/update` | public |
| `PUT` | `/v1/update` | `Bearer UPDATE_ADMIN_TOKEN` |

Update manifest fields: `version`, `buildId`, `downloadUrl`, `notes` (multiline patch notes, up to 12 KB), optional `title`, `publishedAt`.

Registration verifies identity via `https://apis.roblox.com/oauth/v1/userinfo` — no Roblox client secret in the Worker.

Profile cosmetics (badge / avatar / banner) are stored on the player record and visible to every launcher client.
