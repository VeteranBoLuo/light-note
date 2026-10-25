// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext, Script } from 'node:vm';
import { describe, expect, it } from 'vitest';
import manorRuntime from './manorRuntime';

describe('庄园生产入口与经典规则脚本', () => {
  it('输出可运行的同源经典脚本，所有入口资源按内容失效缓存', () => {
    const assets = new Map<string, string>();
    const plugin = manorRuntime();
    const generate = plugin.generateBundle as Function;
    generate.call({
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
    expect(links).toHaveLength(4);
    const bundle = assets.get('manor/knowledge-garden-v19/runtime.js')!;
    expect(() => new Script(bundle)).not.toThrow();
    // The deterministic rules and all classic modules retain their global order.
    const original = readFileSync(new URL('../../public/manor/index.html', import.meta.url), 'utf8');
    let offset = -1;
    for (const [, path] of original.matchAll(/<script defer src="([^"?]+)[^"]*"/g)) {
      const content =
        path === 'garden-model.js'
          ? model
          : readFileSync(new URL(`../../public/manor/${path}`, import.meta.url), 'utf8');
      const found = bundle.indexOf(content, offset + 1);
      expect(found).toBeGreaterThan(offset);
      offset = found;
    }
    for (const [, path, version] of links) {
      const content =
        assets.get(`manor/${path}`) ?? readFileSync(new URL(`../../public/manor/${path}`, import.meta.url));
      expect(createHash('sha256').update(content).digest('hex').slice(0, 16)).toBe(version);
    }
    expect(entry).toMatch(/data-ui-script="knowledge-garden-v19\/garden-ui\.js\?v=[a-f0-9]{16}"/);
    expect(entry).not.toContain('garden-water-worker');
    const preload = JSON.parse(assets.get('manor/preload.json')!);
    expect(preload.desktop).toContain('/manor/knowledge-garden-v19/courtyard/pc-scene-r53.webp');
    expect(preload.mobile).toContain('/manor/knowledge-garden-v19/courtyard/mobile-garden-scene-r53.webp');
    expect(preload.mobile).not.toContain('/manor/knowledge-garden-v19/courtyard/pc-scene-r53.webp');
    const boot = JSON.parse(entry.match(/id="manor-boot-images">([^<]+)/)![1]);
    expect(boot.desktop[0]).toMatchObject({
      priority: 'high', sizes: '100vw', src: 'knowledge-garden-v19/courtyard/pc-scene-r53.webp',
    });
    expect(boot.desktop[0].srcset).toContain('pc-scene-2048-r54.webp 2048w');
    expect(boot.desktop[0].srcset).toContain('pc-scene-r53.webp 3630w');
    expect(preload.desktopScene.map(({ width }: { width: number }) => width)).toEqual([2048, 2940, 3630]);
    for (const url of [...preload.desktop, ...preload.mobile, ...preload.desktopScene.map(({ url }: { url: string }) => url)]) {
      expect(url.startsWith('/manor/')).toBe(true);
      const file = url.replace('/manor/', '').split('?')[0];
      expect(
        assets.has(`manor/${file}`) || readFileSync(new URL(`../../public/manor/${file}`, import.meta.url)).length > 0,
      ).toBe(true);
    }
  });
});
