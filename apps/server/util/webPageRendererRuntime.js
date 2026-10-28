import { chmod, cp, mkdir, readdir, realpath, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const SOURCE_DIRECTORY = fileURLToPath(new URL('.', import.meta.url));
const RUNNER_FILES = ['webPageRendererRunner.js', 'safeWebProxy.js', 'webUrlSafety.js'];

async function normalizeRuntimePermissions(directory) {
  await chmod(directory, 0o755);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await normalizeRuntimePermissions(filename);
    else if (entry.isFile()) await chmod(filename, 0o644);
    else throw Object.assign(new Error('RENDER_RUNTIME_UNSUPPORTED_FILE'), { code: 'RENDER_RUNTIME_UNSUPPORTED_FILE' });
  }
}

// root 私有的部署目录不向渲染身份开放。只复制公开运行代码，父目录与代码继续由父进程持有；
// Chromium 的可写 HOME 另行创建，不能替换 Runner 或依赖。每次任务结束后整包清理。
export async function prepareWebPageRendererRuntime(
  temporaryRoot,
  {
    sourceDirectory = SOURCE_DIRECTORY,
    playwrightDirectory = path.dirname(require.resolve('playwright-core/package.json')),
  } = {},
) {
  const runtimeDirectory = path.join(temporaryRoot, 'runtime');
  await mkdir(runtimeDirectory, { mode: 0o700 });
  for (const filename of RUNNER_FILES) {
    await cp(path.join(sourceDirectory, filename), path.join(runtimeDirectory, filename));
  }
  await writeFile(path.join(runtimeDirectory, 'package.json'), '{"private":true,"type":"module"}\n', { mode: 0o600 });
  const dependencyDirectory = path.join(runtimeDirectory, 'node_modules');
  await mkdir(dependencyDirectory, { mode: 0o700 });
  await cp(await realpath(playwrightDirectory), path.join(dependencyDirectory, 'playwright-core'), {
    recursive: true,
    filter: (filename) => !path.basename(filename).startsWith('.env'),
  });
  await normalizeRuntimePermissions(runtimeDirectory);
  return path.join(runtimeDirectory, 'webPageRendererRunner.js');
}
