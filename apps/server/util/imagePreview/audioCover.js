import { imageError, validateSource } from './compress.js';

export const MAX_AUDIO_TAG_BYTES = 16 * 1024 * 1024;
const invalid = () => imageError('IMAGE_AUDIO_TAG_INVALID');
function synchsafe(bytes) {
  if (bytes.length !== 4 || bytes.some((b) => b & 0x80)) throw invalid();
  return bytes.reduce((n, b) => n * 128 + b, 0);
}
export function audioTagLength(header) {
  if (header.toString('ascii', 0, 3) !== 'ID3') return 0;
  if (header.length < 10 || ![2, 3, 4].includes(header[3]) || header[4] === 255) throw invalid();
  const size = synchsafe(header.subarray(6, 10));
  if (size > MAX_AUDIO_TAG_BYTES) throw imageError('IMAGE_SOURCE_SIZE_LIMIT');
  return size + 10;
}
function unsynchronise(bytes) {
  const result = Buffer.allocUnsafe(bytes.length);
  let length = 0;
  for (let i = 0; i < bytes.length; i++) {
    result[length++] = bytes[i];
    if (bytes[i] === 255 && bytes[i + 1] === 0) i++;
  }
  return result.subarray(0, length);
}
function picture(frame, version) {
  const encoding = frame[0];
  if (![0, 1, 2, 3].includes(encoding)) return null;
  let pos;
  if (version === 2) {
    if (frame.toString('ascii', 1, 4) === '-->') return null;
    pos = 4;
  } else {
    const end = frame.indexOf(0, 1);
    if (end < 0 || frame.toString('ascii', 1, end) === '-->') return null;
    pos = end + 1;
  }
  if (pos >= frame.length) return null;
  const type = frame[pos++];
  const step = encoding === 1 || encoding === 2 ? 2 : 1;
  while (pos + step <= frame.length) {
    const end = frame[pos] === 0 && (step === 1 || frame[pos + 1] === 0);
    pos += step;
    if (!end) continue;
    const body = frame.subarray(pos);
    try {
      validateSource(body);
      return { type, body };
    } catch {
      return null;
    }
  }
  return null;
}
/** Bounded ID3v2 PIC/APIC parser. Never follows linked pictures or decompresses encrypted/compressed frames. */
export function extractAudioCover(tag) {
  const length = audioTagLength(tag);
  if (!length) return null;
  if (tag.length < length) throw invalid();
  const version = tag[3],
    flags = tag[5];
  if (flags & (version === 2 ? 0x3f : version === 3 ? 0x1f : 0x0f)) throw invalid();
  if (version === 2 && flags & 0x40) throw invalid();
  let data = tag.subarray(10, length);
  if (version < 4 && flags & 0x80) data = unsynchronise(data);
  let pos = 0;
  if (version > 2 && flags & 0x40) {
    if (data.length < 4) throw invalid();
    pos = version === 3 ? data.readUInt32BE(0) + 4 : synchsafe(data.subarray(0, 4));
    if (pos < (version === 3 ? 10 : 6) || pos > data.length) throw invalid();
  }
  let fallback = null;
  let count = 0;
  const headerSize = version === 2 ? 6 : 10;
  while (pos < data.length) {
    if (data[pos] === 0) break;
    if (++count > 10000 || pos + headerSize > data.length) throw invalid();
    const id = data.toString('ascii', pos, pos + (version === 2 ? 3 : 4));
    if (!/^[A-Z0-9]+$/.test(id)) throw invalid();
    const size =
      version === 2
        ? data.readUIntBE(pos + 3, 3)
        : version === 3
          ? data.readUInt32BE(pos + 4)
          : synchsafe(data.subarray(pos + 4, pos + 8));
    const frameFlags = version === 2 ? 0 : data[pos + 9];
    pos += headerSize;
    if (pos + size > data.length) throw invalid();
    let frame = data.subarray(pos, pos + size);
    pos += size;
    if (id !== (version === 2 ? 'PIC' : 'APIC')) continue;
    if (frameFlags & (version === 3 ? 0xc0 : 0x0c)) continue;
    if (version === 4 && (flags & 0x80 || frameFlags & 2)) frame = unsynchronise(frame);
    if (frameFlags & (version === 3 ? 0x20 : 0x40)) frame = frame.subarray(1);
    if (version === 4 && frameFlags & 1) {
      if (frame.length < 4 || synchsafe(frame.subarray(0, 4)) !== frame.length - 4) continue;
      frame = frame.subarray(4);
    }
    const found = picture(frame, version);
    if (found?.type === 3) return found.body;
    if (found && !fallback) fallback = found.body;
  }
  return fallback;
}

export async function readAudioCover(locator, size, readRange) {
  if (!Number.isSafeInteger(size) || size < 10) throw invalid();
  const header = await readRange(locator, 0, 9);
  const length = audioTagLength(header);
  if (!length) return { body: null, tag: header };
  if (length > size) throw invalid();
  const tag = length === 10 ? header : Buffer.concat([header, await readRange(locator, 10, length - 1)]);
  const body = extractAudioCover(tag);
  return { body, tag };
}
