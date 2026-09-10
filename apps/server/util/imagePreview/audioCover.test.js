import { describe, it, expect, vi } from 'vitest';
import { audioTagLength, extractAudioCover, readAudioCover, MAX_AUDIO_TAG_BYTES } from './audioCover.js';
import { compressCardImage, validatePreview } from './compress.js';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAEAQMAAACTPww9AAAAA1BMVEUAAP+KeNJXAAAAC0lEQVQI12NggAAAAAgAAS8g3TEAAAAASUVORK5CYII=',
  'base64',
);
const sync = (n) => Buffer.from([(n >>> 21) & 127, (n >>> 14) & 127, (n >>> 7) & 127, n & 127]);
function frame(v, body, flags = 0) {
  const h = Buffer.alloc(v === 2 ? 6 : 10);
  h.write(v === 2 ? 'PIC' : 'APIC');
  if (v === 2) h.writeUIntBE(body.length, 3, 3);
  else if (v === 3) h.writeUInt32BE(body.length, 4);
  else sync(body.length).copy(h, 4);
  if (v !== 2) h[9] = flags;
  return Buffer.concat([h, body]);
}
function pic(v, type = 3, body = png, encoding = 0) {
  return Buffer.concat([
    Buffer.from([encoding]),
    Buffer.from(v === 2 ? 'PNG' : 'image/png\0'),
    Buffer.from([type]),
    encoding === 1 ? Buffer.from([255, 254, 65, 0, 0, 0]) : Buffer.from([0]),
    body,
  ]);
}
function tag(v, content, flags = 0) {
  return Buffer.concat([Buffer.from([73, 68, 51, v, 0, flags]), sync(content.length), content]);
}
describe('bounded MP3 embedded artwork', () => {
  it.each([2, 3, 4])('reads ID3v2.%i artwork and prefers front cover', (v) => {
    const other = Buffer.concat([png, Buffer.from('other')]);
    expect(extractAudioCover(tag(v, Buffer.concat([frame(v, pic(v, 4, other)), frame(v, pic(v, 3))])))).toEqual(png);
    expect(extractAudioCover(tag(v, frame(v, pic(v, 4, other))))).toEqual(other);
  });
  it('reads UTF-16 descriptions, extended headers and grouped v2.4 frames', () => {
    const ext = Buffer.from([0, 0, 0, 6, 1, 0]);
    expect(
      extractAudioCover(
        tag(4, Buffer.concat([ext, frame(4, Buffer.concat([Buffer.from([7]), pic(4, 3, png, 1)]), 64)]), 64),
      ),
    ).toEqual(png);
    const ext3 = Buffer.from([0, 0, 0, 6, 0, 0, 0, 0, 0, 0]);
    expect(extractAudioCover(tag(3, Buffer.concat([ext3, frame(3, pic(3))]), 64))).toEqual(png);
  });
  it('reverses tag-level v2.3 and frame-level v2.4 unsynchronisation', () => {
    const body = Buffer.concat([png, Buffer.from([255, 224])]);
    const escape = (b) => Buffer.from([...b].flatMap((x) => (x === 255 ? [255, 0] : [x])));
    expect(extractAudioCover(tag(3, escape(frame(3, pic(3, 3, body))), 128))).toEqual(body);
    expect(extractAudioCover(tag(4, frame(4, escape(pic(4, 3, body)), 2)))).toEqual(body);
  });
  it('ignores external links, compressed frames and invalid picture bytes', () => {
    const link = Buffer.from('\0-->\0\x03\0https://example.test/cover.png');
    expect(extractAudioCover(tag(3, frame(3, link)))).toBeNull();
    expect(extractAudioCover(tag(3, frame(3, pic(3), 128)))).toBeNull();
    expect(extractAudioCover(tag(3, frame(3, pic(3, 3, Buffer.from('invalid')))))).toBeNull();
  });
  it('bounds tag and frame sizes and detects truncation', () => {
    const oversized = Buffer.concat([Buffer.from([73, 68, 51, 3, 0, 0]), sync(MAX_AUDIO_TAG_BYTES + 1)]);
    expect(() => audioTagLength(oversized)).toThrow('IMAGE_SOURCE_SIZE_LIMIT');
    const valid = tag(3, frame(3, pic(3)));
    expect(() => extractAudioCover(valid.subarray(0, -1))).toThrow('IMAGE_AUDIO_TAG_INVALID');
    const invalidFrame = frame(3, pic(3));
    invalidFrame.writeUInt32BE(0xffffffff, 4);
    expect(() => extractAudioCover(tag(3, invalidFrame))).toThrow('IMAGE_AUDIO_TAG_INVALID');
  });
  it('reads metadata ranges only, including for large audio files', async () => {
    const bytes = tag(3, frame(3, pic(3)));
    const range = vi.fn(async (_key, start, end) => bytes.subarray(start, end + 1));
    const result = await readAudioCover('private-key', 200 * 1024 * 1024, range);
    expect(result.body).toEqual(png);
    expect(range.mock.calls).toEqual([
      ['private-key', 0, 9],
      ['private-key', 10, bytes.length - 1],
    ]);
    range.mockReset().mockResolvedValue(Buffer.alloc(10));
    expect((await readAudioCover('private-key', 1000, range)).body).toBeNull();
    expect(range).toHaveBeenCalledTimes(1);
  });
  it('encodes extracted artwork through the actual bounded WebP pipeline', async () => {
    const body = extractAudioCover(tag(3, frame(3, pic(3))));
    const output = await compressCardImage(body);
    expect(validatePreview(output.body).type).toBe('webp');
  });
});
