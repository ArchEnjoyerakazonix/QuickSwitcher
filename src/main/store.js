const fsp = require('fs').promises;
const crypto = require('crypto');

let writeSequence = Promise.resolve();

async function writeJsonAtomic(filePath, data) {
    const tempFile = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    try {
        await fsp.writeFile(
            tempFile,
            JSON.stringify(data, null, 2),
            {
                encoding: 'utf8',
                mode: 0o600
            }
        );
        await fsp.rename(tempFile, filePath);
    } catch (e) {
        await fsp.unlink(tempFile).catch(() => {});
        throw e;
    }
}

function queueJsonWrite(filePath, data) {
    const operation = writeSequence.then(() =>
        writeJsonAtomic(filePath, data)
    );
    writeSequence = operation.catch(() => {});
    return operation;
}

async function readJson(filePath, fallback) {
    try {
        const data = await fsp.readFile(filePath, 'utf-8');
        return JSON.parse(data);
    } catch {
        return fallback;
    }
}

function updateJson(filePath, fallback, mutator) {
    const operation = writeSequence.then(async () => {
        const current = await readJson(filePath, fallback);
        const updated = await mutator(current);
        await writeJsonAtomic(filePath, updated);
        return updated;
    });
    writeSequence = operation.catch(() => {});
    return operation;
}

module.exports = { queueJsonWrite, writeJsonAtomic, readJson, updateJson };
