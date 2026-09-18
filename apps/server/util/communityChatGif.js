import { CommunityChatError } from './services/communityChatAccessService.js';

const MAX_FRAMES = 200;
const MAX_CANVAS_PIXELS = 40_000_000;

// GIF89a block grammar: https://www.w3.org/Graphics/GIF/spec-gif89a.txt
// Inspect bounded metadata without decoding or re-encoding the animation.
export function validateCommunityChatGif(bytes) {
  const invalid = () => {
    throw new CommunityChatError(
      'CUSTOM_STICKER_GIF_INVALID',
      400,
      'GIF 内容不完整或格式无效，请换一张动图',
      'The GIF is incomplete or invalid. Try another GIF.',
    );
  };
  const limited = () => {
    throw new CommunityChatError(
      'CUSTOM_STICKER_GIF_LIMIT_EXCEEDED',
      400,
      'GIF 尺寸或帧数过大，请缩小动图后重试',
      'The GIF dimensions or frame count are too large.',
    );
  };
  let offset = 0;
  const take = (length) => {
    if (offset + length > bytes.length) invalid();
    const start = offset;
    offset += length;
    return start;
  };
  const byte = () => bytes[take(1)];
  const word = (at) => bytes[at] | (bytes[at + 1] << 8);
  const blocks = () => {
    let size;
    let total = 0;
    while ((size = byte()) !== 0) {
      take(size);
      total += size;
    }
    return total;
  };
  take(13);
  if (!['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'))) invalid();
  const width = word(6);
  const height = word(8);
  if (!width || !height) invalid();
  const globalPalette = Boolean(bytes[10] & 0x80);
  if (globalPalette) take(3 * 2 ** ((bytes[10] & 7) + 1));
  let frames = 0;
  while (offset < bytes.length) {
    const marker = byte();
    if (marker === 0x3b) {
      if (!frames || offset !== bytes.length) invalid();
      return { width, height, frames };
    }
    if (marker === 0x21) {
      const label = byte();
      if (label === 0xf9) {
        if (byte() !== 4) invalid();
        take(4);
        if (byte() !== 0) invalid();
      } else if (label === 0xff) {
        if (byte() !== 11) invalid();
        take(11);
        blocks();
      } else if (label === 0xfe) {
        blocks();
      } else {
        // Plain-text rendering and unknown extensions are not sticker images.
        invalid();
      }
      continue;
    }
    if (marker !== 0x2c) invalid();
    const at = take(9);
    const frameWidth = word(at + 4);
    const frameHeight = word(at + 6);
    if (!frameWidth || !frameHeight || word(at) + frameWidth > width || word(at + 2) + frameHeight > height) invalid();
    frames += 1;
    if (frames > MAX_FRAMES || width * height * frames > MAX_CANVAS_PIXELS) limited();
    const packed = bytes[at + 8];
    if (packed & 0x80) take(3 * 2 ** ((packed & 7) + 1));
    else if (!globalPalette) invalid();
    const codeSize = byte();
    if (codeSize < 2 || codeSize > 8 || !blocks()) invalid();
  }
  invalid();
}
