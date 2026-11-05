// @vitest-environment node
import { mkdtempSync, readFileSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { build, createServer } from 'vite';
import macosPwaManifest, { createMacosPwaManifest, createPwaManifestSelectionScript } from './macosPwaManifest';

const defaultHref = '/site.webmanifest?v=11';

function selectManifest(navigator: Record<string, unknown>, initialHref = defaultHref) {
  let href = initialHref;
  vm.runInNewContext(createPwaManifestSelectionScript(defaultHref), {
    navigator,
    document: {
      querySelector: () => ({
        setAttribute(_name: string, value: string) {
          href = value;
        },
      }),
    },
  });
  return href;
}

describe('macOS PWA 图标分流', () => {
  it.each([
    { platform: 'MacIntel', maxTouchPoints: 0 },
    { platform: 'MacIntel', userAgentData: { platform: 'macOS', mobile: false }, maxTouchPoints: 0 },
  ])('Mac 使用专用 manifest，与窗口宽度和界面密度无关：%j', (navigator) => {
    expect(selectManifest(navigator)).toBe('/site-macos.webmanifest?v=1');
  });

  it.each([
    { platform: 'Linux armv8l', userAgent: 'Android 16; LightNoteAndroid/1.0', maxTouchPoints: 5 },
    { platform: 'Linux armv8l', userAgent: 'HarmonyOS; HuaweiBrowser', maxTouchPoints: 5 },
    { platform: 'iPhone', userAgent: 'iPhone; Mobile Safari', maxTouchPoints: 5 },
    { platform: 'MacIntel', userAgent: 'Macintosh; Safari', maxTouchPoints: 5 },
    { platform: 'MacIntel', userAgentData: { platform: 'macOS', mobile: true }, maxTouchPoints: 0 },
    { platform: 'MacIntel', userAgent: 'iPad; CPU OS 18', maxTouchPoints: 0 },
    { platform: 'MacIntel', userAgent: 'Android; Desktop mode', maxTouchPoints: 0 },
    { platform: 'Win32', maxTouchPoints: 0 },
    { platform: 'Linux x86_64', maxTouchPoints: 0 },
    {},
  ])('手机、iPad 桌面模式与其他系统保持原图标：%j', (navigator) => {
    expect(selectManifest(navigator)).toBe(defaultHref);
    // 根官网经 Mac 预渲染后，移动客户端也必须恢复自己的原 manifest。
    expect(selectManifest(navigator, '/site-macos.webmanifest?v=1')).toBe(defaultHref);
  });

  it('只替换桌面图标，沿用原 manifest 的应用身份、入口与全部其他字段', () => {
    const manifest = JSON.parse(readFileSync(new URL('../../public/site.webmanifest', import.meta.url), 'utf8'));
    const original = structuredClone(manifest);
    const macos = createMacosPwaManifest(manifest);
    expect({ ...macos, icons: manifest.icons }).toEqual(original);
    expect(manifest).toEqual(original);
    expect(macos.icons.map((icon) => icon.src)).toEqual(['/icon-macos-192.png?v=1', '/icon-macos-512.png?v=1']);
    expect(macos.icons.every((icon) => icon.purpose === 'any maskable')).toBe(true);
  });

  it('开发服务与生产产物均从原 manifest 派生，HTML 带有平台选择脚本', async () => {
    const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'lightnote-macos-manifest-')));
    const manifest = JSON.parse(readFileSync(new URL('../../public/site.webmanifest', import.meta.url), 'utf8'));
    mkdirSync(path.join(root, 'public'));
    writeFileSync(path.join(root, 'public/site.webmanifest'), JSON.stringify(manifest));
    writeFileSync(
      path.join(root, 'index.html'),
      `<html><head><link rel="manifest" href="${defaultHref}"></head></html>`,
    );
    writeFileSync(path.join(root, 'standalone.html'), '<html><head><title>独立夹具</title></head></html>');
    const server = await createServer({
      configFile: false,
      root,
      plugins: [macosPwaManifest()],
      server: { host: '127.0.0.1', port: 0 },
      logLevel: 'silent',
    });
    try {
      await server.listen();
      const address = server.httpServer!.address();
      if (!address || typeof address === 'string') throw new Error('缺少本地验收端口');
      const response = await fetch(`http://127.0.0.1:${address.port}/site-macos.webmanifest?v=1`);
      expect(response.headers.get('content-type')).toBe('application/manifest+json');
      expect(await response.json()).toEqual(createMacosPwaManifest(manifest));
      const standaloneResponse = await fetch(`http://127.0.0.1:${address.port}/standalone.html`);
      expect(standaloneResponse.status).toBe(200);
      expect(await standaloneResponse.text()).not.toContain('data-light-note-pwa-manifest');
      await build({ configFile: false, root, plugins: [macosPwaManifest()], logLevel: 'silent' });
      const built = JSON.parse(readFileSync(path.join(root, 'dist/site-macos.webmanifest'), 'utf8'));
      expect(built).toEqual(createMacosPwaManifest(manifest));
      const html = readFileSync(path.join(root, 'dist/index.html'), 'utf8');
      expect(html).toContain('data-light-note-pwa-manifest');
      expect(html).toContain(defaultHref);
      expect(JSON.parse(readFileSync(path.join(root, 'dist/site.webmanifest'), 'utf8'))).toEqual(manifest);
    } finally {
      await server.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
