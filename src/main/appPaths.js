const path = require('path');
const os = require('os');

const CONFIG_DIR = process.env.QUICKSWITCHER_CONFIG_DIR || path.join(os.homedir(), '.config/QuickSwitcher');
const THUMB_DIR = process.env.QUICKSWITCHER_CACHE_DIR || path.join(os.homedir(), '.cache/quickswitcher-thumbs');

module.exports = {
    CONFIG_DIR,
    THUMB_DIR,
    FAV_FILE: path.join(CONFIG_DIR, 'favorites.json'),
    CUSTOM_FOLDERS_FILE: path.join(CONFIG_DIR, 'custom_folders.json'),
    SET_WALL_SCRIPT: path.join(os.homedir(), '.config/hypr/wallpaper-daemon/set-wallpaper.sh'),
    STATE_FILE: path.join(CONFIG_DIR, 'state.json')
};
