// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext, Script } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { transformWithEsbuild } from 'vite';
import manorRuntime from './manorRuntime';

describe('庄园生产入口与经典规则脚本', () => {
  it('Vue 启动前的首帧已有 0% 进度条，使用同一加载文案', () => {
    const transform = manorRuntime().transformIndexHtml as Function;
    const result = transform('<html><head></head><body><div id="app"></div></body></html>');
    expect(result.html).toContain('class="manor-entry-loading manor-loading"');
    expect(result.html).toContain('aria-valuenow="0"');
    expect(result.html).toContain('0% ·');
    expect(result.html).toContain('正在载入庄园');
    expect(result.html).toContain('Loading your manor');
    expect(result.html).not.toContain('唤醒');
  });
  it('输出可运行的同源经典脚本，所有入口资源按内容失效缓存', async () => {
    const assets = new Map<string, string>();
    const plugin = manorRuntime();
    const generate = plugin.generateBundle as Function;
    await generate.call({
      emitFile: ({ fileName, source }: { fileName: string; source: string }) => assets.set(fileName, source),
    });
    const model = assets.get('manor/garden-model.js')!;
    const state = runInNewContext(`${model};GardenModel.create()`, {});
    expect(state).toMatchObject({ adopted: false, water: 0, wallet: 0, fish: [] });
    const entry = assets.get('manor/index.html')!;
    const links = [
      ...entry.matchAll(
        /\b(?:src|href|data-ui-script)="([^"?]+)\?v=([a-f0-9]{16})"/g,
      ),
    ];
    expect(links).toHaveLength(5);
    const bundle = assets.get('manor/knowledge-garden-v19/runtime.js')!;
    expect(() => new Script(bundle)).not.toThrow();
    const ui = assets.get('manor/knowledge-garden-v19/runtime-ui.js')!;
    expect(() => new Script(ui)).not.toThrow();
    // Minification keeps the globals that later scripts and the separately loaded UI read.
    for (const name of ['GardenModel', 'GardenAnimals3D', 'FarmUI', 'GardenLive', 'createManorRefreshInput']) expect(bundle).toMatch(new RegExp(`\\b${name}\\b`));
    expect(ui).toMatch(/\bfunction hudHTML\b/);
    expect(bundle.length).toBeLessThan(readFileSync(new URL('../../public/manor/knowledge-garden-v19/fish-art.js', import.meta.url), 'utf8').length * 12);
    // The deterministic rules and all classic modules retain their global order.
    const original = readFileSync(new URL('../../public/manor/index.html', import.meta.url), 'utf8');
    let offset = -1;
    for (const [, path] of original.matchAll(/<script defer src="([^"?]+)[^"]*"/g)) {
      const content =
        path === 'garden-model.js'
          ? model
          : readFileSync(new URL(`../../public/manor/${path}`, import.meta.url), 'utf8');
      const { code } = await transformWithEsbuild(content, path, { loader: 'js', minify: true, target: 'chrome105', legalComments: 'none' });
      const found = bundle.indexOf(code, offset + 1);
      expect(found).toBeGreaterThan(offset);
      offset = found;
    }
    for (const [, path, version] of links) {
      const content =
        assets.get(`manor/${path}`) ?? readFileSync(new URL(`../../public/manor/${path}`, import.meta.url));
      expect(createHash('sha256').update(content).digest('hex').slice(0, 16)).toBe(version);
    }
    expect(entry).toMatch(/data-ui-script="knowledge-garden-v19\/runtime-ui\.js\?v=[a-f0-9]{16}"/);
    expect(entry).not.toContain('garden-water-worker');
    // three.js is loaded by the idle 3D enhancement, never as first-screen code.
    expect(entry).not.toContain('three-0.160');
    expect(bundle).not.toContain('WebGLRenderer=');
    const preload = JSON.parse(assets.get('manor/preload.json')!);
    const art = readFileSync(new URL('../../public/manor/knowledge-garden-v19/fish-art.js', import.meta.url), 'utf8');
    const fishImages = runInNewContext(`${art};Object.keys(FISH).map(key=>fishArt(key)).join('')`) as string;
    for (const [, path] of fishImages.matchAll(/\bhref="(knowledge-garden-v19\/[^"]+)"/g)) {
      expect(preload.catalog).toContain('/manor/' + path);
    }
    expect(preload.catalog).toContain('/manor/knowledge-garden-v19/farm/crop-radish-5-r55.webp');
    expect(preload.catalog).toContain('/manor/knowledge-garden-v19/courtyard/animal-rabbit-r12.webp');
    expect(preload.catalog).toContain('/manor/knowledge-garden-v19/farm/seed-ground-r69.webp');
    expect(preload.desktopCritical).not.toEqual(expect.arrayContaining(preload.catalog));
    expect(preload.desktop).toContain('/manor/knowledge-garden-v19/courtyard/pc-scene-r58.webp');
    expect(preload.desktopCritical).toEqual(expect.arrayContaining(['/manor/knowledge-garden-v19/courtyard/pc-scene-r58.webp']));
    const runtimeIndex = preload.desktopCritical.findIndex((url: string) => /runtime\.js\?v=/.test(url));
    expect(runtimeIndex).toBeGreaterThanOrEqual(0);
    expect(runtimeIndex).toBeLessThan(preload.desktopCritical.indexOf('/manor/knowledge-garden-v19/courtyard/pc-scene-r58.webp'));
    expect(preload.mobile).toContain('/manor/knowledge-garden-v19/courtyard/mobile-garden-scene-r56.webp');
    for (const group of ['desktop', 'mobile']) expect(preload[group]).toContain('/manor/knowledge-garden-v19/vendor/three-0.160.1.min.js');
    for (const group of ['desktopCritical', 'mobileCritical']) expect(preload[group]).not.toContain('/manor/knowledge-garden-v19/vendor/three-0.160.1.min.js');
    expect(preload.mobile).not.toContain('/manor/knowledge-garden-v19/courtyard/pc-scene-r58.webp');
    const boot = JSON.parse(entry.match(/id="manor-boot-images">([^<]+)/)![1]);
    for (const profile of ['desktop', 'mobile']) {
      const critical = profile === 'desktop' ? preload.desktopCritical : preload.mobileCritical;
      expect(boot[profile].every(({ src }: { src: string }) => critical.includes('/manor/' + src))).toBe(true);
    }
    expect(preload.mobileCritical).not.toContain('/manor/knowledge-garden-v19/courtyard/pc-scene-r58.webp');
    expect(boot.desktop[0]).toMatchObject({
      priority: 'high', sizes: '100vw', src: 'knowledge-garden-v19/courtyard/pc-scene-r58.webp',
    });
    expect(boot.desktop[0].srcset).toContain('pc-scene-2048-r58.webp 2048w');
    expect(boot.desktop[0].srcset).toContain('pc-scene-r58.webp 3630w');
    expect(boot.desktop.map(({src}: {src: string}) => src)).toContain('knowledge-garden-v19/farm/bed-dry-r55.webp');
    expect(boot.mobile.map(({src}: {src: string}) => src)).not.toContain('knowledge-garden-v19/farm/workshop-states-r53.webp');
    const controls=boot.desktop.find(({src}: {src: string})=>src.endsWith('/farm/game-ui-r53.webp'));
    expect(assets.get('manor/knowledge-garden-v19/runtime.css')).toContain(`var(${controls.variable},url("farm/game-ui-r53.webp"))`);
    expect(new Set(boot.desktop.map(({src}: {src: string})=>src)).size).toBe(boot.desktop.length);
    expect(preload.desktopScene.map(({ width }: { width: number }) => width)).toEqual([2048, 2940, 3630]);
    for (const url of [...preload.catalog, ...preload.desktop, ...preload.mobile, ...preload.desktopScene.map(({ url }: { url: string }) => url)]) {
      expect(url.startsWith('/manor/')).toBe(true);
      const file = url.replace('/manor/', '').split('?')[0];
      expect(
        assets.has(`manor/${file}`) || readFileSync(new URL(`../../public/manor/${file}`, import.meta.url)).length > 0,
      ).toBe(true);
    }
  });
});
