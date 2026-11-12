import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h } from 'vue';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import zhCN from '@/i18n/locales/zh-CN';
import GrowthRankPanel from './GrowthRankPanel.vue';
import type { Growth, GrowthStats, Rank } from '@/composables/useGrowth';

vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { template: '<span />' } }));
vi.mock('@/components/growth/AvatarFramePreview.vue', () => ({ default: { template: '<span />' } }));

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

const ranks: Rank[] = [
  { level: 1, name: '蒙童', cumExp: 0, spaceMb: 1024, aiTokenDaily: 100000, trashDays: 30, freeDraws: 0 },
  { level: 2, name: '书生', cumExp: 500, spaceMb: 1280, aiTokenDaily: 120000, trashDays: 30, freeDraws: 0 },
  { level: 3, name: '秀才', cumExp: 1000, spaceMb: 1536, aiTokenDaily: 140000, trashDays: 30, freeDraws: 1 },
  { level: 5, name: '贡士', cumExp: 2700, spaceMb: 2048, aiTokenDaily: 180000, trashDays: 60, freeDraws: 1 },
];
const stats = { joinDays: 3, bookmarkCount: 0, noteCount: 2, weekExp: 20 } as GrowthStats;
const growth = (patch: Partial<Growth> = {}) =>
  ({
    exp: 120,
    level: 1,
    name: '蒙童',
    spaceMb: 1024,
    aiTokenDaily: 100000,
    trashDays: 30,
    streak: 0,
    checkedInToday: true,
    levelStartExp: 0,
    nextLevelExp: 500,
    expToNext: 380,
    progress: 24,
    isMax: false,
    points: 0,
    ...patch,
  }) as Growth;

function aiCell(props: { growth: Growth; aiBalance?: number | null }) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(GrowthRankPanel, { ranks, stats, ...props }) });
  app.use(createPinia());
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } }));
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  const cells = [...host.querySelectorAll('.rank-benefit')];
  return cells[1]?.textContent?.replace(/\s+/g, ' ').trim() || '';
}

describe('段位卡 AI 权益', () => {
  it('切换前仍按每日额度展示，并指向下一次提升的等级', () => {
    const text = aiCell({ growth: growth({ billingMode: 'daily_and_permanent' }) });
    expect(text).toContain('AI 额度/日');
    expect(text).toContain('10万');
    expect(text).toContain('Lv.2 起 12万');
  });

  it('永久额度模式展示 AI 余额与下一级一次性赠礼', () => {
    const text = aiCell({
      growth: growth({
        billingMode: 'permanent_only',
        aiLevelGiftStatus: 'up_to_date',
        aiNextLevelGift: { version: 'v1', level: 2, tokens: 80000, cumulativeTokens: 200000 },
      }),
      aiBalance: 120000,
    });
    expect(text).toContain('AI 余额');
    expect(text).toContain('12万');
    expect(text).toContain('Lv.2 起 赠 8万');
    expect(text).not.toContain('/日');
  });

  it('赠礼待到账或内部账号时说明状态，不承诺金额', () => {
    expect(
      aiCell({ growth: growth({ billingMode: 'permanent_only', aiLevelGiftStatus: 'missing' }), aiBalance: 0 }),
    ).toContain('赠礼待到账');
    cleanup?.();
    expect(
      aiCell({ growth: growth({ billingMode: 'permanent_only', aiLevelGiftStatus: 'ineligible' }), aiBalance: 0 }),
    ).toContain('内部账号通过管理入账');
  });
});
