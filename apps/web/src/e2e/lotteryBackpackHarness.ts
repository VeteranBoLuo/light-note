import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import commonRouter from '@/router/modules/common';
import { inventoryTabFromQuery, type InventoryTab } from '@/utils/inventoryNavigation';
import request from '@/http/request';
import { bookmarkStore, useUserStore } from '@/store';
import { applyUiDensity } from '@/composables/useUiDensity';
import LotteryDraw from '@/components/growth/LotteryDraw.vue';
import MyInventory from '@/components/growth/MyInventory.vue';
import globalDirect from '@/config/globalDirect';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import '@/assets/css/index.less';

// 全部请求在内存中模拟，允许验证抽取和补签，不访问业务后端。
const params = new URLSearchParams(location.search);
const scenario = params.get('scenario') || 'default';
const locale = params.get('locale') || 'zh-CN';
const mobile = params.get('renderProfile') === 'mobile' || window.innerWidth < 1200;
applyUiDensity(params.get('density'), mobile);
document.documentElement.dataset.theme = params.get('theme') === 'night' ? 'night' : 'day';
document.documentElement.classList.toggle('light-note-mobile-rendering', mobile);
document.documentElement.classList.toggle('disable-animations', params.get('motion') === 'reduce');
document.body.style.display = 'block';
Object.assign(document.getElementById('app')!.style, { width: '100%', height: '100%', overflow: 'auto' });
const freePool = [
  { id: 'p3', kind: 'points', amount: 3, rate: 65 },
  { id: 'p5', kind: 'points', amount: 5, rate: 23 },
  { id: 'p20', kind: 'points', amount: 20, rate: 2 },
  { id: 'ai20', kind: 'ai_pack', amount: 20000, rate: 8 },
  { id: 'ai50', kind: 'ai_pack', amount: 50000, rate: 2 },
];
const paidPool = [
  { id: 'p20', kind: 'points', amount: 20, rate: 40 },
  { id: 'p50', kind: 'points', amount: 50, rate: 30 },
  { id: 'p100', kind: 'points', amount: 100, rate: 13 },
  { id: 'card', kind: 'card', amount: 1, rate: 4, rare: true, pityRate: 23.53 },
  { id: 'ai', kind: 'ai_pack', amount: 600000, rate: 8, rare: true, pityRate: 47.06 },
  { id: 's128', kind: 'storage', amount: 128, rate: 4.5, rare: true, pityRate: 26.47 },
  { id: 's512', kind: 'storage', amount: 512, rate: 0.5, rare: true, pityRate: 2.94 },
];
const assets =
  scenario === 'empty'
    ? { points: 0, storageBonusMb: 0, aiBonusTokens: 0 }
    : { points: 3280, storageBonusMb: 4096, aiBonusTokens: 1200000 };
const requests: string[] = [];
const pointsRows = Array.from({ length: 72 }, (_, i) => ({
  id: 300 - i,
  delta: [40, -100, 10, -20, 20][i % 5],
  reason: ['achievement', 'buy', 'checkin', 'lottery_paid_cost', 'quest'][i % 5],
  sourceType: ['achievement', 'buy', 'checkin', 'lottery_paid_cost', 'quest'][i % 5],
  sourceKey: ['note_10', 'makeup_card', null, null, null][i % 5],
  createTime: new Date(Date.UTC(2026, 9, 23, 2, 14 - i)).toISOString(),
}));
const lottery = {
  economyVersion: 'points-economy-c10',
  points: assets.points,
  level: 15,
  free: { enabled: true, daily: 3, remaining: scenario === 'exhausted' ? 0 : 2, countsPaidPity: false, pool: freePool },
  paid: {
    enabled: true,
    singleCost: 170,
    tenCost: 1600,
    pityEvery: 10,
    pityProgress: scenario === 'draw_guaranteed' ? 9 : 8,
    toPity: scenario === 'draw_guaranteed' ? 1 : 2,
    overflowPolicy: null,
    pool: paidPool,
  },
};
const tenResults = [
  paidPool[0],
  { ...paidPool[5], guaranteed: true },
  paidPool[1],
  paidPool[0],
  paidPool[2],
  paidPool[0],
  paidPool[4],
  paidPool[1],
  paidPool[3],
  paidPool[0],
];
let receipts =
  scenario === 'empty'
    ? []
    : Array.from({ length: 44 }, (_, i) => ({
        id: String(100 - i),
        createdAt: new Date(Date.UTC(2026, 9, 23, 2, 14 - i)).toISOString(),
        mode: i % 2 ? 'paid' : 'free',
        cost: i % 2 ? 1600 : 0,
        results: i % 2 ? tenResults : [freePool[3]],
      }));
let legacyQty = scenario === 'legacy' ? 2 : 0;
const drawReceipts = new Map<string, Record<string, unknown>>();
let drawAttempts = 0;
const acquisitionExamples = [
  { source: 'admin', kind: 'card', amount: 2 },
  { source: 'campaign', kind: 'ai_pack', amount: 100000 },
  { source: 'shop', kind: 'storage', amount: 512 },
  { source: 'achievement', kind: 'points', amount: 100 },
  { source: 'level_up', kind: 'card', amount: 1 },
  { source: 'streak_milestone', kind: 'card', amount: 1 },
  { source: 'lottery_paid', kind: 'ai_pack', amount: 600000 },
  { source: 'purchase', kind: 'storage', amount: 1024 },
];
let acquisitions =
  scenario === 'empty'
    ? []
    : Array.from({ length: 44 }, (_, i) => {
        const entry = acquisitionExamples[i % acquisitionExamples.length];
        return {
          id: `gain-${100 - i}`,
          source: entry.source,
          createdAt: new Date(Date.UTC(2026, 9, 23, 2, 16 - i)).toISOString(),
          results: [{ id: `item-${i}`, kind: entry.kind, amount: entry.amount }],
        };
      });
request.defaults.adapter = async (config) => {
  const url = new URL(config.url || '', 'http://fixture.invalid');
  requests.push(url.pathname + url.search);
  const query = new URLSearchParams(url.search);
  for (const [key, value] of Object.entries(config.params || {})) if (value != null) query.set(key, String(value));
  if (scenario === 'loading') await new Promise(() => {});
  if (scenario === 'slow') await new Promise((resolve) => setTimeout(resolve, 1200));
  let data: unknown = {};
  let responseStatus = 200;
  if (url.pathname.endsWith('/points/log')) {
    const filter = query.get('filter') || 'all';
    const filtered =
      scenario === 'empty'
        ? []
        : pointsRows.filter((row) =>
            filter === 'earned'
              ? row.delta > 0
              : filter === 'spent'
                ? row.delta < 0
                : filter === 'lottery'
                  ? row.reason.startsWith('lottery')
                  : filter === 'system'
                    ? false
                    : true,
          );
    const start = query.get('cursor') ? filtered.findIndex((row) => String(row.id) === query.get('cursor')) + 1 : 0;
    const limit = Number(query.get('limit') || 30);
    const rows = filtered.slice(start, start + limit);
    data = { rows, hasMore: start + limit < filtered.length, nextCursor: rows.at(-1) ? String(rows.at(-1)!.id) : null };
  } else if (url.pathname.endsWith('/points/summary')) {
    data = {
      balance: assets.points,
      last28Days: { earned: scenario === 'empty' ? 0 : 860, spent: scenario === 'empty' ? 0 : 240 },
      sources: [
        { key: 'growth', reason: 'achievement', amount: 40 },
        { key: 'shop', reason: 'buy', amount: -100 },
      ],
      earningRules: {
        checkin: { base: 15, maximum: 20 },
        daily: [
          { required: 2, points: 5 },
          { required: 3, points: 10 },
        ],
        weekly: [{ reward: 120 }],
      },
    };
  } else if (url.pathname.endsWith('/inventory/acquisitions')) {
    const kind = query.get('kind') || 'all';
    const filtered = acquisitions.filter((row) => kind === 'all' || row.results.some((prize) => prize.kind === kind));
    const start = query.get('cursor') ? filtered.findIndex((row) => row.id === query.get('cursor')) + 1 : 0;
    const limit = Number(query.get('limit') || 20);
    const rows = filtered.slice(start, start + limit);
    data = { rows, hasMore: start + limit < filtered.length, nextCursor: rows.at(-1)?.id || null };
  } else if (url.pathname.endsWith('/lottery/history')) {
    const mode = query.get('mode') || 'all';
    const filtered = receipts.filter((row) => mode === 'all' || row.mode === mode);
    const start = query.get('cursor') ? filtered.findIndex((row) => row.id === query.get('cursor')) + 1 : 0;
    const limit = Number(query.get('limit') || 20);
    const rows = filtered.slice(start, start + limit);
    data = { rows, hasMore: start + limit < filtered.length, nextCursor: rows.at(-1)?.id || null };
  } else if (url.pathname.endsWith('/lottery/draw')) {
    const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
    drawAttempts++;
    if (scenario === 'draw_slow') await new Promise((resolve) => setTimeout(resolve, 3400));
    const free = body.mode === 'free';
    const results =
      body.times === 10
        ? tenResults
        : [
            free
              ? scenario === 'draw_points'
                ? freePool[0]
                : freePool[3]
              : scenario === 'draw_guaranteed'
                ? { ...paidPool[5], guaranteed: true }
                : paidPool[4],
          ];
    const cost = free ? 0 : body.times === 10 ? 1600 : 170;
    const cached = drawReceipts.get(body.clientRequestId);
    if (scenario === 'draw_failure') {
      responseStatus = 409;
      data = { refresh: true };
    } else if (cached) data = { ...cached, idempotent: true };
    else {
      assets.points -= cost;
      assets.points += results.reduce((sum, row) => sum + (row.kind === 'points' ? row.amount : 0), 0);
      assets.storageBonusMb += results.reduce((sum, row) => sum + (row.kind === 'storage' ? row.amount : 0), 0);
      assets.aiBonusTokens += results.reduce((sum, row) => sum + (row.kind === 'ai_pack' ? row.amount : 0), 0);
      lottery.points = assets.points;
      if (free) lottery.free.remaining--;
      else {
        lottery.paid.pityProgress = (lottery.paid.pityProgress + body.times) % lottery.paid.pityEvery;
        lottery.paid.toPity = lottery.paid.pityEvery - lottery.paid.pityProgress;
      }
      results.forEach((prize, i) =>
        acquisitions.unshift({
          id: `draw-${Date.now()}-${i}`,
          source: free ? 'lottery_free' : 'lottery_paid',
          createdAt: new Date().toISOString(),
          results: [prize],
        }),
      );
      receipts.unshift({
        id: String(101 + receipts.length),
        createdAt: new Date().toISOString(),
        mode: free ? 'free' : 'paid',
        cost,
        results,
      });
      data = { ok: true, results, cost, pityTriggered: body.times === 10 };
      drawReceipts.set(body.clientRequestId, data as Record<string, unknown>);
      if (scenario === 'draw_uncertain' && drawAttempts === 1) {
        responseStatus = 409;
        data = { code: 'IDEMPOTENCY_RESULT_PENDING' };
      } else if (scenario === 'draw_empty') data = { ok: true, results: [], cost };
    }
  } else if (url.pathname.endsWith('/lottery')) data = lottery;
  else if (url.pathname.endsWith('/inventory'))
    data = {
      assets,
      items: [
        { id: 'makeup_card', qty: scenario === 'empty' ? 0 : 2, name: '补签卡', desc: '', action: 'makeup' },
        {
          id: 'ai_pack',
          qty: legacyQty,
          name: locale === 'en-US' ? 'Legacy AI pack' : '历史 AI 加油包',
          desc: '',
          action: 'use',
        },
      ],
    };
  else if (url.pathname.endsWith('/item/use')) {
    legacyQty--;
    assets.aiBonusTokens += 600000;
    acquisitions.unshift({
      id: `legacy-${Date.now()}`,
      source: 'legacy_item',
      createdAt: new Date().toISOString(),
      results: [{ id: 'ai', kind: 'ai_pack', amount: 600000 }],
    });
    data = { ok: true, amount: 600000 };
  } else if (url.pathname.endsWith('/me'))
    data = {
      points: assets.points,
      exp: 10000,
      level: 15,
      name: 'Lv.15',
      spaceMb: 5120,
      aiTokenDaily: 100000,
      streak: 0,
      checkedInToday: false,
      levelStartExp: 10000,
      nextLevelExp: 12000,
      expToNext: 2000,
      progress: 0,
      isMax: false,
      makeupDays: ['20261022'],
      features: { growthCenterV2: true, pointsCenter: scenario !== 'summary_disabled' },
    };
  else if (url.pathname.endsWith('/preferences')) data = { lowPressureMode: true };
  else if (url.pathname.endsWith('/dashboard'))
    data = { stats: { joinDays: 30 }, achievements: [], quests: [], timeline: [] };
  else if (url.pathname.endsWith('/heatmap'))
    data = { year: 2026, availableYears: [2026], days: [], summary: { activeDays: 0, longestStreak: 0, weekCount: 0 } };
  else if (url.pathname.endsWith('/claimable')) data = { totalCount: 0 };
  return {
    config,
    status: 200,
    statusText: 'OK',
    headers: {},
    data: {
      status:
        scenario === 'error' ||
        (scenario === 'ledger_error' && url.pathname.endsWith('/points/log')) ||
        (scenario === 'summary_error' && url.pathname.endsWith('/points/summary')) ||
        (scenario === 'inventory_error' && url.pathname.endsWith('/inventory'))
          ? 500
          : responseStatus,
      data: JSON.parse(JSON.stringify(data)),
    },
  };
};
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    ...(params.get('panel') === 'workspace'
      ? commonRouter.filter((route) => ['growth', 'pointsUsage', 'settings'].includes(String(route.name)))
      : [{ path: '/growth', component: { render: () => null } }]),
    { path: '/ai-usage', name: 'aiUsage', component: { render: () => null } },
    { path: '/store', component: { render: () => null } },
  ],
});
const pinia = createPinia();
bookmarkStore(pinia).screenWidth = window.innerWidth;
const user = useUserStore(pinia);
user.id = 'fixture-user';
user.role = 'user';
user.adminContext =
  scenario === 'readonly'
    ? ({ id: 'fixture-context', subjectUserId: 'fixture-user', mode: 'readonly' } as typeof user.adminContext)
    : null;
Object.assign(window, { backpackFixture: { requests } });
const app = createApp({
  render: () =>
    params.get('panel') === 'workspace'
      ? h(RouterView, { style: { height: '100%' }, 'data-fixture-route': router.currentRoute.value.fullPath })
      : h(
          'main',
          {
            style: {
              padding: 'var(--ui-space-24, 24px)',
              background: 'var(--workspace-open-canvas)',
              color: 'var(--text-color)',
              minHeight: '100%',
              boxSizing: 'border-box',
            },
          },
          [
            h(
              'p',
              { style: { margin: '0 0 var(--ui-space-16, 16px)', color: 'var(--desc-color)' } },
              '模拟数据 · 抽奖与背包验收',
            ),
            h(router.currentRoute.value.query.reward === 'inventory' ? MyInventory : LotteryDraw, {
              readOnly: scenario === 'readonly',
              activeTab: inventoryTabFromQuery(router.currentRoute.value.query),
              'onUpdate:activeTab': (tab: InventoryTab) => {
                void router.replace({
                  query: { ...router.currentRoute.value.query, inventoryTab: tab === 'points' ? 'points' : undefined },
                });
              },
            }),
          ],
        ),
});
app
  .use(pinia)
  .use(router)
  .use(createI18n({ legacy: false, locale, messages: { 'zh-CN': zh, 'en-US': en } }));
globalDirect(app);
await router.push(
  params.get('entry') ||
    '/growth?section=rewards&reward=' +
      (params.get('panel') === 'lottery' || !params.has('panel') ? 'lottery' : 'inventory') +
      (params.get('tab') === 'points' ? '&inventoryTab=points' : ''),
);
await router.isReady();
app.mount('#app');
