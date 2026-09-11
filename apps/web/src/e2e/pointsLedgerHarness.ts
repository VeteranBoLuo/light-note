import { createApp, h } from 'vue';
import { createI18n } from 'vue-i18n';
import growthApi from '@/api/growthApi';
import PointsLedger from '@/components/growth/PointsLedger.vue';
import PointsSummary from '@/components/growth/PointsSummary.vue';
import BCard from '@/components/base/BasicComponents/BCard.vue';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import '@/assets/css/index.less';
const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get('theme') || 'day';
document.documentElement.classList.toggle('light-note-mobile-rendering', params.get('renderProfile') === 'mobile');
const calls: unknown[] = [];
(window as any).__ledgerCalls = calls;
let failed = false;
growthApi.getPointsSummary = async () =>
  ({
    status: 200,
    data: {
      balance: 2013,
      last28Days: { earned: 2902, spent: 1341 },
      sources: [{ reason: 'checkin', key: 'checkin', amount: 120 }],
      earningRules: { checkin: { base: 5, maximum: 20 }, daily: [], weekly: [] },
    },
  }) as any;
growthApi.getPointsLog = async (limit, options) => {
  calls.push({ limit, ...options });
  await new Promise((resolve) => setTimeout(resolve, 180));
  const start = Number(options?.cursor || 0);
  if (params.get('state') === 'error' && start && !failed) {
    failed = true;
    throw new Error('fixture failure');
  }
  const total = params.get('state') === 'empty' ? 0 : 95;
  const rows = Array.from({ length: Math.min(limit || 30, total - start) }, (_, i) => ({
    id: start + i + 1,
    delta: options?.filter === 'spent' ? -20 : 20,
    reason: 'checkin',
    createTime: '2026-09-11T02:00:00Z',
  }));
  return {
    status: 200,
    data: {
      rows,
      hasMore: start + rows.length < total,
      nextCursor: start + rows.length < total ? String(start + rows.length) : null,
    },
  } as any;
};
const app = createApp({
  render: () =>
    h(
      'main',
      {
        style:
          'width:100%;height:100vh;overflow:auto;padding:24px;box-sizing:border-box;background:var(--background-color);color:var(--text-color)',
      },
      [
        h('div', { style: 'max-width:1200px;margin:auto;display:flex;flex-direction:column;gap:18px' }, [
          h(BCard, { padding: '20px' }, () => h(PointsSummary)),
          h(BCard, { padding: '20px' }, () => h(PointsLedger, { settingsLayout: true })),
        ]),
      ],
    ),
});
app.use(createI18n({ legacy: false, locale: params.get('locale') || 'zh-CN', messages: { 'zh-CN': zh, 'en-US': en } }));
app.directive('click-log', {});
app.directive('auto-scrollbar', {});
document.querySelector<HTMLElement>('#app')!.style.width = '100vw';
app.mount('#app');
