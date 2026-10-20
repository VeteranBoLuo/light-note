// HEIF item properties are checked before invoking the native decoder. No media
// payload is parsed here; malformed/unsupported containers fail closed.
export const MAX_HEIF_PIXELS = 64 * 1024 * 1024;
export function validateHeifSource(bytes) {
  const fail = (code) => {
    throw Object.assign(new Error(code), { code });
  };
  let count = 0;
  const dimensions = [];
  function walk(start, end, depth = 0) {
    if (depth > 8) fail('IMAGE_SOURCE_INVALID');
    for (let offset = start; offset < end;) {
      if (++count > 4096 || end - offset < 8) fail('IMAGE_SOURCE_INVALID');
      let size = bytes.readUInt32BE(offset);
      const type = bytes.toString('ascii', offset + 4, offset + 8);
      let header = 8;
      if (size === 1) {
        if (end - offset < 16) fail('IMAGE_SOURCE_INVALID');
        const large = bytes.readBigUInt64BE(offset + 8);
        if (large > BigInt(Number.MAX_SAFE_INTEGER)) fail('IMAGE_SOURCE_INVALID');
        size = Number(large);
        header = 16;
      } else if (size === 0) size = end - offset;
      if (size < header || offset + size > end) fail('IMAGE_SOURCE_INVALID');
      const payload = offset + header;
      if (type === 'ispe') {
        if (size < header + 12) fail('IMAGE_SOURCE_INVALID');
        const width = bytes.readUInt32BE(payload + 4),
          height = bytes.readUInt32BE(payload + 8);
        if (!width || !height) fail('IMAGE_SOURCE_INVALID');
        if (width * height > MAX_HEIF_PIXELS || width > 65535 || height > 65535) fail('IMAGE_RESOURCE_LIMIT');
        dimensions.push({ width, height });
      } else if (['meta', 'iprp', 'ipco'].includes(type)) {
        walk(payload + (type === 'meta' ? 4 : 0), offset + size, depth + 1);
      }
      offset += size;
    }
  }
  walk(0, bytes.length);
  if (!dimensions.length) fail('IMAGE_SOURCE_INVALID');
  return { type: 'heic', ...dimensions.reduce((a, b) => (a.width * a.height > b.width * b.height ? a : b)) };
}
