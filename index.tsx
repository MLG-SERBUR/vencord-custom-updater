/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 MLG-SERBUR and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showNotification } from "@api/Notifications";
import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { Logger } from "@utils/Logger";
import { relaunch } from "@utils/native";
import definePlugin, { OptionType, PluginNative } from "@utils/types";
import { React, showToast } from "@webpack/common";

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
    checkNow: {
        type: OptionType.COMPONENT,
        component: () => (
            <Button onClick={() => void checkForUpdate(true)}>
                Check for updates now
            </Button>
        )
    },
    appliedVersion: {
        type: OptionType.STRING,
        description: "Last builder version applied by this plugin. Managed by the plugin, do not edit unless you want to force a re-download.",
        default: ""
    }
});

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
        // Same notification as the stock updater: permanent, click to restart.
        // The stock updater delays it 10 seconds; this check already runs
        // 60 seconds after startup, so no extra delay here.
        await showNotification({
            title: "Custom Vencord has been updated!",
            body: "Click here to restart",
            color: "var(--green-360)",
            permanent: true,
            noPersist: true,
            onClick: relaunch
        });
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
        // Startup only, like the stock updater. Short delay so Discord
        // finishes starting before the first check.
        timeoutId = setTimeout(() => void checkForUpdate(), 60_000);
    },

    stop() {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = undefined;
    },

    checkForUpdate
});
