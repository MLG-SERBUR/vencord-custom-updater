# CustomUpdater (Vencord userplugin)

Auto-updates a custom Vencord build from your own builder repo, instead of
using Vencord's stock updater (which would replace a custom build with the
official one).

## How it works

1. The renderer side checks on startup (after 60 seconds) and then every
   `checkIntervalHours` hours.
2. The native side (main process, `native.ts`) fetches
   `https://api.github.com/repos/<repo>/releases/latest`, reads the
   `version.json` asset, and compares its `version` to the plugin's
   `appliedVersion` setting.
3. If the version is new and `autoDownload` is on, the native side downloads
   every dist file for the current platform, backs up the existing files
   to `*.customupdater-bak`, then writes the new files over the folder
   holding the running Vencord files (same folder the stock HTTP updater
   writes to). Downloads happen before any write, and a failed write
   restores the backups.
4. It records `appliedVersion` only after a successful write, so a failed
   update is retried on the next check.
5. Restart Discord to load the new files. With `autoRestart` on, the plugin
   restarts Discord itself 1.5 seconds after downloading. That setting is
   off by default, because restarting mid-stream would kill the stream.

## Safety limits (native side)

- The repo setting must match `owner/name`, nothing else.
- Only the four dist files for the current platform are ever written:
  Discord desktop gets `patcher.js`, `preload.js`, `renderer.js`,
  `renderer.css`; Vesktop gets the `vencordDesktop*` equivalents.
- Download URLs must start with
  `https://github.com/<repo>/releases/download/`. No other host, no other
  file name, no other folder.

## Builder release format it expects

A rolling `latest` release in the builder repo, containing:

- `version.json` — `{"version": "<vencord>-<plugin>-<updater>", ...}`
- `patcher.js`, `preload.js`, `renderer.js`, `renderer.css`
- `vencordDesktopMain.js`, `vencordDesktopPreload.js`,
  `vencordDesktopRenderer.js`, `vencordDesktopRenderer.css`

The version string only needs to change when the build actually changes.
The builder in `MLG-SERBUR/vencord-customstream-build` builds it from the
short SHAs of Vencord, customStream, and this plugin, so a daily rebuild
with no upstream change produces the same version and is skipped.

## Install in a source build

Clone this repo into the Vencord checkout as a desktop-only userplugin:

```sh
git clone https://github.com/MLG-SERBUR/vencord-custom-updater src/userplugins/customUpdater.desktop
pnpm build && pnpm inject
```

Restart Discord, enable **CustomUpdater** in Vencord settings > Plugins.
The author ID in `index.ts` is a placeholder (`0n`); replace it with your
real Discord user ID if you want the author line to link to a profile.

## Settings

- `repo` — builder repo, default `MLG-SERBUR/vencord-customstream-build`.
- `autoDownload` — default on.
- `autoRestart` — default off (see above).
- `checkIntervalHours` — default 6. 0 disables the periodic check.
- `appliedVersion` — managed by the plugin. Clear it to force a re-download
  of the latest release.

## Notes

- Desktop only. The plugin does nothing on web, where there is no local
  dist folder to update.
- This plugin updates Vencord files only, not Discord itself.
- Trust: the builder repo is the only source, but the build itself pulls
  third-party plugin code (customStream) and upstream Vencord, so a bad
  upstream commit would still land on your PC. That is the trade-off for
  zero-click updates; pin SHAs in the builder workflow if you want control
  instead.
