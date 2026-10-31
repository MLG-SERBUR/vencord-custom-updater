/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 MLG-SERBUR and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { IpcMainInvokeEvent } from "electron";
import { copyFile, writeFile } from "fs/promises";
import { join } from "path";

// Same file sets as Vencord's own HTTP updater (src/main/updater/common.ts).
const VENCORD_FILES = IS_DISCORD_DESKTOP
    ? ["patcher.js", "preload.js", "renderer.js", "renderer.css"]
    : ["vencordDesktopMain.js", "vencordDesktopPreload.js", "vencordDesktopRenderer.js", "vencordDesktopRenderer.css"];

const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export interface UpdateFile {
    name: string;
    url: string;
}

export interface UpdateInfo {
    version: string;
    files: UpdateFile[];
}

async function fetchJson(url: string) {
    const res = await fetch(url, {
        headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": "CustomUpdater-Vencord"
        }
    });
    if (!res.ok) throw new Error(`GitHub request failed (${res.status}): ${url}`);
    return res.json();
}

function assertRepo(repo: string) {
    if (!REPO_RE.test(repo)) throw new Error(`Invalid repo: ${repo}`);
}

function assertFile(file: UpdateFile, repo: string) {
    if (!VENCORD_FILES.includes(file.name)) throw new Error(`Refusing to write unexpected file: ${file.name}`);
    // Release asset downloads from the builder repo only. fetch() follows
    // GitHub's redirect to its object storage internally; the check here
    // is on the URL we were given, not the redirect target.
    if (!file.url.startsWith(`https://github.com/${repo}/releases/download/`)) {
        throw new Error(`Refusing download from unexpected URL for ${file.name}`);
    }
}

/**
 * Returns the latest builder version and its dist files, or null version
 * when the release has no usable version.json. Runs in the main process,
 * so it is not subject to the renderer's CORS rules.
 */
export async function checkForUpdate(_e: IpcMainInvokeEvent, repo: string): Promise<UpdateInfo> {
    assertRepo(repo);
    const release = await fetchJson(`https://api.github.com/repos/${repo}/releases/latest`);
    const versionAsset = release?.assets?.find((a: any) => a.name === "version.json");
    if (!versionAsset?.browser_download_url) return { version: "", files: [] };

    const versionInfo = await fetchJson(versionAsset.browser_download_url);
    if (typeof versionInfo?.version !== "string" || !versionInfo.version) {
        return { version: "", files: [] };
    }

    const files: UpdateFile[] = [];
    for (const name of VENCORD_FILES) {
        const asset = release.assets.find((a: any) => a.name === name);
        if (!asset?.browser_download_url) throw new Error(`Release is missing ${name}`);
        files.push({ name, url: asset.browser_download_url });
    }
    return { version: versionInfo.version, files };
}

/**
 * Downloads every dist file first, then writes them all to the folder
 * holding the currently running Vencord files (__dirname, same as the
 * stock HTTP updater). If a write fails, backed-up files are restored.
 */
export async function applyUpdate(_e: IpcMainInvokeEvent, repo: string, files: UpdateFile[]): Promise<boolean> {
    assertRepo(repo);
    for (const file of files) assertFile(file, repo);

    const buffers = await Promise.all(files.map(async file => {
        const res = await fetch(file.url, { headers: { "User-Agent": "CustomUpdater-Vencord" } });
        if (!res.ok) throw new Error(`Download failed (${res.status}): ${file.name}`);
        return { name: file.name, data: Buffer.from(await res.arrayBuffer()) };
    }));

    const backups: string[] = [];
    try {
        for (const { name } of buffers) {
            const target = join(__dirname, name);
            const backup = `${target}.customupdater-bak`;
            await copyFile(target, backup).catch(() => { /* file may not exist yet */ });
            backups.push(backup);
        }
        for (const { name, data } of buffers) {
            await writeFile(join(__dirname, name), data);
        }
    } catch (err) {
        // Best-effort restore, then report the original error.
        for (let i = 0; i < buffers.length; i++) {
            const backup = backups[i];
            if (backup) await copyFile(backup, join(__dirname, buffers[i].name)).catch(() => { });
        }
        throw err;
    }
    return true;
}
