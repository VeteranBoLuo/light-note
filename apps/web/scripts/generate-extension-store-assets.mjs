import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(scriptDirectory, '..');
const assetRoot = path.join(webRoot, 'store-assets/chrome');
// 官网与扩展落地页展示用的 WebP 副本；商店提交仍使用 assetRoot 下的 PNG。
const displayRoot = path.join(webRoot, 'src/assets/img/browser-extension');
const DISPLAY_COPIES_FLAG = '--display-copies';
const displayCopiesOnly = process.argv[2] === DISPLAY_COPIES_FLAG;
const captureRoot = process.argv[2] && !displayCopiesOnly ? path.resolve(process.argv[2]) : '';
const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'light-note-store-assets-'));

const screenshotViews = [
  ['home', '01-home.png'],
  ['bookmark', '02-bookmark.png'],
  ['note', '03-note.png'],
  ['file', '04-file.png'],
];

async function ensureFile(filePath) {
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`Missing store capture: ${filePath}`);
  }
}

async function writeRgbPng(canvas, outputPath, temporaryName) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const rgbaPath = path.join(temporaryRoot, `${temporaryName}-rgba.png`);
  await fs.writeFile(rgbaPath, canvas.toBuffer('image/png'));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', rgbaPath, '-vf', 'format=rgb24', outputPath], {
    stdio: 'inherit',
  });
}

async function writeDisplayWebp(canvas, outputDirectory, outputName) {
  const outputPath = path.join(displayRoot, outputDirectory, outputName.replace(/\.png$/, '.webp'));
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, await canvas.encode('webp', 85));
}

async function writeDisplayCopiesFromStorePngs() {
  for (const outputDirectory of ['localized', 'global']) {
    for (const [, outputName] of screenshotViews) {
      const image = await loadImage(path.join(assetRoot, 'screenshots', outputDirectory, outputName));
      const canvas = createCanvas(image.width, image.height);
      canvas.getContext('2d').drawImage(image, 0, 0);
      await writeDisplayWebp(canvas, outputDirectory, outputName);
    }
  }
}

async function renderSvg(sourceName, outputName, width, height) {
  const source = await fs.readFile(path.join(assetRoot, sourceName));
  const image = await loadImage(source);
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  await writeRgbPng(canvas, path.join(assetRoot, outputName), outputName.replaceAll('/', '-'));
}

async function composeScreenshots({ locale, capturePrefix, brandPanelName, outputDirectory }) {
  const brandSource = await fs.readFile(path.join(assetRoot, brandPanelName));
  const brandPanel = await loadImage(brandSource);

  for (const [view, outputName] of screenshotViews) {
    const capturePath = path.join(captureRoot, `${capturePrefix}-${view}.png`);
    await ensureFile(capturePath);
    const capture = await loadImage(capturePath);
    if (capture.width !== 760 || capture.height !== 800) {
      throw new Error(
        `Unexpected ${locale} ${view} capture size: ${capture.width}x${capture.height}; expected 760x800`,
      );
    }

    const canvas = createCanvas(1280, 800);
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 1280, 800);
    context.drawImage(brandPanel, 0, 0, 520, 800);
    context.drawImage(capture, 520, 0, 760, 800);

    await writeRgbPng(canvas, path.join(assetRoot, 'screenshots', outputDirectory, outputName), `${locale}-${view}`);
    await writeDisplayWebp(canvas, outputDirectory, outputName);
  }
}

async function generateStoreAssets() {
  if (!captureRoot) {
    throw new Error(
      `Usage: node scripts/generate-extension-store-assets.mjs <directory-with-zh/en-*.png-captures> | ${DISPLAY_COPIES_FLAG}`,
    );
  }

  await composeScreenshots({
    locale: 'zh-CN',
    capturePrefix: 'zh',
    brandPanelName: 'screenshot-brand-panel.svg',
    outputDirectory: 'localized',
  });
  await composeScreenshots({
    locale: 'en',
    capturePrefix: 'en',
    brandPanelName: 'screenshot-brand-panel-en.svg',
    outputDirectory: 'global',
  });
  await renderSvg('promo-small-440x280.svg', 'promo-small-440x280.png', 440, 280);
  await renderSvg('promo-marquee-1400x560.svg', 'promo-marquee-1400x560.png', 1400, 560);

  console.log(`Generated Chrome Web Store assets in ${assetRoot}`);
}

try {
  if (displayCopiesOnly) {
    // 只从现有商店 PNG 重新生成落地页 WebP 副本，不需要原始截图。
    await writeDisplayCopiesFromStorePngs();
    console.log(`Generated landing WebP copies in ${displayRoot}`);
  } else {
    await generateStoreAssets();
  }
} finally {
  await fs.rm(temporaryRoot, { recursive: true, force: true });
}
