const path = require('path');

function isInsideRoots(targetPath, roots) {
    return roots.some(root => {
        try {
            const relative = path.relative(root, targetPath);
            return (
                relative !== '' &&
                relative !== '..' &&
                !relative.startsWith(`..${path.sep}`) &&
                !path.isAbsolute(relative)
            );
        } catch {
            return false;
        }
    });
}

module.exports = { isInsideRoots };
