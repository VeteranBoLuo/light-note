import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

// Classic scene scripts and the server use one copy of the confirmed deterministic rules.
export default function manorRuntime(): Plugin {
  const modelFile = fileURLToPath(new URL('../../../../packages/shared/manorModel.js', import.meta.url));
  const publicRoot = new URL('../../public/manor/', import.meta.url);
  const classicSource = () => readFileSync(modelFile, 'utf8').replace(/export default GardenModel;\s*$/, '');
  const documentSource = () => readFileSync(new URL('index.html', publicRoot), 'utf8').replace(
    /\b(src|href|data-ui-script)="([^"#]+)"/g,
    (_match, attribute: string, url: string) => {
      const path = url.split('?')[0];
      const source = path === 'garden-model.js' ? classicSource() : readFileSync(new URL(path, publicRoot));
      const version = createHash('sha256').update(source).digest('hex').slice(0, 16);
      return `${attribute}="${path}?v=${version}"`;
    },
  );
  return {
    name: 'lightnote-manor-runtime',
    configureServer(server) {
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
      this.emitFile({ type: 'asset', fileName: 'manor/garden-model.js', source: classicSource() });
      this.emitFile({ type: 'asset', fileName: 'manor/index.html', source: documentSource() });
    },
  };
}
