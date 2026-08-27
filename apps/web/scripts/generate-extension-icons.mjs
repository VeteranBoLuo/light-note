import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(scriptDirectory, '..');
const outputRoot = path.join(webRoot, 'extension/icons');

// 与 public/favicon.svg 共用同一品牌轮廓和颜色，但裁掉 SVG 自身留白。
// Chrome Web Store 的 128px 方形图标使用 96px 主体和四周 16px 透明区；
// 其余大尺寸保持相同视觉比例，小尺寸工具栏图标适度放大以保证辨识度。
const iconSizes = new Map([
  [16, 14],
  [32, 28],
  [48, 38],
  [128, 96],
  [192, 144],
  [512, 384],
]);

function logoSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="12 12 232 232">
    <g transform="translate(128 128) scale(1.1153846154) translate(-128 -128)">
      <path d="M132 24h48c28.72 0 52 23.28 52 52v48h-48l-52-52V24z" fill="#8079f8"/>
      <path d="M132 24h48c28.72 0 52 23.28 52 52v48h-48l-52-52V24z" fill="#655eed" transform="rotate(90 128 128)"/>
      <path d="M132 24h48c28.72 0 52 23.28 52 52v48h-48l-52-52V24z" fill="#5047d5" transform="rotate(180 128 128)"/>
      <path d="M132 24h48c28.72 0 52 23.28 52 52v48h-48l-52-52V24z" fill="#a09bfc" transform="rotate(270 128 128)"/>
    </g>
  </svg>`;
}

await fs.mkdir(outputRoot, { recursive: true });

for (const [canvasSize, artworkSize] of iconSizes) {
  const canvas = createCanvas(canvasSize, canvasSize);
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvasSize, canvasSize);
  const artwork = await loadImage(Buffer.from(logoSvg(artworkSize)));
  const offset = (canvasSize - artworkSize) / 2;
  context.drawImage(artwork, offset, offset, artworkSize, artworkSize);
  await fs.writeFile(path.join(outputRoot, `icon-${canvasSize}.png`), canvas.toBuffer('image/png'));
}

console.log(`Generated transparent extension icons in ${outputRoot}`);
