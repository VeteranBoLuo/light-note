import { describe, expect, it } from 'vitest';
import { safeImageSize } from './safeImageSize.js';

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const JPEG_2X3 = Buffer.from([
  0xff,
  0xd8,
  0xff,
  0xc0,
  0x00,
  0x11,
  0x08,
  0x00,
  0x03,
  0x00,
  0x02,
  ...new Array(10).fill(0),
]);
const GIF_4X5 = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x04, 0x00, 0x05, 0x00]);

function webp(chunkType, payload) {
  const result = Buffer.alloc(20 + payload.length);
  result.write('RIFF', 0, 'ascii');
  result.writeUInt32LE(result.length - 8, 4);
  result.write('WEBP', 8, 'ascii');
  result.write(chunkType, 12, 'ascii');
  result.writeUInt32LE(payload.length, 16);
  payload.copy(result, 20);
  return result;
}

describe('safeImageSize', () => {
  it('解析业务支持的 PNG、JPEG、GIF 与三种 WebP 头', () => {
    const vp8x = Buffer.alloc(10);
    vp8x.writeUIntLE(6, 4, 3);
    vp8x.writeUIntLE(8, 7, 3);
    const vp8l = Buffer.from([0x2f, 0x06, 0x00, 0x02, 0x00]);
    const vp8 = Buffer.from([0, 0, 0, 0x9d, 0x01, 0x2a, 0x07, 0x00, 0x09, 0x00]);

    expect(safeImageSize(PNG_1X1)).toEqual({ type: 'png', width: 1, height: 1 });
    expect(safeImageSize(JPEG_2X3)).toEqual({ type: 'jpg', width: 2, height: 3 });
    expect(safeImageSize(GIF_4X5)).toEqual({ type: 'gif', width: 4, height: 5 });
    expect(safeImageSize(webp('VP8X', vp8x))).toEqual({ type: 'webp', width: 7, height: 9 });
    expect(safeImageSize(webp('VP8L', vp8l))).toEqual({ type: 'webp', width: 7, height: 9 });
    expect(safeImageSize(webp('VP8 ', vp8))).toEqual({ type: 'webp', width: 7, height: 9 });
  });

  it('拒绝截断、尺寸为零和未开放的易受攻击格式', () => {
    const zeroWidthPng = Buffer.from(PNG_1X1);
    zeroWidthPng.writeUInt32BE(0, 16);
    expect(() => safeImageSize(PNG_1X1.subarray(0, 20))).toThrow(TypeError);
    expect(() => safeImageSize(zeroWidthPng)).toThrow(TypeError);
    expect(() => safeImageSize(Buffer.from([0x69, 0x63, 0x6e, 0x73, 0, 0, 0, 16]))).toThrow(TypeError);
    expect(() => safeImageSize(Buffer.from([0xff, 0x0a, 0, 0, 0, 0]))).toThrow(TypeError);
    expect(() => safeImageSize(Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]))).toThrow(
      TypeError,
    );
    expect(() => safeImageSize(Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x20]))).toThrow(TypeError);
  });
});
