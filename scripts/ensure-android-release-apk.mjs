#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform, Readable } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ANDROID_RELEASE } from '../packages/shared/index.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OFFICIAL_ORIGIN = 'https://boluo66.top';

export function apkPath(root, downloadPath, destination = 'public') {
  if (!/^\/downloads\/android\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.apk$/.test(downloadPath)) {
    throw new Error('Android 安装包路径不符合官网下载目录约定');
  }
  return join(root, 'apps/web', destination, downloadPath.slice(1));
}

export async function verifyApk(path, release) {
  const info = await stat(path);
  if (!info.isFile() || info.size !== release.fileSizeBytes) {
    throw new Error(`Android 安装包大小不符：${path}`);
  }
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  if (hash.digest('hex') !== release.sha256) {
    throw new Error(`Android 安装包 SHA-256 不符：${path}`);
  }
}

export async function ensureApk(root, release, fetchImpl = fetch) {
  if (!release.released) return;
  const path = apkPath(root, release.downloadPath);
  try {
    await verifyApk(path, release);
    return;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const url = new URL(release.downloadPath, OFFICIAL_ORIGIN);
  const response = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(20_000) });
  if (!response.ok || !response.body) {
    throw new Error(`线上 Android 安装包不可获取：HTTP ${response.status}`);
  }
  const temp = `${path}.incoming-${randomUUID()}`;
  await mkdir(dirname(path), { recursive: true });
  let received = 0;
  try {
    await pipeline(
      Readable.fromWeb(response.body),
      new Transform({
        transform(chunk, _encoding, callback) {
          received += chunk.length;
          callback(received <= release.fileSizeBytes ? null : new Error('线上 Android 安装包超出公示大小'), chunk);
        },
      }),
      createWriteStream(temp, { flags: 'wx' }),
    );
    await verifyApk(temp, release);
    await rename(temp, path);
    console.log(`已从官网恢复并校验 Android 安装包：${release.downloadPath}`);
  } finally {
    await rm(temp, { force: true });
  }
}

async function main() {
  if (!ANDROID_RELEASE.released) return;
  if (process.argv[2] === '--verify-dist') {
    await verifyApk(apkPath(ROOT, ANDROID_RELEASE.downloadPath, 'dist'), ANDROID_RELEASE);
    console.log('Web 构建产物中的 Android 安装包与发布记录一致');
    return;
  }
  if (process.argv.length > 2) throw new Error('未知参数');
  await ensureApk(ROOT, ANDROID_RELEASE);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
