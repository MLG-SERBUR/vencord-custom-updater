/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 MLG-SERBUR and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

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
        await Native.applyUpdate(settings.store.repo, result.files);
        // Only record the version after a successful download+write, so a
        // failed update is retried on the next check instead of skipped.
        settings.store.appliedVersion = result.version;
        // No notification, no click: restart immediately so the new files
        // load. A failed apply never reaches this line, so a failed
        // update does not restart into a half-written build.
        relaunch();
    } catch (err) {
        logger.error("Update check failed:", err);
        showToast({ text: `CustomUpdater: update failed: ${err instanceof Error ? err.message : String(err)}`, variant: "critical" });
    } finally {
        checking = false;
    }
}

export default definePlugin({
    name: "CustomUpdater",
    description: "Auto-updates and auto-restarts a custom Vencord build from your own builder repo's latest release, without using the stock updater.",
    authors: [{ name: "MLG-SERBUR", id: 0n }],
    settings,

    start() {
        // Startup only, like the stock updater, but instant: plugins
        // start at WebpackReady, so Discord is already up when this runs.
        // No delay, no timer to clean up, so no stop() needed.
        void checkForUpdate();
    },

    checkForUpdate
});
