import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

export const MACOS_PWA_MANIFEST_PATH = '/site-macos.webmanifest';

export function createMacosPwaManifest(manifest: Record<string, unknown>) {
  return {
    ...manifest,
    icons: [192, 512].map((size) => ({
      src: `/icon-macos-${size}.png?v=1`,
      sizes: `${size}x${size}`,
      type: 'image/png',
      purpose: 'any maskable',
    })),
  };
}

export function createPwaManifestSelectionScript(defaultHref: string): string {
  return `(function () {
  var link = document.querySelector('link[rel="manifest"]');
  if (!link) return;
  var platform = navigator.userAgentData && navigator.userAgentData.platform || navigator.platform || '';
  var mobile = (navigator.userAgentData && navigator.userAgentData.mobile) ||
    navigator.maxTouchPoints > 1 || /Android|iPhone|iPad|iPod|HarmonyOS|OpenHarmony/i.test(navigator.userAgent || '');
  var mac = /^(macOS|MacIntel|MacPPC|Mac68K)$/i.test(platform) && !mobile;
  // 预渲染可能已把 href 序列化成 Mac 版本；每次都双向设置，手机继续使用原 manifest。
  link.setAttribute('href', mac ? '${MACOS_PWA_MANIFEST_PATH}?v=1' : ${JSON.stringify(defaultHref)});
})();`;
}

/** macOS 原生图标使用独立比例；移动端 manifest/Apple Touch/Android 图稿保持原样。 */
export default function macosPwaManifest(): Plugin {
  let publicDirectory: string;
  const readMacosManifest = () =>
    JSON.stringify(
      createMacosPwaManifest(JSON.parse(readFileSync(path.join(publicDirectory, 'site.webmanifest'), 'utf8'))),
    );

  return {
    name: 'light-note-macos-pwa-manifest',
    configResolved(config) {
      publicDirectory = config.publicDir;
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.split('?')[0] !== MACOS_PWA_MANIFEST_PATH) return next();
        response.setHeader('Content-Type', 'application/manifest+json');
        response.setHeader('Cache-Control', 'no-cache');
        response.end(readMacosManifest());
      });
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: MACOS_PWA_MANIFEST_PATH.slice(1),
        source: readMacosManifest(),
      });
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const manifestLink = html.match(/<link\b[^>]*>/gi)?.find((tag) => /\brel=["']manifest["']/i.test(tag));
        const defaultHref = manifestLink?.match(/\bhref=["']([^"']+)["']/i)?.[1];
        // 独立验收夹具没有安装入口，不注入应用 manifest。
        if (!defaultHref) return;
        return [
          {
            tag: 'script',
            attrs: { 'data-light-note-pwa-manifest': 'true' },
            children: createPwaManifestSelectionScript(defaultHref),
            injectTo: 'head',
          },
        ];
      },
    },
  };
}
