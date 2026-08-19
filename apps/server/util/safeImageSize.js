const JPEG_START_OF_FRAME_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function invalidImage() {
  return new TypeError('Unsupported or invalid image');
}

function assertBytes(input) {
  if (!(input instanceof Uint8Array) || input.byteLength === 0) throw invalidImage();
  return input;
}

function ascii(bytes, offset, length) {
  if (offset < 0 || offset + length > bytes.length) return '';
  let value = '';
  for (let index = offset; index < offset + length; index += 1) value += String.fromCharCode(bytes[index]);
  return value;
}

function uint16be(bytes, offset) {
  if (offset < 0 || offset + 2 > bytes.length) throw invalidImage();
  return bytes[offset] * 0x100 + bytes[offset + 1];
}

function uint16le(bytes, offset) {
  if (offset < 0 || offset + 2 > bytes.length) throw invalidImage();
  return bytes[offset] + bytes[offset + 1] * 0x100;
}

function uint24le(bytes, offset) {
  if (offset < 0 || offset + 3 > bytes.length) throw invalidImage();
  return bytes[offset] + bytes[offset + 1] * 0x100 + bytes[offset + 2] * 0x10000;
}

function uint32be(bytes, offset) {
  if (offset < 0 || offset + 4 > bytes.length) throw invalidImage();
  return bytes[offset] * 0x1000000 + bytes[offset + 1] * 0x10000 + bytes[offset + 2] * 0x100 + bytes[offset + 3];
}

function uint32le(bytes, offset) {
  if (offset < 0 || offset + 4 > bytes.length) throw invalidImage();
  return bytes[offset] + bytes[offset + 1] * 0x100 + bytes[offset + 2] * 0x10000 + bytes[offset + 3] * 0x1000000;
}

function dimensions(type, width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw invalidImage();
  }
  return { width, height, type };
}

function parsePng(bytes) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || !signature.every((value, index) => bytes[index] === value)) return null;
  if (uint32be(bytes, 8) !== 13 || ascii(bytes, 12, 4) !== 'IHDR') throw invalidImage();
  return dimensions('png', uint32be(bytes, 16), uint32be(bytes, 20));
}

function parseGif(bytes) {
  const signature = ascii(bytes, 0, 6);
  if (signature !== 'GIF87a' && signature !== 'GIF89a') return null;
  if (bytes.length < 10) throw invalidImage();
  return dimensions('gif', uint16le(bytes, 6), uint16le(bytes, 8));
}

function parseJpeg(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) throw invalidImage();
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) throw invalidImage();

    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;

    const segmentLength = uint16be(bytes, offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) throw invalidImage();
    if (JPEG_START_OF_FRAME_MARKERS.has(marker)) {
      if (segmentLength < 7) throw invalidImage();
      return dimensions('jpg', uint16be(bytes, offset + 5), uint16be(bytes, offset + 3));
    }
    offset += segmentLength;
  }
  throw invalidImage();
}

function parseWebp(bytes) {
  if (ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') return null;
  if (bytes.length < 20) throw invalidImage();
  const riffEnd = uint32le(bytes, 4) + 8;
  if (riffEnd < 20 || riffEnd > bytes.length) throw invalidImage();

  const chunkType = ascii(bytes, 12, 4);
  const chunkSize = uint32le(bytes, 16);
  const chunkEnd = 20 + chunkSize;
  if (chunkEnd > riffEnd) throw invalidImage();

  if (chunkType === 'VP8X') {
    if (chunkSize < 10) throw invalidImage();
    return dimensions('webp', uint24le(bytes, 24) + 1, uint24le(bytes, 27) + 1);
  }
  if (chunkType === 'VP8L') {
    if (chunkSize < 5 || bytes[20] !== 0x2f) throw invalidImage();
    const width = 1 + bytes[21] + ((bytes[22] & 0x3f) << 8);
    const height = 1 + ((bytes[22] & 0xc0) >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10);
    return dimensions('webp', width, height);
  }
  if (chunkType === 'VP8 ') {
    if (chunkSize < 10 || bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) throw invalidImage();
    return dimensions('webp', uint16le(bytes, 26) & 0x3fff, uint16le(bytes, 28) & 0x3fff);
  }
  throw invalidImage();
}

/**
 * 只解析产品允许上传的 PNG、JPEG、GIF 与 WebP，且所有读取和循环均受输入长度约束。
 * 不探测 HEIF/JXL/ICNS 等未开放格式，避免通用图片探测器在恶意文件上进入无界解析。
 */
export function safeImageSize(input) {
  const bytes = assertBytes(input);
  const result = parsePng(bytes) || parseGif(bytes) || parseJpeg(bytes) || parseWebp(bytes);
  if (!result) throw invalidImage();
  return result;
}
