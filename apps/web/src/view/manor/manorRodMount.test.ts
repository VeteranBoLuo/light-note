import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { resolve } from 'node:path';
import { afterEach, expect, it } from 'vitest';

const read = (name: string) => readFileSync(resolve(process.cwd(), 'public/manor/knowledge-garden-v19', name), 'utf8');
const cal = runInNewContext(`${read('farm-calibration.js')};FARM_CAL`);
const stageModule = { exports: {} as { pierGeometry: (scene: any) => any } };
runInNewContext(read('farm-stage.js'), { module: stageModule });
afterEach(() => { document.body.innerHTML = ''; document.documentElement.className = ''; });

it.each([
  // Measured clear wood inside the front lip, excluding the bucket, stool and posts.
  ['desktop', [620, 1245, 725, 1323], [1280, 1470, 1920]],
  ['mobileBay', [778, 420, 836, 465], [320, 390, 480]],
] as const)('%s keeps the whole mount on the deck when resizing and aiming', (profile, wood, widths) => {
  const scene = cal[profile], g = stageModule.exports.pierGeometry(scene);
  const u = 1000 / (g.box[2] - g.box[0]);
  document.documentElement.classList.toggle('light-note-mobile-rendering', profile === 'mobileBay');
  document.body.innerHTML = `<section id="pondSpot"><svg class="pond-art">${[
    'float-size', 'ripples-size', 'sea-rod', 'sea-rod-highlight', 'rod-grip',
    'rod-mount', 'rod-reel', 'fishing-line', 'sea-float', 'sea-ripples', 'aim-ring',
  ].map(name => `<g class="${name}"></g>`).join('')}</svg></section>`;
  const module = { exports: {} as { refreshAim: () => void } };
  runInNewContext(read('garden-courtyard.js'), { module, document, FarmStage: { pier: () => g } });
  const pond = document.querySelector<HTMLElement>('#pondSpot')!;
  const svg = document.querySelector<SVGSVGElement>('.pond-art')!;
  const mount = document.querySelector('.rod-mount')!;
  for (const width of widths) {
    const sceneScale = width / scene.image[0], svgScale = sceneScale / u;
    svg.getScreenCTM = () => ({ a: svgScale, b: 0, c: 0, d: svgScale }) as DOMMatrix;
    module.exports.refreshAim();
    const pose = mount.getAttribute('transform')!;
    const [x, y, sx, sy] = pose.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g)!.map(Number);
    // Entire plate, including its lower front face, must contact real deck wood.
    for (const [px, py] of [[-17, -2], [5, -9], [18, -3], [-5, 9], [-17, 2], [18, 2]]) {
      const nativeX = g.box[0] + (x + px * sx) * svgScale / sceneScale;
      const nativeY = g.box[1] + (y + py * sy) * svgScale / sceneScale;
      expect(nativeX).toBeGreaterThan(wood[0]); expect(nativeX).toBeLessThan(wood[2]);
      expect(nativeY).toBeGreaterThan(wood[1]); expect(nativeY).toBeLessThan(wood[3]);
    }
    pond.dataset.landing = `${g.center[0] + g.radius[0] / 2},${g.center[1]}`;
    module.exports.refreshAim();
    expect(mount.getAttribute('transform')).toBe(pose);
  }
});
