// @vitest-environment node
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { manorModel, MANOR_SPECIES } from '@lightnote/shared/manor';

const root = new URL('../../public/manor/', import.meta.url);
const source = (file: string) => readFileSync(new URL(file, root), 'utf8');
describe('庄园正式构建素材与水族契约', () => {
  it('场景和服务端使用完全相同的水族、产肥等级和获取规则', () => {
    const catalog = JSON.parse(runInNewContext(`${source('knowledge-garden-v19/fish-art.js')};JSON.stringify(FISH)`, {}));
    expect(catalog).toEqual(MANOR_SPECIES);
  });
  it('每种作物全部生长阶段、种子袋、收获图及土壤素材都能随包发布', () => {
    const context = { module: { exports: {} } };
    runInNewContext(source('knowledge-garden-v19/farm-art.js'), context);
    const art = context.module.exports as { packet(key: string): string; cropCard(key: string, stage: number, options?: object): string; icon(key: string): string; giftPack(): string; fryBag(): string };
    const html = [art.giftPack(), art.fryBag(), ...Object.keys(manorModel.CROPS).flatMap(key => [
      art.packet(key), art.icon(key), ...[0, 1, 2, 3, 4].map(stage => art.cropCard(key, stage, { dry: true, locked: true })),
    ])].join('');
    const files = [...new Set([...html.matchAll(/src="([^"]+)"/g)].map(match => match[1]))];
    expect(files.length).toBeGreaterThan(100);
    expect(files.filter(file => !existsSync(fileURLToPath(new URL(file, root))))).toEqual([]);
  });
  it('动物纹理和昆虫图层实际随包发布，冷启动不依赖原型目录中的缓存', () => {
    for (const path of ['animal-rabbit-r12.webp', 'wildlife-butterflyopen.webp', 'wildlife-butterflyperch.webp', 'wildlife-ladybird.webp']) {
      expect(readFileSync(new URL(`knowledge-garden-v19/courtyard/${path}`, root)).subarray(0,4).toString()).toBe('RIFF');
    }
  });
  it('正式入口不依赖被 Git 忽略的原型目录，CSS 与经典脚本文件齐全', () => {
    const files = [...source('index.html').matchAll(/(?:src|href)="([^"?]+)(?:\?[^"]*)?"/g)].map(match => match[1]);
    expect(files.filter(file => file !== 'garden-model.js' && !existsSync(fileURLToPath(new URL(file, root))))).toEqual([]);
    expect(source('index.html')).not.toContain('docs/plan/');
  });
});
