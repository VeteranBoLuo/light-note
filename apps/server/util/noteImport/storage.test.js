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

it('publishes readable images while keeping staged originals private, including retries', async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'ln-image-mode-'));
  const source = path.join(root, 'private.png');
  const destination = path.join(root, 'published', 'image.png');
  await fs.writeFile(source, 'image bytes', { mode: 0o600 });
  const { publishImportImage } = await import('./storage.js');
  await publishImportImage(source, destination);
  expect((await fs.stat(source)).mode & 0o777).toBe(0o600);
  expect((await fs.stat(destination)).mode & 0o777).toBe(0o644);
  await fs.chmod(destination, 0o600);
  await publishImportImage(source, destination);
  expect((await fs.stat(destination)).mode & 0o777).toBe(0o644);
  expect(await fs.readFile(destination, 'utf8')).toBe('image bytes');
});
