# Windows packaging

## Build installer

```bash
pnpm pack:win
```

Outputs:

- `release/SB-Launcher-Setup-1.0.0.exe` — Windows installer
- `release/native/SB Launcher.exe` — native executable
- `release/SB-Launcher-Native-1.0.0-win-x64.zip` — portable package

## Protocol handler

The Inno Setup installer registers `sblauncher://`. The native host also registers
the protocol for the current user when it starts.

## Code signing (production)

Sign `release/native/SB Launcher.exe` and the generated installer using your
Authenticode certificate in the release pipeline. Without a certificate,
Windows SmartScreen can warn on first run.

## Auto-update

Publish versioned installers on your HTTPS release server. The current native
build does not silently self-update; this avoids applying unsigned updates.
