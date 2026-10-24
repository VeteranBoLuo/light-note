// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import manorRuntime from './manorRuntime';

describe('庄园生产入口与经典规则脚本', () => {
  it('输出可运行的同源经典脚本，所有入口资源按内容失效缓存', () => {
    const assets = new Map<string, string>();
    const plugin = manorRuntime();
    const generate = plugin.generateBundle as Function;
    generate.call({ emitFile: ({ fileName, source }: {fileName:string;source:string}) => assets.set(fileName, source) });
    const model = assets.get('manor/garden-model.js')!;
    const state = runInNewContext(`${model};GardenModel.create()`, {});
    expect(state).toMatchObject({ adopted: false, water: 0, wallet: 0, fish: [] });
    const entry = assets.get('manor/index.html')!;
    const links = [...entry.matchAll(/\b(?:src|href|data-ui-script|data-worker)="([^"?]+)\?v=([a-f0-9]{16})"/g)];
    expect(links.length).toBeGreaterThan(30);
    for (const [, path, version] of links) {
      const content = path === 'garden-model.js' ? model : readFileSync(new URL(`../../public/manor/${path}`, import.meta.url));
      expect(createHash('sha256').update(content).digest('hex').slice(0,16)).toBe(version);
    }
    expect(entry).toMatch(/data-ui-script="knowledge-garden-v19\/garden-ui\.js\?v=[a-f0-9]{16}"/);
    expect(entry).toMatch(/data-worker="knowledge-garden-v19\/garden-water-worker\.js\?v=[a-f0-9]{16}"/);
  });
});
