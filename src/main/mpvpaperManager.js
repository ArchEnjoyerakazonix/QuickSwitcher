const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { queueJsonWrite, readJson } = require('./store');
const { spawn } = require('child_process');

function getPidRegistryPath(configDir) {
    return path.join(configDir || path.join(require('os').homedir(), '.config/QuickSwitcher'), 'mpvpaper_pids.json');
}

async function loadMpvpaperPids(configDir) {
    const file = getPidRegistryPath(configDir);
    return await readJson(file, []);
}

async function saveMpvpaperPids(configDir, pids) {
    const file = getPidRegistryPath(configDir);
    await fsp.mkdir(path.dirname(file), { recursive: true }).catch(() => {});
    await queueJsonWrite(file, pids);
}

async function isProcessOwnedMpvpaper(record) {
    try {
        const pid = record.pid;
        if (typeof pid !== 'number' || pid <= 0 || !Number.isSafeInteger(pid)) return false;

        const cmdline = await fsp.readFile(`/proc/${pid}/cmdline`, 'utf-8');
        if (!cmdline.includes('mpvpaper')) return false;

        const statFile = await fsp.readFile(`/proc/${pid}/stat`, 'utf-8');
        const statParts = statFile.split(') ')[1].split(' ');
        const startTime = statParts[19];
        
        if (String(startTime) !== String(record.startTime)) return false;

        const exe = await fsp.readlink(`/proc/${pid}/exe`);
        if (exe !== record.executable) return false;

        return true;
    } catch {
        return false;
    }
}

async function stopOwnedMpvpaper(configDir) {
    const pids = await loadMpvpaperPids(configDir);
    const owned = [];
    for (const record of pids) {
        if (await isProcessOwnedMpvpaper(record)) {
            owned.push(record);
        }
    }

    for (const record of owned) {
        try {
            process.kill(record.pid, 'SIGTERM');
        } catch {}
    }

    // Wait for exit
    for (let i = 0; i < 10; i++) {
        let allDead = true;
        for (const record of owned) {
            if (await isProcessOwnedMpvpaper(record)) {
                allDead = false;
                break;
            }
        }
        if (allDead) break;
        await new Promise(r => setTimeout(r, 100));
    }

    // Escalate to SIGKILL if still alive
    for (const record of owned) {
        if (await isProcessOwnedMpvpaper(record)) {
            try {
                process.kill(record.pid, 'SIGKILL');
            } catch {}
        }
    }

    await saveMpvpaperPids(configDir, []);
}

async function terminateOwnedPids(records) {
    for (const record of records) {
        if (await isProcessOwnedMpvpaper(record)) {
            try {
                process.kill(record.pid, 'SIGKILL');
            } catch {}
        }
    }
}

async function spawnMpvpaperMonitor(mon, filepath, spawnFn = spawn) {
    return new Promise((resolve, reject) => {
        const child = spawnFn(
            'mpvpaper',
            ['-f', '-o', 'no-audio --loop-file=inf --panscan=1.0 --hwdec=auto', mon, filepath],
            { detached: true, stdio: 'ignore' }
        );

        let settled = false;

        child.once('error', (err) => {
            if (!settled) {
                settled = true;
                reject(err);
            }
        });

        child.once('exit', (code) => {
            if (!settled) {
                settled = true;
                reject(new Error(`mpvpaper exited immediately with code ${code}`));
            }
        });

        child.once('spawn', () => {
            setTimeout(async () => {
                if (!settled && child.exitCode === null) {
                    settled = true;
                    try {
                        const pid = child.pid;
                        const statFile = await fsp.readFile(`/proc/${pid}/stat`, 'utf-8');
                        const statParts = statFile.split(') ')[1].split(' ');
                        const startTime = statParts[19];
                        const exe = await fsp.readlink(`/proc/${pid}/exe`);

                        const record = {
                            pid,
                            startTime,
                            executable: exe,
                            monitor: mon
                        };
                        
                        child.unref();
                        resolve(record);
                    } catch (err) {
                        try {
                            process.kill(child.pid, 'SIGKILL');
                        } catch {}
                        reject(err);
                    }
                }
            }, 300);
        });
    });
}

module.exports = {
    loadMpvpaperPids,
    saveMpvpaperPids,
    isProcessOwnedMpvpaper,
    stopOwnedMpvpaper,
    terminateOwnedPids,
    spawnMpvpaperMonitor
};
