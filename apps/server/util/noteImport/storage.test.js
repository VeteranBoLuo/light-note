import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
let root;
afterEach(async () => { vi.unstubAllEnvs(); vi.resetModules(); if (root) await fs.rm(root, { recursive: true, force: true }); });
describe('import staging ownership', () => {
  it('only advertises real local task directories, excluding symlinks and unrelated entries', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'ln-staging-'));
    vi.stubEnv('NOTE_IMPORT_STORAGE_DIR', root);
    vi.resetModules();
    const { localImportTaskIds } = await import('./storage.js');
    const local = '11111111-1111-4111-8111-111111111111';
    await fs.mkdir(path.join(root, local));
    await fs.mkdir(path.join(root, 'unrelated'));
    await fs.symlink(path.join(root, local), path.join(root, '22222222-2222-4222-8222-222222222222'));
    expect(await localImportTaskIds()).toEqual([local]);
    expect(await localImportTaskIds({ readyOnly: true })).toEqual([]);
    await fs.mkdir(path.join(root, local, 'uploads'));
    await fs.writeFile(path.join(root, local, 'uploads', 'file.json'), '{}');
    expect(await localImportTaskIds({ readyOnly: true })).toEqual([local]);
  });
  it('has no claimable tasks before this host has received an upload', async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'ln-staging-'));
    vi.stubEnv('NOTE_IMPORT_STORAGE_DIR', path.join(root, 'missing'));
    vi.resetModules();
    const { localImportTaskIds } = await import('./storage.js');
    expect(await localImportTaskIds()).toEqual([]);
  });
});
