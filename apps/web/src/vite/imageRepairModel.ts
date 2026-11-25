import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { copyFile, mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream } from 'node:stream/web';
import type { Plugin } from 'vite';

const MODEL_SHA256 = '1fa042eaf30a6660b9190f0a1512d27bdceff90fab172af295303cdf2905e516';
const MODEL_SOURCE = 'https://wipe.photos/models/lama_512_fp16.onnx';
const MODEL_FILE = 'lama_512_fp16.onnx';
const MODEL_BYTES = 106_559_381;
const runtimeFiles = [
  'ort.webgpu.min.mjs',
  'ort-wasm-simd-threaded.asyncify.mjs',
  'ort-wasm-simd-threaded.asyncify.wasm',
] as const;

async function isVerifiedModel(path: string) {
  const size = await stat(path).then(
    (file) => file.size,
    () => 0,
  );
  if (size !== MODEL_BYTES) return false;
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex') === MODEL_SHA256;
}

async function prepareModel(path: string) {
  if (await isVerifiedModel(path)) return;
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const response = await fetch(MODEL_SOURCE, { signal: AbortSignal.timeout(180_000) });
    if (!response.ok || !response.body) throw new Error(`LaMa download failed (HTTP ${response.status})`);
    await pipeline(
      Readable.fromWeb(response.body as ReadableStream<Uint8Array>),
      createWriteStream(temporary, { flags: 'wx' }),
    );
    if (!(await isVerifiedModel(temporary))) throw new Error('LaMa model failed integrity verification');
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

export default function imageRepairModel(): Plugin {
  const virtualId = 'virtual:lightnote-image-repair-model';
  const resolvedId = '\0' + virtualId;
  const digest = MODEL_SHA256.slice(0, 16);
  let root: string;
  let url: string;
  let directory: string;
  let cachePath: string;
  let files: Map<string, string>;
  let pending: Promise<void> | undefined;

  // Share the first download among development requests. A failed attempt can be retried.
  function ensureModel() {
    pending ??= prepareModel(cachePath).catch((error) => {
      pending = undefined;
      throw error;
    });
    return pending;
  }

  return {
    name: 'lightnote-image-repair-model',
    async configResolved(config) {
      root = config.root;
      const runtime = dirname(createRequire(import.meta.url).resolve('onnxruntime-web'));
      const { version } = JSON.parse(await readFile(resolve(runtime, '../package.json'), 'utf8'));
      directory = `assets/lama-${digest}-ort-${version}`;
      url = `${config.base}${directory}/`;
      cachePath = join(root, 'node_modules', '.cache', 'lightnote', `lama-${digest}.onnx`);
      files = new Map<string, string>(runtimeFiles.map((name) => [name, join(runtime, name)]));
      files.set(MODEL_FILE, cachePath);
      files.set('LaMa-LICENSE.txt', join(root, 'src/vite/licenses/lama.txt'));
      files.set('ONNX-Runtime-LICENSE.txt', join(root, 'src/vite/licenses/onnxruntime.txt'));
    },
    resolveId(id) {
      if (id === virtualId) return resolvedId;
    },
    load(id) {
      if (id === resolvedId) return `export default ${JSON.stringify(url)};`;
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split('?')[0];
        if (!path?.startsWith(url) || (request.method !== 'GET' && request.method !== 'HEAD')) return next();
        const name = path.slice(url.length);
        const file = files.get(name);
        if (!file) {
          response.writeHead(404).end();
          return;
        }
        void (async () => {
          if (name === MODEL_FILE && request.method === 'GET') await ensureModel();
          if (response.destroyed) return;
          const contentType = name.endsWith('.mjs')
            ? 'text/javascript'
            : name.endsWith('.wasm')
              ? 'application/wasm'
              : name.endsWith('.txt')
                ? 'text/plain; charset=utf-8'
                : 'application/octet-stream';
          response.setHeader('Content-Type', contentType);
          response.setHeader('Content-Length', name === MODEL_FILE ? MODEL_BYTES : (await stat(file)).size);
          response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          if (request.method === 'HEAD') response.end();
          else await pipeline(createReadStream(file), response);
        })().catch((error) => {
          if (response.destroyed) return;
          server.config.logger.error(`Enhanced image repair assets: ${error.message}`);
          if (response.headersSent) response.destroy();
          else response.writeHead(503).end();
        });
      });
    },
    async writeBundle(options) {
      // Copy directly to the release assets, outside the automatic code prewarm manifest.
      await ensureModel();
      const destination = resolve(root, options.dir!, directory);
      await mkdir(destination, { recursive: true });
      await Promise.all([...files].map(([name, source]) => copyFile(source, join(destination, name))));
    },
  };
}
