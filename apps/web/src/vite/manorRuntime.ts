import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import type { Plugin } from 'vite';
import icon from '../config/icon';
type PreloadScene = { asset: string; assetSources?: { asset: string; width: number }[]; water: string; smooth?: string; skyBleed?: { asset: string }; detailTiles?: { asset: string }[] };

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
      styles.map(([, path]) => readFileSync(new URL(path, publicRoot), 'utf8')).join('\n'),
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
      },
      ...[scene.water, scene.smooth, scene.skyBleed?.asset, ...(scene.detailTiles || []).map((tile) => tile.asset)]
        .filter(Boolean)
        .map((file) => ({ src: `knowledge-garden-v19/${file}` })),
    ];
    const resetIcon = 'data:image/svg+xml,' + encodeURIComponent(icon.infrastructure.restart.replace('<svg ', '<svg style="color:#76572c" '));
    html = html.replace(
      '</head>',
      `<script type="application/json" id="manor-icon-assets">${JSON.stringify({reset:resetIcon})}</script><script type="application/json" id="manor-boot-images">${JSON.stringify({ desktop: bootImages(calibration.desktop), mobile: bootImages(calibration.mobileGarden) })}</script></head>`,
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
    const common = [
      'farm/game-ui-r53.webp',
      'garden-tools-r53.webp',
      'farm/plot-canvas-r53.webp',
      'farm/purifier-states-r53.webp',
      'farm/bed-dry.webp',
      'farm/purifier-plinth-r53.webp',
      ...['backpack', 'shop', 'aquarium', 'atlas'].map((key) => `incoming/dock-r3/${key}.webp`),
    ].map((file) => `/manor/knowledge-garden-v19/${file}`);
    return JSON.stringify({
      desktop: [...new Set([...art(calibration.desktop), ...common, ...code])],
      mobile: [...new Set([...art(calibration.mobileGarden), ...common, ...art(calibration.mobileBay), ...code])],
      desktopScene: calibration.desktop.assetSources?.map(({ asset, width }) => ({
        url: `/manor/knowledge-garden-v19/${asset}`, width,
      })),
    });
  };
  return {
    name: 'lightnote-manor-runtime',
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
