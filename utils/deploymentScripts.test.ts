import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';

interface PackageManifest {
    scripts?: Record<string, string>;
}

const readPackageManifest = async (): Promise<PackageManifest> => {
    const rawManifest = await readFile(join(process.cwd(), 'package.json'), 'utf8');
    return JSON.parse(rawManifest) as PackageManifest;
};

test('package scripts keep Render deploy artifact checks wired', async () => {
    const manifest = await readPackageManifest();
    const scripts = manifest.scripts ?? {};

    assert.equal(scripts.postinstall, 'npm run build');
    assert.equal(scripts.start, 'node dist/index.js');
    assert.match(scripts.test ?? '', /dist\/http\/\*\.test\.js/);
    assert.match(scripts['verify:deploy'] ?? '', /npm ci --omit=dev --dry-run/);
    assert.match(scripts['verify:deploy'] ?? '', /dist\/index\.js/);
});
