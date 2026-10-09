import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, test } from 'node:test';
import { apkPath, ensureApk, verifyApk } from './ensure-android-release-apk.mjs';

const roots = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'light-note-apk-'));
  roots.push(root);
  const bytes = Buffer.from('signed-release-apk');
  const release = {
    released: true,
    downloadPath: '/downloads/android/light-note-1.0.2.apk',
    fileSizeBytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
  return { root, bytes, release, path: apkPath(root, release.downloadPath) };
}

test('工作树缺少 APK 时从官网恢复并校验后才允许部署', async () => {
  const { root, bytes, release, path } = await setup();
  let requests = 0;
  await ensureApk(root, release, (url, options) => {
    requests += 1;
    assert.equal(String(url), 'https://boluo66.top/downloads/android/light-note-1.0.2.apk');
    assert.equal(options.redirect, 'error');
    return new Response(bytes);
  });
  assert.equal(requests, 1);
  assert.deepEqual(await readFile(path), bytes);
  await ensureApk(root, release, () => { throw new Error('不应重复下载'); });
});

test('现有文件损坏和线上内容不匹配时失败，保留可诊断状态', async () => {
  const { root, bytes, release, path } = await setup();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, Buffer.from('corrupt'));
  await assert.rejects(ensureApk(root, release, () => { throw new Error('不应下载'); }), /大小不符/);
  await rm(path);
  await assert.rejects(ensureApk(root, release, () => new Response(Buffer.from('wrong-size'))), /超出公示大小|大小不符/);
  await assert.rejects(readFile(path), { code: 'ENOENT' });
  await assert.rejects(ensureApk(root, release, () => new Response(Buffer.alloc(bytes.length))), /SHA-256 不符/);
  await assert.rejects(readFile(path), { code: 'ENOENT' });
});

test('构建目录的 APK 必须存在且与公示哈希一致', async () => {
  const { root, bytes, release } = await setup();
  const path = apkPath(root, release.downloadPath, 'dist');
  await assert.rejects(verifyApk(path, release), { code: 'ENOENT' });
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  await verifyApk(path, release);
  assert.throws(() => apkPath(root, '/downloads/android/../bad.apk'), /目录约定/);
});
