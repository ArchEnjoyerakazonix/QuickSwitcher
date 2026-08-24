const path = require('path');
const os = require('os');

function getDefaultWallpaperDirs(homeDir = os.homedir()) {
    return [
        path.join(homeDir, 'Pictures/wallpapers'),
        path.join(homeDir, 'Pictures/Wallpapers'),
        path.join(homeDir, 'Pictures/Wallpapers/Dynamic-Wallpapers'),
        path.join(homeDir, 'dotfiles/wallpapers'),
        path.join(homeDir, '.config/wallpapers'),
    ];
}

function createAppPaths({ configDir, cacheDir, homeDir = os.homedir() }) {
    return {
        CONFIG_DIR: configDir,
        THUMB_DIR: path.join(cacheDir, 'quickswitcher-thumbs'),
        FAV_FILE: path.join(configDir, 'favorites.json'),
        CUSTOM_FOLDERS_FILE: path.join(configDir, 'custom_folders.json'),
        STATE_FILE: path.join(configDir, 'state.json'),
        SET_WALL_SCRIPT: path.join(homeDir, '.config/hypr/wallpaper-daemon/set-wallpaper.sh'),
        CURRENT_CONF: path.join(homeDir, '.config/hypr/wallpaper-daemon/config/current.conf'),
        RESTORE_SCRIPT: path.join(homeDir, '.config/hypr/custom/scripts/__restore_video_wallpaper.sh'),
        VIDEO_PATH_FILE: path.join(homeDir, '.config/hypr/custom/scripts/__current_video_path.txt'),
        SWITCHWALL_SCRIPT: path.join(homeDir, '.config/quickshell/ii/scripts/colors/switchwall.sh')
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
    getDefaultWallpaperDirs,
    ...defaultPaths
};
