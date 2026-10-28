import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, expect, it, vi } from 'vitest';

const read = (name: string) => readFileSync(resolve(process.cwd(), 'public/manor/knowledge-garden-v19', name), 'utf8');

afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = ''; });

function fixture() {
  document.body.innerHTML = '<section class="seaside-courtyard"><div id="pondSpot"></div></section>';
  const scene = document.querySelector<HTMLElement>('section')!;
  let width = 1470, height = 726;
  let camera = { ox: 0, oy: 20, sx: .4, sy: .4, width, height, sourceWidth: 3630, sourceHeight: 1732, profile: 'desktop' };
  scene.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height, toJSON() {} });
  const point = (x: number, y: number) => ({ x: camera.ox + x * camera.sx, y: camera.oy + y * camera.sy });
  const stage = {
    frame: () => ({ ...camera }),
    cal: () => ({ birdRoutes: true, visitorStops: [[[1000, 1100], [1300, 1100]], [[1600, 1100], [1900, 1100]]] }),
    toScene: (x: number, y: number) => [point(x, y).x, point(x, y).y],
    scale: () => camera.sx,
    habitat: () => ({
      lawn: { ...point(1900, 1450), cx: point(1900, 1450).x, cy: point(1900, 1450).y, rx: 200, ry: 45 },
      air: { cx: 600, cy: 250, rx: 200, ry: 60 },
      birdRoutes: [[point(1000, 1100), point(1300, 1100)], [point(1600, 1100), point(1900, 1100)], [point(2200, 1100)], [point(2500, 1100)]],
      frog: { home: point(312, 1421), water: point(380, 1540), face: 1 }, pickups: [],
    }),
  };
  const context2d = new Proxy({} as any, { get: (_, key) => String(key).includes('Gradient') ? () => ({ addColorStop() {} }) : () => {} });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context2d);
  let nextFrame: (time: number) => void = () => {};
  const context: any = {
    document, FarmStage: stage, devicePixelRatio: 1,
    matchMedia: () => ({ matches: false }),
    ResizeObserver: class { observe() {} disconnect() {} },
    Image: class { complete = false; src = ''; },
    requestAnimationFrame: (fn: (time: number) => void) => { nextFrame = fn; return 1; }, cancelAnimationFrame() {},
    setInterval: () => 1, clearInterval() {},
    GardenAnimals3D: { update: () => false },
  };
  context.GardenHabitat = runInNewContext(`${read('garden-habitat.js')};GardenHabitat`, context);
  context.GardenAnimalPose = runInNewContext(`${read('garden-animal-pose.js')};GardenAnimalPose`, context);
  const critters = runInNewContext(`${read('garden-critters.js')};GardenCritters`, context);
  critters.mount(scene);
  const tick = (time: number) => nextFrame(time);
  const snapshot = () => {
    const data = scene.querySelector<HTMLCanvasElement>('.critter-layer')!.dataset;
    return { frog: JSON.parse(data.frog!), rabbit: JSON.parse(data.rabbit!), birds: JSON.parse(data.birds!), dragonfly: JSON.parse(data.dragonfly!) };
  };
  const move = (change: Partial<typeof camera>) => {
    camera = { ...camera, ...change };
    width = camera.width; height = camera.height;
  };
  return { tick, snapshot, move, critters, habitat: context.GardenHabitat, companions: () => {
    critters.unmount(); context.GardenCritters = critters;
    const companions = runInNewContext(`${read('garden-companions.js')};GardenCompanions`, context);
    companions.mount(scene);
    return { companions, snapshot: () => JSON.parse(scene.querySelector<HTMLCanvasElement>('.companion-layer')!.dataset.visitors!) };
  } };
}

it('首帧站在正式锚点，同宽窗口的相机平移立即同步，且不重抽动物位置', () => {
  const f = fixture(); f.tick(1000);
  const before = f.snapshot();
  expect(before.frog.x).toBeCloseTo(312 * .4);
  expect(before.frog.y).toBeCloseTo(20 + 1421 * .4);
  f.move({ oy: 180 }); f.tick(1000);
  const after = f.snapshot();
  for (const kind of ['frog', 'rabbit', 'dragonfly'] as const) {
    expect(after[kind].x).toBeCloseTo(before[kind].x);
    expect(after[kind].y).toBeCloseTo(before[kind].y + 160);
    expect(after[kind].state).toBe(before[kind].state);
  }
  after.birds.forEach((bird: any, i: number) => {
    expect(bird.x).toBeCloseTo(before.birds[i].x);
    expect(bird.y).toBeCloseTo(before.birds[i].y + 160);
    expect(bird.routeStep).toBe(before.birds[i].routeStep);
  });
  f.critters.unmount();
});

it('跳水中改变取景保留动作进度，最终入水及返程仍使用同一幅场景的锚点', () => {
  const f = fixture(); f.tick(1000); f.critters.poke('frog');
  for (let t = 1050; t <= 1350; t += 50) f.tick(t);
  const before = f.snapshot().frog;
  expect(before.state).toBe('jump');
  f.move({ oy: 180, height: 885 }); f.tick(1350);
  const after = f.snapshot().frog;
  expect(after.state).toBe('jump');
  expect(after.x).toBeCloseTo(before.x);
  expect(after.y).toBeCloseTo(before.y + 160);
  for (let t = 1400; t <= 2000; t += 50) f.tick(t);
  const under = f.snapshot().frog;
  expect(under.state).toBe('under');
  expect(under.x).toBeCloseTo(380 * .4);
  expect(under.y).toBeCloseTo(180 + 1540 * .4);
  for (let t = 2050; t <= 10000; t += 50) f.tick(t);
  expect(f.snapshot().frog.state).toBe('sit');
  expect(f.snapshot().frog.y).toBeCloseTo(180 + 1421 * .4);
  f.critters.unmount();
});

it('相机取景高度不改变动物相对场景的身长，宽度缩放仍保持等比', () => {
  const f = fixture();
  const size = f.habitat.animalUnit(false, 1470, 726);
  f.move({ oy: 180, height: 885 });
  expect(f.habitat.animalUnit(false, 1470, 885)).toBe(size);
  f.move({ sx: .8, sy: .8, width: 2940 });
  expect(f.habitat.animalUnit(false, 2940, 885)).toBeCloseTo(size * 2);
  f.critters.unmount();
});

it('3D 首次显示直接使用当前朝向，后续转身保留平滑过渡', () => {
  const module = { exports: {} as any };
  runInNewContext(read('garden-animals-3d.js'), { module, GardenAnimalSkin: {} });
  const model = { kind: 'ladybird', root: { rotation: { set() {} } }, yaw: 0, opening: 0, shells: [], wings: [], legs: [], presented: false };
  module.exports.animate(model, { face: -1, flying: false }, .016, {});
  expect(model.yaw).toBeCloseTo(Math.PI);
  model.presented = true;
  module.exports.animate(model, { face: 1, flying: false }, .016, {});
  expect(model.yaw).toBeGreaterThan(0);
  expect(model.yaw).toBeLessThan(Math.PI);
});

it('昆虫互动途中重排也保留当前轨迹，不跳回随机停靠点', () => {
  const f = fixture(), c = f.companions();
  f.tick(1000);
  document.querySelector<HTMLButtonElement>('[data-companion="butterfly"]')!.click();
  f.tick(1050); f.tick(1100);
  const before = c.snapshot()[0];
  expect(before.moving).toBe(true);
  f.move({ oy: 180 }); f.tick(1100);
  const after = c.snapshot()[0];
  expect(after.moving).toBe(true);
  expect(after.x).toBeCloseTo(before.x);
  expect(after.y).toBeCloseTo(before.y + 160);
  c.companions.unmount();
});
