import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import androidColorMixFallback from './src/vite/androidColorMixFallback';
import androidFontWeightFallback from './src/vite/androidFontWeightFallback';
import dynamicViewportFallback from './src/vite/dynamicViewportFallback';

function extensionStaticAssets(): Plugin {
  const assets = [
    ['public/favicon-16x16.png', 'icons/icon-16.png'],
    ['public/favicon-32x32.png', 'icons/icon-32.png'],
    ['extension/icons/icon-48.png', 'icons/icon-48.png'],
    ['extension/icons/icon-128.png', 'icons/icon-128.png'],
    ['public/icon-192.png', 'icons/icon-192.png'],
    ['public/icon-512.png', 'icons/icon-512.png'],
  ] as const;
  return {
    name: 'light-note-extension-static-assets',
    generateBundle() {
      const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'extension/manifest.json'), 'utf8'));
      this.emitFile({ type: 'asset', fileName: 'manifest.json', source: JSON.stringify(manifest, null, 2) });
      for (const [sourcePath, fileName] of assets) {
        this.emitFile({ type: 'asset', fileName, source: fs.readFileSync(path.resolve(__dirname, sourcePath)) });
      }
    },
  };
}

function extensionCspGate(): Plugin {
  const unsafeDynamicCode = /\beval\s*\(|\bnew\s+Function\s*\(/u;
  return {
    name: 'light-note-extension-csp-gate',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue;
        if (unsafeDynamicCode.test(output.code)) {
          this.error(`Manifest V3 CSP forbids eval/new Function in ${output.fileName}`);
        }
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  const appOrigin = String(env.VITE_EXTENSION_APP_ORIGIN || 'https://boluo66.top').replace(/\/$/u, '');
  return {
    root: path.resolve(__dirname, 'extension'),
    base: './',
    publicDir: false,
    define: {
      __LIGHTNOTE_APP_ORIGIN__: JSON.stringify(appOrigin),
      // MV3 forbids runtime code generation. Vue I18n's JIT mode interprets
      // precompiled message ASTs without eval/new Function.
      __INTLIFY_JIT_COMPILATION__: true,
      __INTLIFY_DROP_MESSAGE_COMPILER__: false,
    },
    plugins: [vue(), extensionStaticAssets(), extensionCspGate()],
    css: {
      postcss: {
        plugins: [androidColorMixFallback(), androidFontWeightFallback(), dynamicViewportFallback()],
      },
    },
    resolve: {
      alias: [{ find: '@', replacement: path.resolve(__dirname, 'src') }],
    },
    build: {
      outDir: path.resolve(__dirname, 'dist-extension'),
      emptyOutDir: true,
      sourcemap: false,
      target: 'chrome116',
      rollupOptions: {
        input: {
          sidepanel: path.resolve(__dirname, 'extension/sidepanel.html'),
          'service-worker': path.resolve(__dirname, 'src/extension/service-worker.ts'),
        },
        output: {
          entryFileNames: (chunk) =>
            chunk.name === 'service-worker' ? 'service-worker.js' : 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
    },
  };
});
