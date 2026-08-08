const path = require('path');
const os = require('os');

function createAppPaths({ configDir, cacheDir, homeDir }) {
    return {
        CONFIG_DIR: configDir,
        THUMB_DIR: path.join(cacheDir, 'quickswitcher-thumbs'),
        FAV_FILE: path.join(configDir, 'favorites.json'),
        CUSTOM_FOLDERS_FILE: path.join(configDir, 'custom_folders.json'),
        STATE_FILE: path.join(configDir, 'state.json'),
        SET_WALL_SCRIPT: path.join(homeDir, '.config/hypr/wallpaper-daemon/set-wallpaper.sh')
    };
}

// Default paths (fallback for scripts and testing)
const defaultPaths = createAppPaths({
    configDir: process.env.QUICKSWITCHER_CONFIG_DIR || path.join(os.homedir(), '.config/QuickSwitcher'),
    cacheDir: process.env.QUICKSWITCHER_CACHE_DIR || path.join(os.homedir(), '.cache'),
    homeDir: os.homedir()
});

module.exports = {
    createAppPaths,
    ...defaultPaths
};
