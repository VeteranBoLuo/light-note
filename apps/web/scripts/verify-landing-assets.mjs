import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const landingPath = path.join(webRoot, 'src/view/landing/Landing.vue');
const screenshotRoot = path.join(webRoot, 'public/screenshots');
const maxAssetBytes = 128 * 1024;
const expectedAssets = [
  'bookmark-900.webp',
  'bookmark-1800.webp',
  'note1-900.webp',
  'note1-1800.webp',
  'cloud-space-900.webp',
  'cloud-space-1800.webp',
  'mobile-900.webp',
  'require-900.webp',
  'require-1800.webp',
];

const landingSource = await readFile(landingPath, 'utf8');
const legacyRuntimeReferences = ['bookmark.png', 'note1.png', 'cloud-space.png', 'mobile.png', 'require.png'].filter(
  (fileName) => landingSource.includes(`/screenshots/${fileName}`),
);

if (legacyRuntimeReferences.length > 0) {
  throw new Error(`官网仍在运行时引用大体积 PNG：${legacyRuntimeReferences.join(', ')}`);
}

const oversized = [];
for (const fileName of expectedAssets) {
  const metadata = await stat(path.join(screenshotRoot, fileName));
  if (metadata.size > maxAssetBytes) oversized.push(`${fileName} (${Math.ceil(metadata.size / 1024)} KiB)`);
}

if (oversized.length > 0) {
  throw new Error(`官网预览图超过 ${maxAssetBytes / 1024} KiB 门禁：${oversized.join(', ')}`);
}

console.log(`官网预览图检查通过：${expectedAssets.length} 个 WebP 均不超过 ${maxAssetBytes / 1024} KiB`);
