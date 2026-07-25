# Policy & legal notes

## Non-affiliation

SB Launcher is an independent software project. It is **not** affiliated with, endorsed by, sponsored by, or approved by Roblox Corporation unless Roblox explicitly grants such approval through their third-party app review process.

## Terms requirements (for public OAuth apps)

Your public Terms of Use should state that:

1. The terms are between the user and you (the app operator), not Roblox.
2. Roblox is not affiliated with SB Launcher.
3. Roblox is not responsible for use of SB Launcher.
4. Roblox has no obligation to provide maintenance/support for SB Launcher.
5. Users must also comply with the Roblox Terms of Use / Community Standards.

## Privacy

Store only what you need:

- Encrypted OAuth access/refresh tokens on the API
- SB session identifiers
- Theme presets, favorites, launch history, outfit presets

Do **not** collect or store `.ROBLOSECURITY` cookies.

## Prohibited techniques

SB Launcher intentionally avoids:

- Client binary modification
- FastFlag injection / undocumented client config hacks
- Credential phishing or cookie theft
- Impersonating the official Roblox Player UI/assets

## Server region disclosure

Roblox public server list responses may include ping and FPS but **do not** provide authoritative geographic region. SB Launcher displays region as unavailable rather than inventing GeoIP estimates.
