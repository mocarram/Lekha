# Building and Releasing Lekha

## Local Builds

### Full macOS distribution (dmg + zip)

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist:mac
```

Artifacts land in `release/`:
- `Lekha-<version>-arm64.dmg` - drag-to-install disk image for Apple Silicon
- `Lekha-<version>-x64.dmg` - disk image for Intel Macs
- `Lekha-<version>-arm64.zip` - zipped app bundle (arm64)
- `Lekha-<version>-x64.zip` - zipped app bundle (x64)

### Fast unpacked build (no dmg, for quick testing)

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist:dir
```

Produces `release/mac-arm64/Lekha.app` (or `release/mac/Lekha.app` on Intel).
Useful for validating the packaged app without waiting for dmg creation.

## Artifacts

The `release/` directory is gitignored and never committed. Generated artifacts:

| File | Description |
|---|---|
| `release/mac-arm64/Lekha.app` | Unpacked app bundle (arm64, from `--dir`) |
| `release/Lekha-*.dmg` | macOS installer disk image |
| `release/Lekha-*.zip` | Zipped app bundle (used by auto-updater) |
| `release/builder-effective-config.yaml` | Resolved electron-builder config (debug aid) |

## Signing and Notarization (Future Step)

Current builds are unsigned. To distribute outside direct download (avoid Gatekeeper
warnings) you need:

1. **Code signing** - obtain a "Developer ID Application" certificate from Apple.
   Set `CSC_LINK` (path to .p12) and `CSC_KEY_PASSWORD` env vars, then remove
   `identity: null` from `electron-builder.yml` and enable `hardenedRuntime: true`.

2. **Notarization** - after signing, notarize with Apple's servers.
   Set `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` env vars,
   create `build/entitlements.mac.plist` (see `build/entitlements.mac.plist.example`),
   and add `notarize: true` under `mac:` in `electron-builder.yml`.

3. **App icon** - create `build/icon.icns` (1024x1024 source, use `iconutil`) and
   reference it as `mac.icon: build/icon.icns` in `electron-builder.yml`.
   Until then, electron-builder uses the default Electron icon.

Credentials are never committed. Use environment variables or a secrets manager.
