# Nova DeathMessages assets

Self-hosted icon pack for the Rust `DeathMessages` plugin.

- 31 original 64x64 transparent PNG kill-feed icons.
- Hosted from this public repository so Rust/ImageLibrary can fetch them without authentication.
- No dependency on the retired SkyPlugins image API or the old Imgur headshot asset.
- The patched plugin maps Rust weapon/entity shortnames to a stable category icon (rifle, pistol, shotgun, SMG, launcher, grenade, melee, trap, turret, vehicle, animal, environment, etc.) and falls back to `unknown.png`.
- ImageLibrary is still used to download/cache the PNGs for Rust CUI.

Raw base path:
`https://raw.githubusercontent.com/kivkumah-oss/tampermonkey/main/rust/deathmessages/icons/`

The mapping is intentionally resilient: new Rust items will still receive a sensible category or fallback icon instead of crashing the plugin.
