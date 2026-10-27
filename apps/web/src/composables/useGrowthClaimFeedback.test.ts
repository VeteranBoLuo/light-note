import { createApp, defineComponent, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { describe, expect, it } from 'vitest';
import zhCN from '@/i18n/locales/zh-CN';
import enUS from '@/i18n/locales/en-US';
import { useGrowthClaimFeedback } from './useGrowthClaimFeedback';

const fallback = { daily: 2, growthTasks: 0, achievements: 0, weekly: 0, community: 0 };
const empty = { daily: 0, growthTasks: 0, achievements: 0, weekly: 0, community: 0 };

function withFeedback(locale: string, check: (feedback: ReturnType<typeof useGrowthClaimFeedback>) => void) {
  let feedback!: ReturnType<typeof useGrowthClaimFeedback>;
  const app = createApp(
    defineComponent({
      setup() {
        feedback = useGrowthClaimFeedback(ref(null));
        return () => null;
      },
    }),
  );
  app.use(createI18n({ legacy: false, locale, messages: { 'zh-CN': zhCN, 'en-US': enUS } }));
  app.mount(document.createElement('div'));
  try {
    check(feedback);
  } finally {
    app.unmount();
  }
}

describe('useGrowthClaimFeedback', () => {
  it('来源和实际结算奖励同时显示，重复及未完成项不计入来源', () => {
    withFeedback('zh-CN', ({ claimSuccessMessage }) => {
      expect(
        claimSuccessMessage(
          {
            claimed: 1,
            exp: 10,
            points: 25,
            receipts: [
              { type: 'daily', status: 'claimed' },
              { type: 'daily', status: 'already' },
              { type: 'weekly', status: 'incomplete' },
            ],
          },
          fallback,
        ),
      ).toBe('已领取日常任务奖励 · 经验 +10 · 积分 +25');
    });
  });

  it('经验封顶时省略零值，并保留实际积分和头像框奖励', () => {
    withFeedback('zh-CN', ({ claimSuccessMessage }) => {
      expect(
        claimSuccessMessage(
          {
            claimed: 1,
            exp: 0,
            points: 25,
            frames: ['frame-a'],
            receipts: [{ type: 'daily', status: 'claimed', reward: { exp: 10 } }],
          },
          fallback,
        ),
      ).toBe('已领取日常任务奖励 · 积分 +25 · 头像框 +1');
    });
  });

  it('旧响应缺少回执时保留来源快照和服务端奖励', () => {
    withFeedback('zh-CN', ({ claimSuccessMessage }) => {
      expect(claimSuccessMessage({ claimed: 2, exp: 15, points: 40 }, fallback)).toBe(
        '已领取：日常任务 ×2\n经验 +15 · 积分 +40',
      );
    });
  });

  it('无来源可用时仍显示全部奖励', () => {
    withFeedback('zh-CN', ({ claimSuccessMessage }) => {
      expect(claimSuccessMessage({ claimed: 1, exp: 5, points: 15 }, empty)).toBe('已领取 1 项\n经验 +5 · 积分 +15');
      expect(claimSuccessMessage({ claimed: 1, exp: 0, points: 0, frames: ['a', 'b'] }, empty)).toBe(
        '已领取 1 项\n头像框 +2',
      );
    });
  });

  it('单个周挑战简写来源，全部零值时不产生空分隔符', () => {
    withFeedback('zh-CN', ({ claimSuccessMessage }) => {
      expect(claimSuccessMessage({ points: 20, receipts: [{ type: 'weekly', status: 'claimed' }] }, empty)).toBe(
        '已领取周挑战奖励 · 积分 +20',
      );
      expect(claimSuccessMessage({ claimed: 1 }, empty)).toBe('已领取 1 项');
    });
  });

  it('混合来源保留各自数量，只使用结算总额', () => {
    withFeedback('zh-CN', ({ claimSuccessMessage }) => {
      expect(
        claimSuccessMessage(
          {
            exp: 15,
            points: 40,
            receipts: [
              { type: 'daily', status: 'claimed' },
              { type: 'daily', status: 'claimed' },
              { type: 'weekly', status: 'claimed' },
            ],
          },
          empty,
        ),
      ).toBe('已领取：日常任务 ×2、周挑战 ×1\n经验 +15 · 积分 +40');
    });
  });

  it('英文提示包含来源和奖励', () => {
    withFeedback('en-US', ({ claimSuccessMessage }) => {
      expect(claimSuccessMessage({ claimed: 2, exp: 15, points: 40, frames: ['a'] }, fallback)).toBe(
        'Claimed: Daily tasks ×2\n+15 EXP · +40 points · +1 avatar frame(s)',
      );
    });
  });
});
