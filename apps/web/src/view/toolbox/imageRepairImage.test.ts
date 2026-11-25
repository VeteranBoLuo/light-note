import { describe, expect, it } from 'vitest';
import { canResizeRepairImage, fitRepairImage, inspectRepairImage } from './imageRepairImage';
import { pointOnImage, rectangleBetween, repairPatchBounds } from './imageRepairSelection';

function pngHeader(width: number, height: number, animated = false) {
  const bytes = new Uint8Array(45);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const header = new DataView(bytes.buffer);
  header.setUint32(8, 13);
  header.setUint32(12, 0x49484452);
  header.setUint32(16, width);
  header.setUint32(20, height);
  header.setUint32(37, animated ? 0x6163544c : 0x49444154);
  return new File([bytes], 'fixture.png', { type: 'image/png' });
}

describe('local image repair guards', () => {
  it('reads real dimensions before decoding and rejects disguised or animated images', async () => {
    await expect(inspectRepairImage(pngHeader(3000, 4000))).resolves.toMatchObject({
      width: 3000,
      height: 4000,
      type: 'image/png',
    });
    await expect(inspectRepairImage(pngHeader(8064, 6048))).resolves.toMatchObject({ width: 8064, height: 6048 });
    await expect(inspectRepairImage(pngHeader(64, 64, true))).rejects.toMatchObject({ code: 'animatedImage' });
    await expect(inspectRepairImage(new File(['<html>'], 'forged.png', { type: 'image/png' }))).rejects.toMatchObject({
      code: 'unsupportedImage',
    });
  });

  it('keeps regular phone photos full size and calculates a safe size for larger photos', () => {
    expect(fitRepairImage(4032, 3024)).toEqual({ width: 4032, height: 3024 });
    expect(fitRepairImage(8064, 6048)).toEqual({ width: 4096, height: 3072 });
    expect(fitRepairImage(1600, 8000)).toEqual({ width: 819, height: 4096 });
    expect(canResizeRepairImage(8064, 6048)).toBe(true);
    expect(canResizeRepairImage(10000, 10000)).toBe(false);
  });

  it('maps a reversed drag onto the source image and pads the repair without crossing its edges', () => {
    const rect = { x: 40, y: 60, width: 250, height: 250 };
    const start = pointOnImage({ x: 286, y: 322 }, rect, 1000, 1000);
    const end = pointOnImage({ x: 110, y: 270 }, rect, 1000, 1000);
    const selection = rectangleBetween(start, end);
    expect(selection).toEqual({ kind: 'rectangle', x: 280, y: 840, width: 704, height: 160 });
    expect(repairPatchBounds([selection], 1000, 1000)).toEqual({ x: 264, y: 824, width: 736, height: 176 });
  });
});
