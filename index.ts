/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 MLG-SERBUR and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Logger } from "@utils/Logger";
import { relaunch } from "@utils/native";
import definePlugin, { OptionType, PluginNative } from "@utils/types";
import { showToast } from "@webpack/common";

const Native = VencordNative.pluginHelpers.CustomUpdater as PluginNative<typeof import("./native")>;
const logger = new Logger("CustomUpdater");

const settings = definePluginSettings({
    repo: {
        type: OptionType.STRING,
        description: "Builder repo to update from, as owner/name. It must publish a rolling 'latest' release with version.json plus the Vencord dist files.",
        default: "MLG-SERBUR/vencord-customstream-build"
    },
    autoDownload: {
        type: OptionType.BOOLEAN,
        description: "Download a new build automatically when one is found. Off means you only get a toast saying an update is available.",
        default: true
    },
    autoRestart: {
        type: OptionType.BOOLEAN,
        description: "Restart Discord automatically after a new build is downloaded. Off is safer while streaming: restart manually instead.",
        default: false
    },
    checkIntervalHours: {
        type: OptionType.NUMBER,
        description: "Hours between update checks. 0 disables the periodic check (a check still runs shortly after startup).",
        default: 6
    },
    appliedVersion: {
        type: OptionType.STRING,
        description: "Last builder version applied by this plugin. Managed by the plugin, do not edit unless you want to force a re-download.",
        default: ""
    }
});

let intervalId: ReturnType<typeof setInterval> | undefined;
let timeoutId: ReturnType<typeof setTimeout> | undefined;
let checking = false;

async function checkForUpdate(manual = false) {
    if (IS_WEB || checking) return;
    checking = true;
    try {
        const result = await Native.checkForUpdate(settings.store.repo);
        if (!result || !result.version) {
            if (manual) showToast({ text: "CustomUpdater: no update info found.", variant: "critical" });
            return;
        }
        if (result.version === settings.store.appliedVersion) {
            if (manual) showToast({ text: "CustomUpdater: already up to date." });
            return;
        }
        if (!settings.store.autoDownload) {
            showToast({ text: `CustomUpdater: update ${result.version} available. Enable autoDownload, or restart after downloading it manually.`, variant: "success" });
            return;
        }
        await Native.applyUpdate(settings.store.repo, result.files);
        // Only record the version after a successful download+write, so a
        // failed update is retried on the next check instead of skipped.
        settings.store.appliedVersion = result.version;
        showToast({ text: `CustomUpdater: update ${result.version} downloaded. Restart Discord to apply it.`, variant: "success" });
        if (settings.store.autoRestart) {
            setTimeout(relaunch, 1500);
        }
    } catch (err) {
        logger.error("Update check failed:", err);
        showToast({ text: `CustomUpdater: update failed: ${err instanceof Error ? err.message : String(err)}`, variant: "critical" });
    } finally {
        checking = false;
    }
}

export default definePlugin({
    name: "CustomUpdater",
    description: "Auto-updates a custom Vencord build from your own builder repo's latest release, without using the stock updater.",
    authors: [{ name: "MLG-SERBUR", id: 0n }],
    settings,

    start() {
        // Short delay so Discord finishes starting before the first check.
        timeoutId = setTimeout(() => void checkForUpdate(), 60_000);
        const hours = settings.store.checkIntervalHours;
        if (hours > 0) {
            intervalId = setInterval(() => void checkForUpdate(), hours * 3_600_000);
        }
    },

    stop() {
        if (timeoutId) clearTimeout(timeoutId);
        if (intervalId) clearInterval(intervalId);
        timeoutId = undefined;
        intervalId = undefined;
    },

    // Manual trigger: disable and re-enable the plugin, or restart Discord.
    // A periodic check also runs on the interval above.
    checkForUpdate
});
