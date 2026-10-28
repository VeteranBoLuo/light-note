import { afterEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chmod, mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prepareWebPageRendererRuntime } from './webPageRendererRuntime.js';

const execute = promisify(execFile);
const roots = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'web-render-runtime-test-'));
  roots.push(root);
  const sourceDirectory = path.join(root, 'private-deployment');
  const target = path.join(root, 'isolated');
  await mkdir(sourceDirectory, { mode: 0o700 });
  await mkdir(target, { mode: 0o700 });
  await writeFile(path.join(sourceDirectory, '.env'), 'DB_PASSWORD=must-not-leave-deployment\n', { mode: 0o600 });
  await writeFile(path.join(sourceDirectory, 'unrelated-service.js'), 'throw new Error("not a renderer dependency");');
  for (const filename of ['webPageRendererRunner.js', 'safeWebProxy.js', 'webUrlSafety.js']) {
    await writeFile(path.join(sourceDirectory, filename), 'export const marker = true;\n');
  }
  await writeFile(
    path.join(sourceDirectory, 'webPageRendererRunner.js'),
    'import { chromium } from "playwright-core"; import { marker } from "./safeWebProxy.js"; console.log(JSON.stringify({ok:Boolean(chromium)&&marker}));',
  );
  return { root, sourceDirectory, target };
}

describe('isolated renderer runtime', () => {
  it('从700私有部署目录准备可独立加载的最小运行包，保留部署与凭据权限', async () => {
    const { root, sourceDirectory, target } = await fixture();
    const runner = await prepareWebPageRendererRuntime(target, { sourceDirectory });
    const runtime = path.dirname(runner);
    expect((await readdir(runtime)).sort()).toEqual(
      ['node_modules', 'package.json', 'safeWebProxy.js', 'webPageRendererRunner.js', 'webUrlSafety.js'].sort(),
    );
    expect((await stat(sourceDirectory)).mode & 0o777).toBe(0o700);
    expect((await stat(path.join(sourceDirectory, '.env'))).mode & 0o777).toBe(0o600);
    expect((await stat(runtime)).mode & 0o777).toBe(0o755);
    expect((await stat(runner)).mode & 0o777).toBe(0o644);
    expect((await stat(path.join(runtime, 'node_modules/playwright-core'))).mode & 0o777).toBe(0o755);
    expect(JSON.parse(await readFile(path.join(runtime, 'package.json'), 'utf8'))).toEqual({
      private: true,
      type: 'module',
    });
    const { stdout } = await execute(process.execPath, [runner], { cwd: root, env: { NODE_ENV: 'production' } });
    expect(JSON.parse(stdout)).toEqual({ ok: true });
  });

  it('依赖包的私有权限不传播到副本，环境文件不进入运行包', async () => {
    const { sourceDirectory, target } = await fixture();
    const dependency = path.join(sourceDirectory, 'dependency');
    await mkdir(dependency, { mode: 0o700 });
    await writeFile(path.join(dependency, 'package.json'), '{}', { mode: 0o600 });
    await writeFile(path.join(dependency, '.env.local'), 'private', { mode: 0o600 });
    const runner = await prepareWebPageRendererRuntime(target, { sourceDirectory, playwrightDirectory: dependency });
    const copy = path.join(path.dirname(runner), 'node_modules/playwright-core');
    expect(await readdir(copy)).toEqual(['package.json']);
    expect((await stat(path.join(copy, 'package.json'))).mode & 0o777).toBe(0o644);
    expect((await stat(dependency)).mode & 0o777).toBe(0o700);
  });

  it('不允许运行包通过软链接触部署目录其他文件', async () => {
    const { sourceDirectory, target } = await fixture();
    const dependency = path.join(sourceDirectory, 'dependency');
    await mkdir(dependency, { mode: 0o700 });
    await symlink(path.join(sourceDirectory, '.env'), path.join(dependency, 'credentials'));
    await expect(
      prepareWebPageRendererRuntime(target, { sourceDirectory, playwrightDirectory: dependency }),
    ).rejects.toMatchObject({ code: 'RENDER_RUNTIME_UNSUPPORTED_FILE' });
    await chmod(dependency, 0o700);
  });
});
