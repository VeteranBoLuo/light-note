// 有界文件头识别；文件名和声明的 MIME 只用于筛选候选，不作为格式证据。
const formats = {
  jpg: ['image/jpeg', true, true],
  png: ['image/png', true, true],
  gif: ['image/gif', true, true],
  webp: ['image/webp', true, true],
  bmp: ['image/bmp', true, false],
  ico: ['image/x-icon', true, false],
  avif: ['image/avif', true, false],
  svg: ['image/svg+xml', true, false],
  heif: ['image/heif', false, true],
};
export const IMAGE_HEADER_BYTES = 64 * 1024;

export function detectImageFormat(input) {
  if (!(input instanceof Uint8Array)) return null;
  const bytes = Buffer.from(input.buffer, input.byteOffset, Math.min(input.byteLength, IMAGE_HEADER_BYTES));
  const ascii = (start, end) => bytes.toString('ascii', start, end);
  let type;
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) type = 'jpg';
  else if (
    bytes.length >= 24 &&
    bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) &&
    ascii(12, 16) === 'IHDR'
  )
    type = 'png';
  else if (bytes.length >= 10 && ['GIF87a', 'GIF89a'].includes(ascii(0, 6))) type = 'gif';
  else if (bytes.length >= 20 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') type = 'webp';
  else if (bytes.length >= 26 && ascii(0, 2) === 'BM') type = 'bmp';
  else if (bytes.length >= 22 && bytes.readUInt32LE(0) === 0x00010000 && bytes.readUInt16LE(4) > 0) type = 'ico';
  else if (bytes.length >= 16 && ascii(4, 8) === 'ftyp') {
    const end = Math.min(bytes.readUInt32BE(0), bytes.length, 4096);
    const brands = [ascii(8, 12)];
    for (let offset = 16; offset + 4 <= end; offset += 4) brands.push(ascii(offset, offset + 4));
    if (end >= 16 && brands.some((brand) => ['avif', 'avis'].includes(brand))) type = 'avif';
    else if (end >= 16 && brands.some((brand) => ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)))
      type = 'heif';
  } else {
    let text = bytes
      .toString('utf8')
      .replace(/^\uFEFF/u, '')
      .trimStart();
    // 不解析 XML、不读取外部实体；只跳过有限长度的声明与注释后核对根元素。
    while (text.startsWith('<?xml') || text.startsWith('<!--')) {
      const marker = text.startsWith('<!--') ? '-->' : '?>';
      const end = text.indexOf(marker);
      if (end < 0) return null;
      text = text.slice(end + marker.length).trimStart();
    }
    if (/^<!DOCTYPE\s+svg\s/iu.test(text)) {
      const end = text.indexOf('>');
      if (end < 0) return null;
      text = text.slice(end + 1).trimStart();
    }
    if (/^<svg(?:\s|\/?>)/u.test(text)) type = 'svg';
  }
  if (!type) return null;
  const [mimeType, previewable, thumbnailSupported] = formats[type];
  return { type, mimeType, previewable, thumbnailSupported };
}
