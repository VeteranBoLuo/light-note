import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const shopSource = readFileSync(resolve(process.cwd(), 'src/components/growth/PointsShop.vue'), 'utf8');
const pageSource = readFileSync(resolve(process.cwd(), 'src/view/growth/GrowthPage.vue'), 'utf8');

describe('积分商城权益聚焦深链', () => {
  it('成长页把 focus 参数传入商城，并只聚焦 AI 或空间商品', () => {
    expect(pageSource).toContain(':focus="String(route.query.focus || \'\')"');
    expect(shopSource).toContain("if (it.id.startsWith('ai_pack')) return 'ai'");
    expect(shopSource).toContain("if (it.id.startsWith('storage_')) return 'storage'");
    expect(shopSource).toContain("class=\"ps-item\" :class=\"{ 'is-focused': isFocused(it) }\"");
    expect(shopSource).toContain("querySelector<HTMLElement>('.ps-item.is-focused')?.scrollIntoView");
  });

  it('聚焦状态有实色描边，移动渲染不依赖阴影表达', () => {
    expect(shopSource).toMatch(/\.ps-item\.is-focused[\s\S]*?border-color:\s*var\(--primary-color\)/u);
    expect(shopSource).toMatch(/html\.light-note-mobile-rendering[\s\S]*?box-shadow:\s*none/u);
  });
});
