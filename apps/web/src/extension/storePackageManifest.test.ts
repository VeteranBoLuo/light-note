import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createStoreManifest,
  serializeStoreManifest,
} from '../../scripts/package-extension-manifest.mjs';

const sourceManifestPath = path.resolve(process.cwd(), 'extension/manifest.json');
const sourceManifest = JSON.parse(await fs.readFile(sourceManifestPath, 'utf8')) as Record<string, unknown>;

describe('Chrome Web Store manifest packaging', () => {
  it('removes only the development build key from the store manifest', () => {
    const storeManifest = createStoreManifest(sourceManifest);

    expect(sourceManifest.key).toBeTruthy();
    expect(storeManifest).not.toHaveProperty('key');
    expect(storeManifest.version).toBe(sourceManifest.version);
    expect(storeManifest.default_locale).toBe(sourceManifest.default_locale);
    expect(storeManifest.permissions).toEqual(sourceManifest.permissions);
    expect(storeManifest.host_permissions).toEqual(sourceManifest.host_permissions);
  });

  it('serializes a Web Store manifest without mutating the unpacked manifest', () => {
    const serialized = serializeStoreManifest(sourceManifest);

    expect(JSON.parse(serialized)).not.toHaveProperty('key');
    expect(sourceManifest).toHaveProperty('key');
  });
});
