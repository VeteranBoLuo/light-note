import { describe, expect, it } from 'vitest';
import { validateCommunityChatGif } from './communityChatGif.js';

// Two-color 1x1 image with valid LZW data; repeat the frame to form an animation.
const header = Buffer.from('47494638396101000100800000000000ffffff', 'hex');
const frame = Buffer.from('21f904000a0000002c0000000001000100000202440100', 'hex');
const gif = (count = 2) => Buffer.concat([header, ...Array(count).fill(frame), Buffer.from([0x3b])]);

describe('chat GIF metadata validation', () => {
  it('accepts animations without changing their bytes', () => {
    const bytes = gif();
    const original = Buffer.from(bytes);
    expect(validateCommunityChatGif(bytes)).toEqual({ width: 1, height: 1, frames: 2 });
    expect(bytes).toEqual(original);
    expect(validateCommunityChatGif(gif(200)).frames).toBe(200);
  });
  it('rejects every truncated prefix', () => {
    const bytes = gif();
    for (let end = 0; end < bytes.length; end++) {
      expect(() => validateCommunityChatGif(bytes.subarray(0, end))).toThrow();
    }
  });
  it('rejects excessive frames and cumulative canvas pixels', () => {
    expect(() => validateCommunityChatGif(gif(201))).toThrow(
      expect.objectContaining({ code: 'CUSTOM_STICKER_GIF_LIMIT_EXCEEDED' }),
    );
    const bytes = gif(41);
    bytes.writeUInt16LE(1000, 6);
    bytes.writeUInt16LE(1000, 8);
    expect(() => validateCommunityChatGif(bytes)).toThrow(
      expect.objectContaining({ code: 'CUSTOM_STICKER_GIF_LIMIT_EXCEEDED' }),
    );
  });
  it('rejects out-of-bounds frames, empty images and trailing data', () => {
    const outside = gif();
    outside.writeUInt16LE(2, header.length + 8 + 5);
    for (const bytes of [
      outside,
      Buffer.concat([header, Buffer.from([0x3b])]),
      Buffer.concat([gif(), Buffer.from([0])]),
    ]) {
      expect(() => validateCommunityChatGif(bytes)).toThrow();
    }
  });
  it('accepts looping application extensions, comments and local palettes', () => {
    const extension = Buffer.from('21ff0b4e45545343415045322e30030100000021fe0367696600', 'hex');
    const bytes = Buffer.concat([header, extension, frame, Buffer.from([0x3b])]);
    expect(validateCommunityChatGif(bytes).frames).toBe(1);
    const localHeader = Buffer.from(header.subarray(0, 13));
    localHeader[10] = 0;
    const localFrame = Buffer.from(frame);
    localFrame[17] = 0x80;
    expect(
      validateCommunityChatGif(
        Buffer.concat([
          localHeader,
          localFrame.subarray(0, 18),
          header.subarray(13),
          localFrame.subarray(18),
          Buffer.from([0x3b]),
        ]),
      ).frames,
    ).toBe(1);
  });
});
