import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { posix } from 'node:path';
import type { Plugin } from 'vite';
import icon from '../config/icon';
type PreloadScene = { asset: string; area?: string; assetSources?: { asset: string; width: number }[]; water: string; smooth?: string; skyBleed?: { asset: string }; detailTiles?: { asset: string }[] };

// Fixed, visible controls are known before scripts and the account snapshot.
// Keep startup and idle prewarming on one list; crops/fish remain state-driven.
const firstScreenArt = (scene: PreloadScene) => [
  'farm/game-ui-r53.webp', 'garden-tools-r53.webp', 'farm/plot-canvas-r53.webp',
  'farm/bed-dry-r55.webp', 'farm/bed-wet-soil-r55.webp',
  'incoming/farm-r2/sprites/icon-sprout.webp', 'incoming/farm-r2/sprites/hand-open.webp',
  ...['backpack', 'shop', 'atlas'].map(key => `incoming/dock-r3/${key}.webp`),
  ...(scene.area === 'bay' ? [] : ['farm/hive-states-r53.webp']),
  ...(scene.area === 'garden' ? [] : [
    'farm/purifier-states-r53.webp', 'farm/purifier-plinth-r53.webp',
    'farm/workshop-states-r53.webp', 'incoming/dock-r3/aquarium.webp',
    'incoming/farm-r2/sprites/icon-bait.webp',
    ...(scene.area ? [] : ['farm/bait-box-r57.webp']),
  ]),
];
const imageVariable = (path: string) => `--manor-art-${createHash('sha256').update(path).digest('hex').slice(0, 12)}`;
const curtainAsset = 'knowledge-garden-v19/courtyard/area-curtain-r17.webp';

// Classic scene scripts and the server use one copy of the confirmed deterministic rules.
export default function manorRuntime(): Plugin {
  const modelFile = fileURLToPath(new URL('../../../../packages/shared/manorModel.js', import.meta.url));
  const publicRoot = new URL('../../public/manor/', import.meta.url);
  const classicSource = () => readFileSync(modelFile, 'utf8').replace(/export default GardenModel;\s*$/, '');
  const runtimeSources = () => {
    const entry = readFileSync(new URL('index.html', publicRoot), 'utf8');
    const files = new Map<string, string>();
    const scripts = [...entry.matchAll(/<script defer src="([^"?]+)[^"]*"[^>]*><\/script>/g)];
    const styles = [...entry.matchAll(/<link rel="stylesheet" href="([^"?]+)[^"]*" \/>/g)];
    // Preserve classic global scope, script order and the CSS cascade. The UI
    // still mounts only after its authenticated snapshot. Fixed scene and water
    // inputs are compiled ahead of time, rather than recomposited on entry.
    files.set(
      'knowledge-garden-v19/runtime.js',
      scripts
        .map(
          ([, path]) =>
            `;\n${path === 'garden-model.js' ? classicSource() : readFileSync(new URL(path, publicRoot), 'utf8')}\n`,
        )
        .join(''),
    );
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
      '<script defer src="knowledge-garden-v19/runtime.js" data-ui-script="knowledge-garden-v19/garden-ui.js"></script>',
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
    html = html.replace(
      '</head>',
      `<link rel="preload" as="script" href="${html.match(/data-ui-script="([^"]+)"/)![1]}"><script type="application/json" id="manor-icon-assets">${JSON.stringify({reset:resetIcon,loading:loadingIcon})}</script><script type="application/json" id="manor-boot-images">${JSON.stringify({ desktop: bootImages(calibration.desktop), mobile: bootImages(calibration.mobileGarden), mobileBay: bootImages(calibration.mobileBay), curtain: [{src:curtainAsset,variable:imageVariable(curtainAsset)}] })}</script></head>`,
    );
    return { html, files };
  };
  const documentSource = () => runtimeSources().html;
  // Read the existing scene calibration, so prewarming follows the shipped art.
  const preloadSource = () => {
    const calibration = runInNewContext(
      `${readFileSync(new URL('knowledge-garden-v19/farm-calibration.js', publicRoot), 'utf8')};FARM_CAL`,
      {},
    ) as Record<'desktop' | 'mobileGarden' | 'mobileBay', PreloadScene>;
    const code = [
      ...documentSource().matchAll(/\b(?:src|href|data-ui-script)="([^"]+)"/g),
    ].map((match) => `/manor/${match[1]}`);
    const art = (scene: PreloadScene): string[] =>
      [scene.asset, scene.water, scene.smooth, scene.skyBleed?.asset, ...(scene.detailTiles || []).map((tile) => tile.asset)]
        .filter(Boolean)
        .map((file) => `/manor/knowledge-garden-v19/${file}`);
    const common = (scene: PreloadScene) => firstScreenArt(scene).map(file => `/manor/knowledge-garden-v19/${file}`);
    return JSON.stringify({
      desktop: [...new Set([...art(calibration.desktop), ...common(calibration.desktop), ...code])],
      desktopCritical: [...new Set([...code, ...art(calibration.desktop), ...common(calibration.desktop)])],
      mobileCritical: [...new Set([...code, ...art(calibration.mobileGarden), ...common(calibration.mobileGarden)])],
      mobile: [...new Set([...art(calibration.mobileGarden), ...common(calibration.mobileGarden), ...art(calibration.mobileBay), ...common(calibration.mobileBay), `/manor/${curtainAsset}`, ...code])],
      desktopScene: calibration.desktop.assetSources?.map(({ asset, width }) => ({
        url: `/manor/knowledge-garden-v19/${asset}`, width,
      })),
    });
  };
  return {
    name: 'lightnote-manor-runtime',
    transformIndexHtml() {
      const css = readFileSync(new URL('../view/manor/manorLoading.css', import.meta.url), 'utf8');
      const loadingIcon = 'data:image/svg+xml,' + encodeURIComponent(icon.manor.entry);
      return [{ tag: 'style', attrs: { 'data-manor-entry-loading': 'true' }, injectTo: 'head' as const,
        children: `html.light-note-manor-entry{--manor-loading-icon:url("${loadingIcon}")}\n${css}` }];
    },
    configureServer(server) {
      for (const file of ['runtime.js', 'runtime.css'])
        server.middlewares.use(`/manor/knowledge-garden-v19/${file}`, (_req, res) => {
          res.setHeader(
            'Content-Type',
            file.endsWith('.js') ? 'application/javascript; charset=utf-8' : 'text/css; charset=utf-8',
          );
          res.end(runtimeSources().files.get(`knowledge-garden-v19/${file}`));
        });
      server.middlewares.use('/manor/preload.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(preloadSource());
      });
      server.middlewares.use('/manor/index.html', (_req, res) => {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(documentSource());
      });
      server.middlewares.use('/manor/garden-model.js', (_req, res) => {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.end(classicSource());
      });
    },
    generateBundle() {
      for (const [fileName, source] of runtimeSources().files)
        this.emitFile({ type: 'asset', fileName: `manor/${fileName}`, source });
      this.emitFile({ type: 'asset', fileName: 'manor/preload.json', source: preloadSource() });
      this.emitFile({ type: 'asset', fileName: 'manor/garden-model.js', source: classicSource() });
      this.emitFile({ type: 'asset', fileName: 'manor/index.html', source: documentSource() });
    },
  };
}
