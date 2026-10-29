import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, expect, it } from 'vitest';

const read = (name: string) => readFileSync(resolve(process.cwd(), 'public/manor/knowledge-garden-v19', name), 'utf8');
const cal = runInNewContext(`${read('farm-calibration.js')};FARM_CAL`);
const load = () => {
  const module = { exports: {} as any };
  runInNewContext(read('farm-stage.js'), { module, FARM_CAL: cal, document, URL,
    ResizeObserver: class { observe() {} disconnect() {} }, getComputedStyle });
  return module.exports;
};
afterEach(() => { document.body.innerHTML = ''; document.documentElement.className = ''; });

it.each(['mobileGarden', 'mobileBay'])('%s 清晰原图从 HUD 内延伸到导航边缘，交互主体保留完整', key => {
  const stage = load(), scene = cal[key];
  for (const [width, height] of [[320, 740], [390, 844], [430, 932], [480, 960]]) {
    const chrome = { hud: { x0: 8, x1: width - 8, bottom: 64 }, dock: { x0: 8, x1: width - 8, top: height - 88 } };
    const frame = stage.mobileFrame(scene, width, height, chrome);
    expect(frame.oy).toBeLessThanOrEqual(chrome.hud.bottom);
    expect(frame.oy + scene.image[1] * frame.s).toBeCloseTo(chrome.dock.top, 5);
    // No extra zoom or anisotropic scaling: original pixels and hit geometry share one scale.
    expect(frame.s).toBeCloseTo(width / scene.safe[2], 5);
    const boxes = key === 'mobileGarden' ? [scene.stall.rect, scene.areaSign, ...scene.plots.map((p: any) => p.hitRect)] : [scene.aquarium.outerRect, scene.areaSign];
    for (const [, y, , h] of boxes) {
      expect(frame.oy + y * frame.s).toBeGreaterThanOrEqual(chrome.hud.bottom - 0.01);
      expect(frame.oy + (y + h) * frame.s).toBeLessThanOrEqual(chrome.dock.top + 0.01);
    }
  }
});

it.each(['garden', 'bay'])('%s 实际挂载与改尺寸时同步竿梢、场景和引导位置', area => {
  document.documentElement.classList.add('light-note-mobile-rendering');
  document.body.innerHTML = '<section class="garden-scene"><div class="scene-stage"></div><div id="gameHud"><button></button></div><nav class="game-dock"></nav><button id="purifierSpot" hidden></button><div id="pondSpot"><svg class="pond-art"></svg></div></section>';
  const scene = document.querySelector<HTMLElement>('.garden-scene')!, hud = scene.querySelector<HTMLElement>('#gameHud')!, dock = scene.querySelector<HTMLElement>('.game-dock')!;
  let width = 390, height = 844;
  const rect = (x: number, y: number, w: number, h: number) => ({ x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, toJSON() {} });
  scene.getBoundingClientRect = () => rect(0, 0, width, height);
  hud.getBoundingClientRect = () => rect(8, 8, width - 16, 52);
  hud.querySelector('button')!.getBoundingClientRect = hud.getBoundingClientRect;
  dock.getBoundingClientRect = () => rect(8, height - 82, width - 16, 74);
  const stage = load(); stage.setArea(area);
  stage.mount(scene);
  expect(scene.querySelector<HTMLElement>('.scene-stage')!.style.transform).not.toMatch(/NaN|undefined/);
  expect(scene.querySelector('svg')!.getAttribute('viewBox')).toMatch(/^0 0 /);
  width = 320; height = 740;
  stage.layout();
  expect(Number.isFinite(Number.parseFloat(scene.style.getPropertyValue('--guide-y')))).toBe(true);
});

const layoutRule = () => read('garden-loader.js').match(/function manorMobileLayout\(\)\{[^\n]*\}\n/)![0];
it('首屏素材与场景布局共用同一判定：竖屏平板用手机构图，横屏平板与手机横屏参数各自生效', () => {
  const mobile = (innerWidth: number, innerHeight: number, search = '') => runInNewContext(`${layoutRule()};manorMobileLayout()`, {
    document: { documentElement: { classList: { contains: () => false } } }, innerWidth, innerHeight, URLSearchParams, location: { search },
  });
  expect(mobile(390, 844)).toBe(true);
  expect(mobile(900, 1200)).toBe(true);
  expect(mobile(1024, 768)).toBe(false);
  expect(mobile(1440, 900)).toBe(false);
  expect(mobile(740, 360, '?renderProfile=mobile')).toBe(true);
  // The loader and the scene must not keep a second copy of this rule.
  expect(read('garden-loader.js')).toContain("boot[manorMobileLayout()?'mobile':'desktop']");
  expect(read('garden-ui.js')).toContain('const mobile = manorMobileLayout();');
});
it('大屏只增加菜单和弹框的可读比例，场景比例和手机密度保持独立', () => {
  const source = read('garden-ui.js');
  const apply = layoutRule() + source.slice(source.indexOf('function applyDensity('), source.indexOf('function init()'));
  for (const [width, height, mobile, expected] of [[2560,1390,false,1.5],[1920,1080,false,1.2],[1470,726,false,1],[390,844,true,1]] as const) {
    document.documentElement.className = mobile ? 'force-mobile' : '';
    runInNewContext(`${apply};applyDensity(false)`, {
      document, innerWidth: width, innerHeight: height, view: 'tree', URLSearchParams, location: {search:''},
      $: () => ({value:'standard',getBoundingClientRect:()=>({height:0})}), requestAnimationFrame:()=>{}, positionFeedback:()=>{},
    });
    expect(document.documentElement.style.getPropertyValue('--d')).toBe('1');
    expect(Number(document.documentElement.style.getPropertyValue('--game-ui-d'))).toBeCloseTo(expected);
    expect(Number.parseFloat(document.documentElement.style.getPropertyValue('--font'))).toBeCloseTo(14*expected);
  }
});
