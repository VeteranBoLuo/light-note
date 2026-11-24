import { createPinia } from 'pinia';
import { createApp } from 'vue';
import { createI18n } from 'vue-i18n';
import { expect, it, vi } from 'vitest';
import { getPointsLeaderboard } from '@/api/pointsLeaderboardApi';
import en from '@/i18n/locales/en-US';
import zh from '@/i18n/locales/zh-CN';
import PointsLeaderboard from './PointsLeaderboard.vue';

vi.mock('@/api/pointsLeaderboardApi', () => ({ getPointsLeaderboard: vi.fn() }));

it.each([
  { locale: 'zh-CN', mobile: false, expected: '每日签到 15 · 水族首销 2 · 卖出作物 3' },
  { locale: 'en-US', mobile: true, expected: 'Daily check-in 15 · First aquarium sales 2 · Crop sales 3' },
])('翻译周榜 API 返回的积分来源（$locale）', async ({ locale, mobile, expected }) => {
  vi.mocked(getPointsLeaderboard).mockResolvedValue({
    board: 'week',
    phase: 'live',
    range: null,
    previousAvailable: false,
    rows: [],
    mine: {
      rank: 11, nickname: 'Player', communityId: null, avatar: null, score: 20, activeDays: 1,
      qualified: false, isMe: true, champion: false, rewardSlot: null, rewardPoints: 0, rewardState: 'none',
      sources: { checkin: 15, manorAquariumSale: 2, manorSale: 3 },
    },
    ownDays: 1,
    total: 11,
    weekly: { mode: 'reward', qualifiedCount: 0, slots: 0, paidSlots: 0 },
    rules: { limit: 20, minimumScore: 100, minimumDays: 3, prizes: [88, 77, 66] },
  });
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(PointsLeaderboard, { mobile });
  app.use(createPinia()).use(createI18n({ legacy: false, locale, messages: { 'zh-CN': zh, 'en-US': en } }));
  try {
    app.mount(host);
    await vi.waitFor(() => expect(host.querySelector('.my-detail span')?.textContent).toBe(expected));
  } finally {
    app.unmount();
    host.remove();
  }
});
