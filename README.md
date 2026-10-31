# CustomUpdater (Vencord userplugin)

Auto-updates a custom Vencord build from your own builder repo, instead of
using Vencord's stock updater (which would replace a custom build with the
official one).

## How it works

1. The renderer side checks on startup (after 60 seconds), like the stock
   updater. `checkIntervalHours` is 0 by default (startup only); set it
   higher for a periodic check while Discord stays open.
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
5. After a download, the plugin shows the same notification as the stock
   updater: "Custom Vencord has been updated! Click here to restart".
   Clicking it restarts Discord and loads the new files. With `autoRestart`
   on, the plugin restarts Discord itself 1.5 seconds after downloading
   instead. That setting is off by default, because restarting mid-stream
   would kill the stream. A "Check for updates now" button in the plugin
   settings does a manual check, like the stock updater's Update button.

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
- `checkIntervalHours` — default 0 (startup only, like the stock updater).
  Set higher for a periodic check while Discord stays open.
- `appliedVersion` — managed by the plugin. Clear it to force a re-download
  of the latest release.

## Differences from the stock updater, and why they stay

- Version identity: the stock updater compares the build's embedded gitHash
  to the last token of the release name. This build is not one repo commit,
  it is three repos combined, so the version is the SHA combo in
  `version.json` instead, compared to the plugin's `appliedVersion` setting.
- Source: the stock updater's repo is baked in at build time. This plugin's
  repo is a setting, changeable without rebuilding. That is the whole
  point: a baked official remote is what loses a custom build.
- Changelog: the stock updater shows upstream commits from a compare API
  call. The builder repo has no such commit history, so the changelog
  lives in the builder release notes instead, not in the client.
- Robustness: the stock updater is core code and runs even with plugins
  off. This plugin only updates while it is enabled. If it breaks, the
  fallback is a manual source build + inject, same as the stock updater's
  "re-install with the installer" fallback.

## Notes

- Desktop only. The plugin does nothing on web, where there is no local
  dist folder to update.
- This plugin updates Vencord files only, not Discord itself.
- Trust: the builder repo is the only source, but the build itself pulls
  third-party plugin code (customStream) and upstream Vencord, so a bad
  upstream commit would still land on your PC. That is the trade-off for
  zero-click updates; pin SHAs in the builder workflow if you want control
  instead.
