import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const shopSource = readFileSync(resolve(process.cwd(), 'src/components/growth/PointsShop.vue'), 'utf8');
const growthSource = readFileSync(resolve(process.cwd(), 'src/composables/useGrowth.ts'), 'utf8');

describe('积分永久空间有限次兑换状态', () => {
  it('展示每账号限兑与已兑换状态，并在完成后禁用按钮', () => {
    expect(shopSource).toContain('v-if="hasPurchaseLimit(it)"');
    expect(shopSource).toContain("it.unavailableReasons?.includes('purchase_limit')");
    expect(shopSource).toContain("if (isLimitReached(it)) return t('growth.shopRedeemed')");
    expect(shopSource).toContain("t('growth.shopBuyConfirmLimited', params)");
    expect(shopSource).toContain("res.data?.reason === 'purchase_limit'");
  });

  it('服务端拒绝旧标签页的重复请求后会重新加载权威商店状态', () => {
    expect(growthSource).toContain("res.data?.reason === 'purchase_limit'");
    expect(growthSource).toMatch(/reason === 'purchase_limit'[\s\S]*?await loadShop\(\)/u);
  });
});
