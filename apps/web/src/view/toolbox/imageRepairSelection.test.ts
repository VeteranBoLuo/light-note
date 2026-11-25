import { describe, expect, it } from 'vitest';
import {
  applyRepairSelection,
  enhancedRepairBounds,
  hitRepairRectangle,
  moveRepairRectangle,
  repairRectangleHandles,
  resizeRepairRectangle,
  type RepairRectangle,
  type RepairSelection,
} from './imageRepairSelection';

const first: RepairRectangle = { kind: 'rectangle', x: 10, y: 20, width: 30, height: 20 };
const second: RepairRectangle = { kind: 'rectangle', x: 35, y: 30, width: 40, height: 30 };

describe('image repair rectangle manipulation', () => {
  it('replaces the previous rectangle and keeps each brush stroke', () => {
    const stroke: RepairSelection = { kind: 'brush', points: [{ x: 25, y: 32 }], radius: 5 };
    const another: RepairSelection = { kind: 'brush', points: [{ x: 75, y: 65 }], radius: 6 };
    const before = [first, stroke];
    const replaced = applyRepairSelection(before, second);
    expect(replaced).toEqual([stroke, second]);
    expect(applyRepairSelection(replaced, another)).toEqual([stroke, second, another]);
    expect(before).toEqual([first, stroke]);
  });

  it('activates earlier rectangles and picks the most recent rectangle where interiors overlap', () => {
    expect(hitRepairRectangle([first, second], 1, { x: 22, y: 27 }, 5)).toEqual({ index: 0 });
    expect(hitRepairRectangle([first, second], 0, { x: 38, y: 33 }, 1)).toEqual({ index: 1 });
    expect(hitRepairRectangle([first, second], 0, { x: 5, y: 62 }, 8)).toBeUndefined();
  });

  it('hits the active edge handle without taking over the interior of small selections', () => {
    expect(repairRectangleHandles(first)).toHaveLength(8);
    expect(hitRepairRectangle([first], 0, { x: 17, y: 20 }, 5)).toEqual({ index: 0, handle: 'n' });
    expect(hitRepairRectangle([first, second], 0, { x: 10, y: 30 }, 6)).toEqual({ index: 0, handle: 'w' });
    const small: RepairRectangle = { kind: 'rectangle', x: 10, y: 20, width: 40, height: 6 };
    expect(hitRepairRectangle([small], 0, { x: 30, y: 23 }, 18)).toEqual({ index: 0 });
  });

  it('preserves size while moving and clamps the manipulated edge during resize', () => {
    expect(moveRepairRectangle(first, { x: 200, y: -80 }, 100, 80)).toEqual({ ...first, x: 70, y: 0 });
    expect(resizeRepairRectangle(first, 'w', { x: 90, y: 20 }, 100, 80)).toEqual({ ...first, x: 38, width: 2 });
    expect(resizeRepairRectangle(first, 'se', { x: 80, y: 70 }, 100, 80)).toEqual({ ...first, width: 90, height: 60 });
  });
});

describe('enhanced repair context', () => {
  it('retains room around the selection and fits within the source image', () => {
    expect(enhancedRepairBounds({ x: 800, y: 1100, width: 400, height: 120 }, 2400, 3000)).toEqual({
      x: 600,
      y: 760,
      width: 800,
      height: 800,
    });
    expect(enhancedRepairBounds({ x: 390, y: 0, width: 111, height: 180 }, 501, 318)).toEqual({
      x: 0,
      y: 0,
      width: 501,
      height: 318,
    });
    expect(enhancedRepairBounds({ x: 800, y: 1800, width: 200, height: 200 }, 1000, 2000)).toEqual({
      x: 488,
      y: 1488,
      width: 512,
      height: 512,
    });
  });
});
