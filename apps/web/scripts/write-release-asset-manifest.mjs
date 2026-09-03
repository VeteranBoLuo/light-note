import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = path.join(webRoot, 'dist');
const assetsRoot = path.join(distRoot, 'assets');
const manifestPath = path.join(distRoot, '.lightnote-release-assets');

async function collectFiles(directory, relativeDirectory = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path.join(directory, entry.name), relativePath)));
    } else if (entry.isFile()) {
      files.push(path.posix.join('assets', relativePath));
    }
  }
  return files;
}

const assets = (await collectFiles(assetsRoot)).sort();
if (assets.length === 0) throw new Error('构建产物 assets 为空，拒绝生成发布清单');

await writeFile(manifestPath, `${assets.join('\n')}\n`, 'utf8');
console.log(`已记录 ${assets.length} 个当前版本静态资源：${path.relative(webRoot, manifestPath)}`);
