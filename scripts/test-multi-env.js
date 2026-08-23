#!/usr/bin/env node

const { execFileSync } = require('child_process');
const path = require('path');
const rootDir = path.resolve(__dirname, '..');

const images = [
    { name: 'Node 20 Slim (Debian/Ubuntu base)', image: 'node:20-slim' },
    { name: 'Node 22 Slim (Debian/Ubuntu base)', image: 'node:22-slim' },
    { name: 'Alpine Linux (musl libc)', image: 'node:22-alpine' }
];

console.log('=====================================================');
console.log(' QuickSwitcher Multi-Environment Sandbox Verification');
console.log('=====================================================\n');

let allPassed = true;

for (const env of images) {
    process.stdout.write(`Testing in [${env.name}] (${env.image})... `);
    try {
        const cmd = [
            'run', '--rm',
            '-v', `${rootDir}:/app:ro`,
            '-w', '/tmp',
            env.image,
            'sh', '-c',
            'mkdir -p /tmp/pkg && cp -r /app/src /tmp/pkg/ && cp -r /app/test /tmp/pkg/ && cp /app/package.json /tmp/pkg/ && cd /tmp/pkg && node --check src/main/index.js src/main/wallpaperAdapter.js src/main/wallpaperInventory.js src/main/mpvpaperManager.js src/main/pathPolicy.js src/main/thumbnailPolicy.js src/main/appPaths.js src/main/store.js src/main/ipcValidation.js && node --test test/*.test.js'
        ];

        execFileSync('podman', cmd, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 });
        console.log('PASSED');
    } catch (err) {
        console.log('FAILED');
        if (err.stderr) console.error(err.stderr.toString());
        else if (err.stdout) console.error(err.stdout.toString());
        else console.error(err.message);
        allPassed = false;
    }
}

console.log('\n=====================================================');
if (allPassed) {
    console.log('All multi-environment container tests PASSED successfully!');
    process.exit(0);
} else {
    console.error('Some container tests failed.');
    process.exit(1);
}
