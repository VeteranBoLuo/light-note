import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(webRoot, 'src');
const landingPath = path.join(sourceRoot, 'view/landing/Landing.vue');
const screenshotRoot = path.join(webRoot, 'public/screenshots');
const storeScreenshotRoot = path.join(webRoot, 'store-assets/chrome/screenshots');
const extensionDisplayRoot = path.join(sourceRoot, 'assets/img/browser-extension');
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

// 商店截图是约 300 KiB 的 PNG，只供 Chrome 商店提交；页面必须引用同名 WebP 展示副本。
const storeReferences = [];
for (const entry of await readdir(sourceRoot, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile() || !/\.(vue|ts)$/.test(entry.name) || /\.test\.ts$/.test(entry.name)) continue;
  const filePath = path.join(entry.parentPath, entry.name);
  if ((await readFile(filePath, 'utf8')).includes('store-assets/'))
    storeReferences.push(path.relative(webRoot, filePath));
}

if (storeReferences.length > 0) {
  throw new Error(
    `页面不得直接引用商店截图 PNG，请改用 src/assets/img/browser-extension 下的 WebP：${storeReferences.join(', ')}`,
  );
}

const displayAssets = [];
for (const directory of ['localized', 'global']) {
  for (const fileName of await readdir(path.join(storeScreenshotRoot, directory))) {
    if (fileName.endsWith('.png')) displayAssets.push(path.join(directory, fileName.replace(/\.png$/, '.webp')));
  }
}

const missingDisplayAssets = [];
const oversized = [];
const checkSize = async (filePath, label) => {
  const metadata = await stat(filePath).catch(() => null);
  if (!metadata) missingDisplayAssets.push(label);
  else if (metadata.size > maxAssetBytes) oversized.push(`${label} (${Math.ceil(metadata.size / 1024)} KiB)`);
};
for (const fileName of expectedAssets) await checkSize(path.join(screenshotRoot, fileName), fileName);
for (const fileName of displayAssets) await checkSize(path.join(extensionDisplayRoot, fileName), fileName);

if (missingDisplayAssets.length > 0) {
  throw new Error(
    `缺少官网预览图：${missingDisplayAssets.join(', ')}；扩展截图副本用 pnpm --filter web generate:extension-store-assets --display-copies 生成`,
  );
}

if (oversized.length > 0) {
  throw new Error(`官网预览图超过 ${maxAssetBytes / 1024} KiB 门禁：${oversized.join(', ')}`);
}

console.log(
  `官网预览图检查通过：${expectedAssets.length + displayAssets.length} 个 WebP 均不超过 ${maxAssetBytes / 1024} KiB`,
);
