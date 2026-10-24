import { describe, expect, it } from 'vitest';
import { createI18n } from 'vue-i18n';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import { prizeIcon, prizeLabel } from './lotteryPresentation';
import type { LotteryPrize } from '@/composables/useGrowth';
import icon from '@/config/icon';

describe('奖品数量与图标', () => {
  it.each([100000, 200000, 600000])('AI 奖品 %i 显示真实数量和单位', (amount) => {
    const i18n = createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh } });
    expect(prizeLabel({ kind: 'ai_pack', amount } as LotteryPrize, i18n.global.t, 'zh-CN')).toBe(
      `AI 额度 +${amount / 10000} 万 tokens`,
    );
  });
  it('英文使用同一实际 Token 数量，图标资源存在', () => {
    const i18n = createI18n({ legacy: false, locale: 'en-US', messages: { 'en-US': en } });
    expect(prizeLabel({ kind: 'ai_pack', amount: 100000 } as LotteryPrize, i18n.global.t, 'en-US')).toBe(
      'AI credit +100K tokens',
    );
    for (const kind of ['ai_pack', 'points', 'storage', 'card'] as const) {
      expect(prizeIcon({ kind } as LotteryPrize)).toBeTruthy();
      expect(prizeIcon({ kind } as LotteryPrize)).not.toBe(icon.nullImg);
    }
    expect(icon.growth.backpack).toContain('currentColor');
  });
});
