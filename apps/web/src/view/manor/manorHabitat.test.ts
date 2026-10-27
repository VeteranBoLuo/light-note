// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const root = new URL('../../../public/manor/knowledge-garden-v19/', import.meta.url);
const cal = runInNewContext(`${readFileSync(new URL('farm-calibration.js', root), 'utf8')};FARM_CAL`);
const load = (name: string) => {
  const module = { exports: {} as any };
  runInNewContext(readFileSync(new URL(name, root), 'utf8'), { module });
  return module.exports;
};
const habitat = load('garden-habitat.js'), life = load('garden-life.js');

it('麻雀在窗口重排后尚未更新姿态时仍能正常绘制', () => {
  const critters = load('garden-critters.js');
  let gradients = 0;
  const ctx = new Proxy({} as any, {
    get(_, key) {
      if (key === 'createRadialGradient' || key === 'createLinearGradient') return (...values: number[]) => {
        if (!values.every(Number.isFinite)) throw new Error('Invalid gradient coordinates');
        gradients++;
        return { addColorStop() {} };
      };
      return () => {};
    },
  });
  expect(() => critters.drawSparrow(ctx, { pose: {} })).not.toThrow();
  expect(gradients).toBeGreaterThan(0);
});

describe('动物活动区与掉落物避让', () => {
  it.each(['desktop', 'mobileGarden'])('%s 的越界落点投影回石板路，便便按整个兔身占位避让', key => {
    const scene = cal[key], r = scene.rabbitLawn;
    const region = { ...r, cx: r.center[0], cy: r.center[1] };
    const [x, y] = scene.poop, pickups = [{ x, y, rx: 50, ry: 38 }];
    // Exercise both inside and outside candidates, including the pickup itself.
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      const next = habitat.onLawn({ x: region.cx + i * r.rx, y: region.cy + j * r.ry }, region);
      expect(habitat.inLawn(next, region)).toBe(true);
    }
    expect(habitat.pickupClear(habitat.onLawn({x:region.cx,y:region.cy},region), pickups, 160, 180)).toBe(true);
    expect(habitat.pickupClear({ x, y: y + 100 }, pickups, 160, 180)).toBe(false);
    expect(habitat.inLawn({ x, y }, region)).toBe(false);
  });

  it('旧的椭圆活动区仍可用，候选点不因新增多边形规则丢失', () => {
    const r = { cx: 100, cy: 100, rx: 60, ry: 30 };
    expect(habitat.inLawn(habitat.onLawn({ x: 600, y: 700 }, r), r)).toBe(true);
    expect(habitat.pickupClear({ x: 5, y: 8 }, [], 30, 40)).toBe(true);
  });
});

it('舱内气泡缓慢上升，并在玻璃轮廓外完全消失', () => {
  const poly = [[0, 0], [1000, 0], [1000, 600], [0, 600]];
  for (let i = 0; i < 16; i++) {
    const a = life.bubbleAt(i, 0.2, 1000, 600), b = life.bubbleAt(i, 0.3, 1000, 600);
    expect(b.y).toBeLessThan(a.y);
    expect(Math.abs(b.x - a.x)).toBeLessThan(4);
    expect(a.alpha).toBeGreaterThan(0);
    expect(a.alpha).toBeLessThanOrEqual(0.48);
    expect(life.edgeAlpha(a.x, a.y, poly, 20)).toBeGreaterThan(0);
  }
  expect(life.edgeAlpha(-10, 200, poly, 20)).toBe(0);
});
