const crypto = require('crypto');
const path = require('path');

function getThumbPath(thumbDir, targetPath, stat) {
    const fingerprint = [
        targetPath,
        stat.size,
        Math.trunc(stat.mtimeMs)
    ].join('\0');

    const hash = crypto
        .createHash('sha256')
        .update(fingerprint)
        .digest('hex');

    return path.join(thumbDir, `${hash}.jpg`);
}

module.exports = { getThumbPath };
