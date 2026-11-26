import { describe, expect, it } from 'vitest';
import { createRemovalAlpha } from '../../../e2e/portrait-cutout/engine/removal-mask.js';

const width = 160;
const height = 120;
const index = (x: number, y: number) => y * width + x;

function makeAlpha(contains: (x: number, y: number) => boolean) {
  return Uint8ClampedArray.from({ length: width * height }, (_, i) =>
    contains(i % width, Math.floor(i / width)) ? 255 : 0,
  );
}

describe('local cutout removal mask', () => {
  it('follows a smooth ellipse without taking a broad ring of background', () => {
    const alpha = makeAlpha((x, y) => ((x - 80) / 35) ** 2 + ((y - 53) / 24) ** 2 <= 1);
    const removal = createRemovalAlpha({ alpha, width, height });
    expect(removal[index(80, 53)]).toBe(255);
    expect(removal[index(116, 53)]).toBe(255);
    expect(removal[index(120, 53)]).toBe(0);
    expect(removal[index(113, 74)]).toBe(0);
  });

  it('pads thin details on a complex edge, while capping the covered background', () => {
    const alpha = makeAlpha(
      (x, y) =>
        (x >= 50 && x <= 102 && y >= 24 && y <= 94) ||
        (x >= 28 && x < 50 && y >= 26 && y <= 87 && y % 7 === 5),
    );
    const removal = createRemovalAlpha({ alpha, width, height });
    expect(removal[index(34, 33)]).toBe(255);
    expect(removal[index(34, 35)]).toBe(255);
    expect(removal[index(15, 35)]).toBe(0);
    expect(removal[index(80, 110)]).toBe(0);
  });

  it('keeps an empty mask empty', () => {
    const alpha = new Uint8ClampedArray(width * height);
    expect(createRemovalAlpha({ alpha, width, height }).some(Boolean)).toBe(false);
  });
});
