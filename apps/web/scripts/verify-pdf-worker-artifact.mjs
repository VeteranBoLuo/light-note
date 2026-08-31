import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(scriptDirectory, '..');
const distRoot = path.join(webRoot, 'dist');
const printPathOnly = process.argv.includes('--print-path');

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(directory, entry.name);
      return entry.isDirectory() ? listFiles(absolutePath) : [absolutePath];
    }),
  );
  return nested.flat();
}

function fail(message) {
  throw new Error(`PDF Worker 发布门禁失败：${message}`);
}

const files = await listFiles(distRoot);
const workerFiles = files.filter((filePath) =>
  /^pdf\.worker(?:\.min)?-[^.]+\.(?:mjs|js)$/u.test(path.basename(filePath)),
);
const moduleWorkers = workerFiles.filter((filePath) => filePath.endsWith('.mjs'));
if (moduleWorkers.length) {
  fail(`仍生成 .mjs 产物：${moduleWorkers.map((filePath) => path.relative(distRoot, filePath)).join(', ')}`);
}

const javascriptWorkers = [];
for (const filePath of workerFiles.filter((candidate) => candidate.endsWith('.js'))) {
  const fileStat = await stat(filePath);
  if (fileStat.size >= 100_000) javascriptWorkers.push({ filePath, size: fileStat.size });
}
if (javascriptWorkers.length !== 1) {
  fail(`应生成且仅生成一个独立 .js Worker，实际找到 ${javascriptWorkers.length} 个`);
}

const worker = javascriptWorkers[0];
const relativePath = path.relative(distRoot, worker.filePath).split(path.sep).join('/');
if (printPathOnly) process.stdout.write(relativePath);
else console.log(`PDF Worker 产物检查通过：${relativePath} (${worker.size} bytes)`);
