import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { posix } from 'node:path';
import { transformWithEsbuild, type Plugin } from 'vite';
import icon from '../config/icon';
import zh from '../i18n/locales/zh-CN-core';
import en from '../i18n/locales/en-US-core';
type PreloadScene = { asset: string; area?: string; assetSources?: { asset: string; width: number }[]; water: string; smooth?: string; skyBleed?: { asset: string }; detailTiles?: { asset: string }[] };

// Fixed, visible controls are known before scripts and the account snapshot.
// Keep startup and idle prewarming on one list; crops/fish remain state-driven.
const firstScreenArt = (scene: PreloadScene) => [
  'farm/game-ui-r53.webp', 'garden-tools-r53.webp', 'farm/plot-canvas-r53.webp',
  'farm/bed-dry-r55.webp', 'farm/bed-wet-soil-r55.webp',
  'incoming/farm-r2/sprites/icon-sprout.webp', 'incoming/farm-r2/sprites/hand-open.webp',
  ...['backpack', 'shop', 'atlas'].map(key => `incoming/dock-r3/${key}.webp`),
  ...(scene.area === 'bay' ? [] : ['farm/hive-states-r53.webp', 'farm/composter-sealed-r68.webp', 'farm/composter-lv1-r68.webp']),
  ...(scene.area === 'garden' ? [] : [
    'farm/purifier-states-r53.webp', 'farm/purifier-plinth-r53.webp',
    'farm/workshop-states-r53.webp', 'incoming/dock-r3/aquarium.webp',
    'incoming/farm-r2/sprites/icon-bait.webp',
    ...(scene.area ? [] : ['farm/bait-box-r57.webp']),
  ]),
];
// Each classic script is minified on its own: esbuild keeps top-level names, which
// later scripts and the separately loaded UI read as globals. The host only opens
// the manor on Chromium 105+ class browsers, so syntax is not lowered further.
const minified = new Map<string, Promise<string>>();
function minifyClassic(name: string, code: string) {
  const key = createHash('sha256').update(code).digest('hex');
  if (!minified.has(key)) {
    if (minified.size > 64) minified.clear();
    minified.set(key, transformWithEsbuild(code, name, { loader: 'js', minify: true, target: 'chrome105', legalComments: 'none' }).then(result => result.code));
  }
  return minified.get(key)!;
}
const threeVendor = 'knowledge-garden-v19/vendor/three-0.160.1.min.js';
const imageVariable = (path: string) => `--manor-art-${createHash('sha256').update(path).digest('hex').slice(0, 12)}`;
const curtainAsset = 'knowledge-garden-v19/courtyard/area-curtain-r17.webp';

// Classic scene scripts and the server use one copy of the confirmed deterministic rules.
export default function manorRuntime(): Plugin {
  const modelFile = fileURLToPath(new URL('../../../../packages/shared/manorModel.js', import.meta.url));
  const publicRoot = new URL('../../public/manor/', import.meta.url);
  const classicSource = () => readFileSync(modelFile, 'utf8').replace(/export default GardenModel;\s*$/, '');
  const runtimeSources = async () => {
    const entry = readFileSync(new URL('index.html', publicRoot), 'utf8');
    const files = new Map<string, string>();
    const scripts = [...entry.matchAll(/<script defer src="([^"?]+)[^"]*"[^>]*><\/script>/g)];
    const styles = [...entry.matchAll(/<link rel="stylesheet" href="([^"?]+)[^"]*" \/>/g)];
    // Preserve classic global scope, script order and the CSS cascade. The UI
    // still mounts only after its authenticated snapshot. Fixed scene and water
    // inputs are compiled ahead of time, rather than recomposited on entry.
    const classic = await Promise.all(scripts.map(([, path]) =>
      minifyClassic(path, path === 'garden-model.js' ? classicSource() : readFileSync(new URL(path, publicRoot), 'utf8'))));
    files.set('knowledge-garden-v19/runtime.js', classic.map(code => `;\n${code}\n`).join(''));
    const ui = entry.match(/data-ui-script="([^"?]+)/)![1];
    files.set('knowledge-garden-v19/runtime-ui.js', await minifyClassic(ui, readFileSync(new URL(ui, publicRoot), 'utf8')));
    files.set(
      'knowledge-garden-v19/runtime.css',
      styles.map(([, path]) => readFileSync(new URL(path, publicRoot), 'utf8')).join('\n')
        .replace(/url\(["']?([^"')]+)["']?\)/g, (original, path: string) => {
          const logical = posix.normalize(`knowledge-garden-v19/${path}`);
          return logical === curtainAsset || firstScreenArt({ asset: '', water: '' }).some(file => logical === `knowledge-garden-v19/${file}`)
            ? `var(${imageVariable(logical)},${original})` : original;
        }),
    );
    let html = entry.replace(styles[0][0], '<link rel="stylesheet" href="knowledge-garden-v19/runtime.css" />');
    for (const [tag] of styles.slice(1)) html = html.replace(tag, '');
    html = html.replace(
      scripts[0][0],
      '<script defer src="knowledge-garden-v19/runtime.js" data-ui-script="knowledge-garden-v19/runtime-ui.js"></script>',
    );
    for (const [tag] of scripts.slice(1)) html = html.replace(tag, '');
    html = html.replace(
      /\b(src|href|data-ui-script)="([^"#]+)"/g,
      (_match, attribute: string, url: string) => {
        const path = url.split('?')[0];
        const source = files.get(path) ?? readFileSync(new URL(path, publicRoot));
        const version = createHash('sha256').update(source).digest('hex').slice(0, 16);
        return `${attribute}="${path}?v=${version}"`;
      },
    );
    const calibration = runInNewContext(
      `${readFileSync(new URL('knowledge-garden-v19/farm-calibration.js', publicRoot), 'utf8')};FARM_CAL`,
      {},
    ) as Record<string, PreloadScene>;
    const bootImages = (scene: PreloadScene) => [
      {
        src: `knowledge-garden-v19/${scene.asset}`,
        srcset: scene.assetSources?.map(({ asset, width }) => `knowledge-garden-v19/${asset} ${width}w`).join(', '),
        sizes: scene.assetSources ? '100vw' : undefined,
        priority: 'high',
        variable: imageVariable(`knowledge-garden-v19/${scene.asset}`),
      },
      ...[scene.water, scene.smooth, scene.skyBleed?.asset, ...(scene.detailTiles || []).map((tile) => tile.asset), ...firstScreenArt(scene)]
        .filter(Boolean)
        .map((file) => ({ src: `knowledge-garden-v19/${file}`, variable: imageVariable(`knowledge-garden-v19/${file}`) })),
    ];
    const resetIcon = 'data:image/svg+xml,' + encodeURIComponent(icon.infrastructure.restart.replace('<svg ', '<svg style="color:#76572c" '));
    const loadingIcon = 'data:image/svg+xml,' + encodeURIComponent(icon.manor.entry);
    const moreIcon = 'data:image/svg+xml,' + encodeURIComponent(icon.noteDetail.toolbar.more.replace('<svg ', '<svg style="color:#6e512b" '));
    html = html.replace(
      '</head>',
      `<link rel="preload" as="script" href="${html.match(/data-ui-script="([^"]+)"/)![1]}"><script type="application/json" id="manor-icon-assets">${JSON.stringify({reset:resetIcon,loading:loadingIcon,more:moreIcon})}</script><script type="application/json" id="manor-boot-images">${JSON.stringify({ desktop: bootImages(calibration.desktop), mobile: bootImages(calibration.mobileGarden), mobileBay: bootImages(calibration.mobileBay), curtain: [{src:curtainAsset,variable:imageVariable(curtainAsset)}] })}</script></head>`,
    );
    return { html, files };
  };
  const documentSource = async () => (await runtimeSources()).html;
  // Read the existing scene calibration, so prewarming follows the shipped art.
  const preloadSource = async () => {
    const calibration = runInNewContext(
      `${readFileSync(new URL('knowledge-garden-v19/farm-calibration.js', publicRoot), 'utf8')};FARM_CAL`,
      {},
    ) as Record<'desktop' | 'mobileGarden' | 'mobileBay', PreloadScene>;
    const code = [
      ...(await documentSource()).matchAll(/\b(?:src|href|data-ui-script)="([^"]+)"/g),
    ].map((match) => `/manor/${match[1]}`);
    const art = (scene: PreloadScene): string[] =>
      [scene.asset, scene.water, scene.smooth, scene.skyBleed?.asset, ...(scene.detailTiles || []).map((tile) => tile.asset)]
        .filter(Boolean)
        .map((file) => `/manor/knowledge-garden-v19/${file}`);
    const common = (scene: PreloadScene) => firstScreenArt(scene).map(file => `/manor/knowledge-garden-v19/${file}`);
    // Derive the catalog from the actual renderers, including SVG image atlases
    // and their detail art. Never add it to the blocking first-screen manifest.
    const fishArt = runInNewContext(`${readFileSync(new URL('knowledge-garden-v19/fish-art.js', publicRoot), 'utf8')};Object.keys(FISH).map(key=>fishArt(key)).join('')`) as string;
    const cropArt = runInNewContext(`${classicSource()};${readFileSync(new URL('knowledge-garden-v19/farm-art.js', publicRoot), 'utf8')};Object.keys(GardenModel.CROPS).map(key=>FarmArt.icon(key)+FarmArt.cropCard(key,4)+FarmArt.packet(key)).join('')+Object.keys(GardenModel.FERT).map(key=>FarmArt.fertilizer(key)).join('')+Object.keys(FarmArt.WILDLIFE_IMAGES).map(key=>FarmArt.wildlife(key)).join('')`) as string;
    const catalog = [...new Set([
      ...[...`${fishArt}${cropArt}`.matchAll(/\b(?:src|href)="(knowledge-garden-v19\/[^"]+)"/g)].map(([, file]) => `/manor/${file}`),
      '/manor/knowledge-garden-v19/farm/wildlife-rabbit-action-3-r14.webp',
      '/manor/knowledge-garden-v19/farm/composter-residue-r64.webp',
      '/manor/knowledge-garden-v19/farm/seed-ground-r69.webp',
      ...['lv1','lv2','lv3','sealed'].map(frame=>`/manor/knowledge-garden-v19/farm/composter-${frame}-r68.webp`),
    ])];
    return JSON.stringify({
      catalog,
      // three.js serves only the idle 3D enhancement; it is prewarmed, never part of the first screen.
      desktop: [...new Set([...art(calibration.desktop), ...common(calibration.desktop), ...code, `/manor/${threeVendor}`])],
      desktopCritical: [...new Set([...code, ...art(calibration.desktop), ...common(calibration.desktop)])],
      mobileCritical: [...new Set([...code, ...art(calibration.mobileGarden), ...common(calibration.mobileGarden)])],
      mobile: [...new Set([...art(calibration.mobileGarden), ...common(calibration.mobileGarden), ...art(calibration.mobileBay), ...common(calibration.mobileBay), `/manor/${curtainAsset}`, ...code, `/manor/${threeVendor}`])],
      desktopScene: calibration.desktop.assetSources?.map(({ asset, width }) => ({
        url: `/manor/knowledge-garden-v19/${asset}`, width,
      })),
    });
  };
  return {
    name: 'lightnote-manor-runtime',
    transformIndexHtml(html) {
      const css = readFileSync(new URL('../view/manor/manorLoading.css', import.meta.url), 'utf8');
      const loadingIcon = 'data:image/svg+xml,' + encodeURIComponent(icon.manor.entry);
      const escape = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
      const copy = (key: 'loading' | 'loadingHint') => `<span lang="zh-CN">${escape(zh.manor[key])}</span><span lang="en">${escape(en.manor[key])}</span>`;
      // Vue replaces these root children on mount. The first paint already has
      // the same 0% cover, even before the route and account modules are ready.
      const cover = `<section class="manor-entry-loading manor-loading"><div class="manor-loading__card" role="status"><span class="manor-loading__crest" aria-hidden="true"></span><span class="manor-loading__content"><span class="manor-loading__title" id="manor-entry-loading-title">${copy('loading')}</span><span class="manor-loading__static-progress" role="progressbar" aria-labelledby="manor-entry-loading-title" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"></span><span class="manor-loading__detail">0% · ${copy('loadingHint')}</span></span></div></section>`;
      return {
        html: html.replace('<div id="app"></div>', `<div id="app">${cover}</div>`),
        tags: [{ tag: 'style', attrs: { 'data-manor-entry-loading': 'true' }, injectTo: 'head' as const,
          children: `html.light-note-manor-entry{--manor-loading-icon:url("${loadingIcon}")}\n${css}` }],
      };
    },
    configureServer(server) {
      const serve = (path: string, type: string, source: () => Promise<string | undefined>, cache?: string) =>
        server.middlewares.use(path, (_req, res, next) => {
          source().then(body => {
            res.setHeader('Content-Type', type);
            if (cache) res.setHeader('Cache-Control', cache);
            res.end(body);
          }, next);
        });
      for (const file of ['runtime.js', 'runtime-ui.js', 'runtime.css'])
        serve(`/manor/knowledge-garden-v19/${file}`,
          file.endsWith('.js') ? 'application/javascript; charset=utf-8' : 'text/css; charset=utf-8',
          async () => (await runtimeSources()).files.get(`knowledge-garden-v19/${file}`));
      serve('/manor/preload.json', 'application/json', preloadSource, 'no-cache');
      serve('/manor/index.html', 'text/html; charset=utf-8', documentSource, 'no-cache');
      serve('/manor/garden-model.js', 'application/javascript; charset=utf-8', async () => classicSource());
    },
    async generateBundle() {
      for (const [fileName, source] of (await runtimeSources()).files)
        this.emitFile({ type: 'asset', fileName: `manor/${fileName}`, source });
      this.emitFile({ type: 'asset', fileName: 'manor/preload.json', source: await preloadSource() });
      this.emitFile({ type: 'asset', fileName: 'manor/garden-model.js', source: classicSource() });
      this.emitFile({ type: 'asset', fileName: 'manor/index.html', source: await documentSource() });
    },
  };
}
