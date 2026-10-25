import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import type { Plugin } from 'vite';
type PreloadScene = { asset: string; water: string; skyBleed?: { asset: string }; detailTiles?: { asset: string }[] };

// Classic scene scripts and the server use one copy of the confirmed deterministic rules.
export default function manorRuntime(): Plugin {
  const modelFile = fileURLToPath(new URL('../../../../packages/shared/manorModel.js', import.meta.url));
  const publicRoot = new URL('../../public/manor/', import.meta.url);
  const classicSource = () => readFileSync(modelFile, 'utf8').replace(/export default GardenModel;\s*$/, '');
  const documentSource = () =>
    readFileSync(new URL('index.html', publicRoot), 'utf8').replace(
      /\b(src|href|data-ui-script|data-worker)="([^"#]+)"/g,
      (_match, attribute: string, url: string) => {
        const path = url.split('?')[0];
        const source = path === 'garden-model.js' ? classicSource() : readFileSync(new URL(path, publicRoot));
        const version = createHash('sha256').update(source).digest('hex').slice(0, 16);
        return `${attribute}="${path}?v=${version}"`;
      },
    );
  // Read the existing scene calibration, so prewarming follows the shipped art.
  const preloadSource = () => {
    const calibration = runInNewContext(
      `${readFileSync(new URL('knowledge-garden-v19/farm-calibration.js', publicRoot), 'utf8')};FARM_CAL`,
      {},
    ) as Record<'desktop' | 'mobileGarden' | 'mobileBay', PreloadScene>;
    const code = [...documentSource().matchAll(/\b(?:src|href|data-ui-script|data-worker)="([^"]+)"/g)].map(
      (match) => `/manor/${match[1]}`,
    );
    const art = (scene: PreloadScene): string[] =>
      [scene.asset, scene.water, scene.skyBleed?.asset, ...(scene.detailTiles || []).map((tile) => tile.asset)]
        .filter(Boolean)
        .map((file) => `/manor/knowledge-garden-v19/${file}`);
    return JSON.stringify({
      desktop: [...new Set([...art(calibration.desktop), ...code])],
      mobile: [...new Set([...art(calibration.mobileGarden), ...art(calibration.mobileBay), ...code])],
    });
  };
  return {
    name: 'lightnote-manor-runtime',
    configureServer(server) {
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
      this.emitFile({ type: 'asset', fileName: 'manor/preload.json', source: preloadSource() });
      this.emitFile({ type: 'asset', fileName: 'manor/garden-model.js', source: classicSource() });
      this.emitFile({ type: 'asset', fileName: 'manor/index.html', source: documentSource() });
    },
  };
}
