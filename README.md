# SB Launcher

SB Launcher is a Windows desktop companion for Roblox with:

- Official Roblox OAuth (backend-managed tokens)
- Experience discovery, favorites, and launch history
- Public server browser (ping / FPS / occupancy)
- Friends & presence (when OAuth scopes allow)
- Avatar inventory & outfit presets
- Pulse-style Visuals customization
- Safe graphics guidance (no client patching / FastFlags)

**SB Launcher is not affiliated with, endorsed by, or sponsored by Roblox Corporation.**

## Monorepo layout

- `apps/native` — native .NET 8 WPF host with the system WebView2 runtime
- `apps/desktop` — React + Vite UI embedded into the native host (English)
- `apps/api` — Fastify API, Prisma, OAuth, Roblox adapters
- `packages/contracts` — shared Zod schemas & helpers
- `packages/ui` — design system primitives & theme presets

## Prerequisites

- Node.js 20+
- pnpm 9+ (repo pins `packageManager`)
- .NET 8 SDK (only for building the native executable)
- Roblox OAuth Client ID (required for real account login)

## Install and run

Run `release/SB-Launcher-Setup-1.0.0.exe`, then open **SB Launcher** from the
Desktop or Start menu. No terminal, Node.js installation, Electron, or development
command is required on the user's PC.

The app starts its private local API automatically and stores data under
`%LOCALAPPDATA%\SB Launcher`.

## Live Roblox OAuth

1. Create an OAuth 2.0 app in [Creator Dashboard → Credentials](https://create.roblox.com/dashboard/credentials).
2. Category: **User Tools** (for launcher-style scopes).
3. Redirect URI: `http://localhost:8787/auth/roblox/callback` (or your HTTPS production URL).
4. Open **Settings** in SB Launcher and paste the numeric Client ID.
5. Click **Save**, then **Sign in with Roblox**.

The desktop client uses Authorization Code + PKCE and does not embed an OAuth
client secret. Demo accounts, fake games, fake online counts, and fake servers
are not used.

See [docs/oauth-setup.md](docs/oauth-setup.md) and [docs/policy.md](docs/policy.md).

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | API + desktop concurrently |
| `pnpm test` | Run package tests |
| `pnpm build` | Build all packages |
| `pnpm pack:win` | Native WPF executable, portable ZIP, and Windows installer |

## Safety / compliance notes

- Tokens are encrypted at rest on the API; the desktop only stores an SB session token.
- No `.ROBLOSECURITY` cookie handling.
- No Roblox client binary patching or FastFlag injection.
- Server **region** is shown as unavailable because Roblox does not expose it via public APIs.

## License

Independent project for personal / educational use. Respect [Roblox Terms](https://www.roblox.com/info/terms) and the Creator Third Party App Policy.
