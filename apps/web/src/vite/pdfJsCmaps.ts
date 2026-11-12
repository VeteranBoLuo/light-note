import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { Plugin } from 'vite';

const virtualId = 'virtual:lightnote-pdf-cmaps';
const resolvedVirtualId = `\0${virtualId}`;

export default function pdfJsCmaps(): Plugin {
  const require = createRequire(import.meta.url);
  const sourceDirectory = join(dirname(require.resolve('pdfjs-dist/package.json')), 'cmaps');
  const mapNames = readdirSync(sourceDirectory)
    .filter((name) => name.endsWith('.bcmap'))
    .sort();
  if (!mapNames.length) throw new Error('pdfjs-dist has no packed CMaps');

  const files = new Map<string, Buffer>();
  const hash = createHash('sha256');
  for (const name of [...mapNames, 'LICENSE']) {
    const source = readFileSync(join(sourceDirectory, name));
    files.set(name, source);
    hash.update(`${name}:${source.byteLength}\n`).update(source);
  }

  // PDF.js requests maps by name. Hash the directory so individual names can
  // stay intact and previous releases can keep serving their own maps.
  const assetDirectory = `assets/pdfjs-${hash.digest('hex').slice(0, 16)}/cmaps/`;
  let cMapUrl: string;

  return {
    name: 'lightnote-pdf-cmaps',
    configResolved({ base }) {
      cMapUrl = `${base}${assetDirectory}`;
    },
    resolveId(id) {
      if (id === virtualId) return resolvedVirtualId;
    },
    load(id) {
      if (id === resolvedVirtualId) return `export default ${JSON.stringify(cMapUrl)};`;
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split('?')[0];
        if (!path?.startsWith(cMapUrl) || (request.method !== 'GET' && request.method !== 'HEAD')) return next();

        const name = path.slice(cMapUrl.length);
        const source = files.get(name);
        if (!source) {
          response.statusCode = 404;
          response.end();
          return;
        }
        response.setHeader(
          'Content-Type',
          name === 'LICENSE' ? 'text/plain; charset=utf-8' : 'application/octet-stream',
        );
        response.setHeader('Content-Length', source.byteLength);
        response.end(request.method === 'HEAD' ? undefined : source);
      });
    },
    generateBundle() {
      for (const [name, source] of files) {
        this.emitFile({ type: 'asset', fileName: `${assetDirectory}${name}`, source });
      }
    },
  };
}
