const crypto = require('crypto');
const fsp = require('fs').promises;

let wallpaperInventory = new Map();

function getFavoriteKey(targetPath) {
    return crypto
        .createHash('sha256')
        .update(`favorite\0${targetPath}`)
        .digest('hex');
}

function publicWallpaper(record) {
    return {
        id: record.id,
        name: record.name,
        thumbUrl: record.thumbUrl,
        type: record.type,
        ext: record.ext,
        size: record.size,
        sizeFormatted: record.sizeFormatted,
        mtime: record.mtime,
        favoriteKey: record.favoriteKey
    };
}

function rememberWallpaper(inventoryMap, sourcePath, targetPath, ent, thumbPath, initialThumbUrl, isVideo, ext, stat) {
    const id = crypto
        .createHash('sha256')
        .update(sourcePath)
        .digest('hex');

    function formatBytes(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    const record = {
        id,
        sourcePath,
        targetPath,
        name: ent.name,
        thumbPath,
        thumbUrl: initialThumbUrl,
        type: isVideo ? 'VIDEO' : 'IMAGE',
        ext: ext.slice(1).toUpperCase(),
        size: stat.size,
        sizeFormatted: formatBytes(stat.size),
        mtime: stat.mtimeMs,
        favoriteKey: getFavoriteKey(targetPath),
        fingerprint: {
            device: stat.dev,
            inode: stat.ino,
            size: stat.size,
            mtimeMs: stat.mtimeMs
        }
    };

    inventoryMap.set(id, record);
    return publicWallpaper(record);
}

function getWallpaperRecord(id) {
    if (typeof id !== 'string') return null;
    return wallpaperInventory.get(id) || null;
}

async function revalidateRecord(record) {
    try {
        const currentTarget = await fsp.realpath(record.sourcePath);
        if (currentTarget !== record.targetPath) return false;

        const stat = await fsp.stat(currentTarget);
        if (!stat.isFile()) return false;

        const fp = record.fingerprint;
        return (
            stat.dev === fp.device &&
            stat.ino === fp.inode &&
            stat.size === fp.size &&
            stat.mtimeMs === fp.mtimeMs
        );
    } catch {
        return false;
    }
}

function replaceWallpaperInventory(newMap) {
    wallpaperInventory = newMap;
}

function getLiveInventory() {
    return wallpaperInventory;
}

module.exports = {
    rememberWallpaper,
    publicWallpaper,
    getWallpaperRecord,
    revalidateRecord,
    replaceWallpaperInventory,
    getLiveInventory,
    getFavoriteKey
};
