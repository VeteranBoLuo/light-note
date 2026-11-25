import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const growthSource = readFileSync(resolve(process.cwd(), 'src/composables/useGrowth.ts'), 'utf8');

describe('积分永久空间有限次兑换状态', () => {
  it('服务端拒绝旧标签页的重复请求后会重新加载权威商店状态', () => {
    expect(growthSource).toContain("res.data?.reason === 'purchase_limit'");
    expect(growthSource).toMatch(/reason === 'purchase_limit'[\s\S]*?await loadShop\(\)/u);
  });
});
