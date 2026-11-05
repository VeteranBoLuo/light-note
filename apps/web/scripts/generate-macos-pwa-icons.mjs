import fs from 'node:fs/promises';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const publicRoot = new URL('../public/', import.meta.url);
const artwork = await loadImage(await fs.readFile(new URL('favicon.svg', publicRoot)));
const source = createCanvas(artwork.width, artwork.height);
const sourceContext = source.getContext('2d');
sourceContext.drawImage(artwork, 0, 0);
const { data } = sourceContext.getImageData(0, 0, source.width, source.height);
let left = source.width;
let top = source.height;
let right = 0;
let bottom = 0;
for (let y = 0; y < source.height; y++) {
  for (let x = 0; x < source.width; x++) {
    if (!data[(y * source.width + x) * 4 + 3]) continue;
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x + 1);
    bottom = Math.max(bottom, y + 1);
  }
}
if (right <= left || bottom <= top) throw new Error('品牌标识为空，无法生成 macOS 图标');

// 桌面图标保留同一笺结轮廓和底板，主体占 75%；不覆盖移动端的安全区图稿。
for (const size of [192, 512]) {
  const canvas = createCanvas(size, size);
  const context = canvas.getContext('2d');
  const background = context.createLinearGradient(0, 0, size, size);
  background.addColorStop(0, '#ffffff');
  background.addColorStop(1, '#eeebff');
  context.fillStyle = background;
  context.fillRect(0, 0, size, size);
  const artworkSize = size * 0.75;
  const offset = (size - artworkSize) / 2;
  context.drawImage(source, left, top, right - left, bottom - top, offset, offset, artworkSize, artworkSize);
  await fs.writeFile(new URL(`icon-macos-${size}.png`, publicRoot), canvas.toBuffer('image/png'));
}

console.log('Generated macOS PWA icons; mobile artwork unchanged.');
