#!/usr/bin/env node

const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { CONFIG_DIR, THUMB_DIR, CUSTOM_FOLDERS_FILE } = require('../src/main/appPaths');
const { getThumbPath } = require('../src/main/thumbnailPolicy');

async function loadCustomFolders() {
    try {
        const data = await fsp.readFile(CUSTOM_FOLDERS_FILE, 'utf-8');
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) return parsed;
    } catch (e) {}
    return [];
}

async function run() {
    if (process.platform !== 'linux') {
        console.error('Thumbnail generator is only supported on Linux (requires ffmpeg/ImageMagick)');
        process.exit(1);
    }

    await fsp.mkdir(CONFIG_DIR, { recursive: true }).catch(() => {});
    await fsp.mkdir(THUMB_DIR, { recursive: true }).catch(() => {});

    const defaultDirs = [
        path.join(os.homedir(), 'Pictures/wallpapers'),
        path.join(os.homedir(), 'Pictures/Wallpapers'),
        path.join(os.homedir(), 'Pictures/Wallpapers/Dynamic-Wallpapers'),
        path.join(os.homedir(), 'dotfiles/wallpapers'),
        path.join(os.homedir(), '.config/wallpapers'),
    ];
    const custom = await loadCustomFolders();
    const merged = [...defaultDirs, ...custom];
    const uniqueDirs = new Set(merged.filter(d => typeof d === 'string' && d.length > 0));

    let count = 0;
    const EXTS = new Set(['.mp4', '.webm', '.jpg', '.jpeg', '.png', '.webp', '.gif']);
    const VIDEO_EXTS = new Set(['.mp4', '.webm', '.gif']);

    for (const dir of uniqueDirs) {
        let entries;
        try {
            entries = await fsp.readdir(dir, { withFileTypes: true });
        } catch (e) {
            continue;
        }

        for (const ent of entries) {
            if (!ent.isFile() && !ent.isSymbolicLink()) continue;
            const ext = path.extname(ent.name).toLowerCase();
            if (!EXTS.has(ext)) continue;

            const sourcePath = path.join(dir, ent.name);
            let targetPath, stat;
            try {
                targetPath = await fsp.realpath(sourcePath);
                stat = await fsp.stat(targetPath);
                if (!stat.isFile()) continue;
            } catch (e) {
                continue;
            }

            const thumbPath = getThumbPath(THUMB_DIR, targetPath, stat);
            
            try {
                const thumbStat = await fsp.stat(thumbPath);
                if (thumbStat.size > 0) continue; // Already generated & non-empty
            } catch (e) {} // Needs generation

            await fsp.unlink(thumbPath).catch(() => {});

            const isVideo = VIDEO_EXTS.has(ext);

            await new Promise((resolve) => {
                if (isVideo) {
                    const args = [
                        '-threads', '2', '-y', '-ss', '00:00:02', '-i', targetPath,
                        '-vframes', '1', '-vf', 'scale=260:-1', '-q:v', '4', thumbPath
                    ];
                    execFile('ffmpeg', args, { timeout: 15000 }, (err) => {
                        fs.stat(thumbPath, (statErr, thumbStat) => {
                            if (!err && !statErr && thumbStat.size > 0) {
                                count++;
                                console.log(`✓ ${ent.name}`);
                                resolve();
                            } else {
                                // Retry at 00:00:00
                                const retryArgs = [
                                    '-threads', '2', '-y', '-i', targetPath,
                                    '-vframes', '1', '-vf', 'scale=260:-1', '-q:v', '4', thumbPath
                                ];
                                execFile('ffmpeg', retryArgs, { timeout: 15000 }, (err2) => {
                                    fs.stat(thumbPath, (statErr2, thumbStat2) => {
                                        if (!err2 && !statErr2 && thumbStat2.size > 0) {
                                            count++;
                                            console.log(`✓ ${ent.name} (retry)`);
                                        }
                                        resolve();
                                    });
                                });
                            }
                        });
                    });
                } else {
                    const args = [
                        '-limit', 'memory', '256MiB', '-limit', 'map', '512MiB', targetPath,
                        '-thumbnail', '260x>', '-quality', '80', thumbPath
                    ];
                    execFile('magick', args, { timeout: 15000 }, (err) => {
                        fs.stat(thumbPath, (statErr, thumbStat) => {
                            if (!err && !statErr && thumbStat.size > 0) {
                                count++;
                                console.log(`✓ ${ent.name}`);
                            }
                            resolve();
                        });
                    });
                }
            });
        }
    }

    console.log(`Done — ${count} new thumbnails generated`);
    const files = await fsp.readdir(THUMB_DIR).catch(() => []);
    console.log(`Total: ${files.length} thumbs cached in ${THUMB_DIR}`);
}

run();
