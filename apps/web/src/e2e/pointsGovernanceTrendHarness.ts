import { createApp } from 'vue';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import growthApi from '@/api/growthApi';
import enUS from '@/i18n/locales/en-US';
import zhCN from '@/i18n/locales/zh-CN';
import '@/assets/css/index.less';
import PointsGovernanceTrendHarness from './PointsGovernanceTrendHarness.vue';

type FixtureState = 'mixed' | 'issued-only' | 'spent-only' | 'zero' | 'loading' | 'error' | 'refresh-error';
type DetailFixtureState = 'normal' | 'empty' | 'loading' | 'error' | 'append-error';

interface TrendFixture {
  day: string;
  issued: number;
  stable: number;
  oneTime: number;
  random: number;
  operations: number;
  spent: number;
  net: number;
}

const params = new URLSearchParams(window.location.search);
const theme = params.get('theme') === 'night' ? 'night' : 'day';
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
const rawState = params.get('state') || 'mixed';
const state: FixtureState = [
  'mixed',
  'issued-only',
  'spent-only',
  'zero',
  'loading',
  'error',
  'refresh-error',
].includes(rawState)
  ? (rawState as FixtureState)
  : 'mixed';
const periodDays = params.get('days') === '28' ? 28 : 7;
const mobileRendering = params.get('renderProfile') === 'mobile' || window.innerWidth <= 600;
const rawDetailState = params.get('detail') || 'normal';
const detailState: DetailFixtureState = ['normal', 'empty', 'loading', 'error', 'append-error'].includes(rawDetailState)
  ? (rawDetailState as DetailFixtureState)
  : 'normal';

document.documentElement.dataset.theme = theme;
document.documentElement.lang = locale;
document.documentElement.classList.toggle('light-note-mobile-rendering', mobileRendering);

function addFixtureDays(day: string, delta: number) {
  const value = new Date(`${day}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + delta);
  return value.toISOString().slice(0, 10);
}

const fixtureStartDay = periodDays === 28 ? '2026-07-31' : '2026-08-21';
const days = Array.from({ length: periodDays }, (_, index) => addFixtureDays(fixtureStartDay, index));

function trend(day: string, issued: number, spent: number): TrendFixture {
  return {
    day,
    issued,
    stable: issued,
    oneTime: 0,
    random: 0,
    operations: 0,
    spent,
    net: issued - spent,
  };
}

function fixtureTrends(): TrendFixture[] {
  const issuedPattern = [60, 160, 90, 0, 280, 120, 220];
  const spentPattern = [0, 40, 180, 0, 70, 210, 120];
  if (state === 'issued-only')
    return days.map((day, index) => trend(day, [0, 80, 180, 40, 260, 120, 220][index % 7], 0));
  if (state === 'spent-only')
    return days.map((day, index) => trend(day, 0, [0, 70, 160, 30, 240, 110, 190][index % 7]));
  if (state === 'zero') return days.map((day) => trend(day, 0, 0));
  return days.map((day, index) => trend(day, issuedPattern[index % 7], spentPattern[index % 7]));
}

function overviewFixture() {
  const trends = fixtureTrends();
  const issued = trends.reduce((sum, item) => sum + item.issued, 0);
  const spent = trends.reduce((sum, item) => sum + item.spent, 0);
  return {
    range: {
      startDate: days[0],
      endDate: days.at(-1),
      endExclusive: addFixtureDays(days.at(-1) || days[0], 1),
      days: days.length,
    },
    metrics: {
      issued,
      spent,
      netIssued: issued - spent,
      stableIssued: issued,
      stableAverage: 92,
      consumptionToIssuanceRatio: issued ? Number(((spent / issued) * 100).toFixed(1)) : 0,
      outstanding: 12_580,
      earners: issued ? 18 : 0,
      spenders: spent ? 7 : 0,
      freeRandomShare: 0,
      operationsShare: 0,
    },
    balanceDistribution: {
      accounts: 32,
      zeroBalance: 4,
      p50: 120,
      p75: 380,
      p90: 760,
      p99: 1800,
      over6000Ratio: 0,
      over16000Ratio: 0,
      over24000Ratio: 0,
    },
    warnings: [],
    trends,
    balanceLeaderboard: [],
  };
}

let requestCount = 0;
if (state === 'loading') {
  growthApi.adminPointsGovernanceOverview = () => new Promise<never>(() => {});
} else if (state === 'error') {
  growthApi.adminPointsGovernanceOverview = async () => {
    throw new Error('VISUAL_FIXTURE_POINTS_GOVERNANCE_LOAD_FAILED');
  };
} else {
  growthApi.adminPointsGovernanceOverview = async () => {
    requestCount += 1;
    if (state === 'refresh-error' && requestCount > 1) {
      throw new Error('VISUAL_FIXTURE_POINTS_GOVERNANCE_REFRESH_FAILED');
    }
    return { status: 200, data: overviewFixture() } as Awaited<
      ReturnType<typeof growthApi.adminPointsGovernanceOverview>
    >;
  };
}

const detailRows = Array.from({ length: 126 }, (_, index) => {
  const positive = index % 3 !== 1;
  const reason = index % 5 === 0 ? 'admin' : index % 4 === 0 ? 'campaign' : positive ? 'checkin' : 'buy';
  const secondOfDay = 86_399 - index * 61;
  const hour = Math.floor(secondOfDay / 3600);
  const minute = Math.floor((secondOfDay % 3600) / 60);
  const second = secondOfDay % 60;
  return {
    id: 500 - index,
    user: {
      userId: `fixture-user-${String(index + 1).padStart(3, '0')}`,
      alias: index % 6 === 0 ? null : `测试用户 ${index + 1}`,
      email: `fixture-${index + 1}@example.com`,
    },
    delta: positive ? 10 + (index % 9) * 5 : -(20 + (index % 7) * 10),
    reason,
    policyVersion: 'points-earning-c6',
    createTime: `2026-08-26 ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(
      second,
    ).padStart(2, '0')}`,
    sourceType: reason,
    sourceKey: reason === 'checkin' ? '20260826' : reason === 'buy' ? 'ai_pack' : null,
    sourceMeta: null,
    sourceRef: reason === 'checkin' ? '20260826' : reason === 'buy' ? 'ai_pack' : null,
    assetChange: null,
  };
});

growthApi.adminPointsGovernanceDailyDetails = (async (payload: { day: string; cursor?: string | null }) => {
  if (detailState === 'loading') return new Promise<never>(() => {});
  if (detailState === 'error') throw new Error('VISUAL_FIXTURE_DAILY_DETAIL_LOAD_FAILED');
  if (detailState === 'append-error' && payload.cursor) {
    throw new Error('VISUAL_FIXTURE_DAILY_DETAIL_APPEND_FAILED');
  }
  const start = Number(String(payload.cursor || 'fixture-cursor-0').replace('fixture-cursor-', '')) || 0;
  const availableRows = detailState === 'empty' ? [] : detailRows;
  const rows = availableRows
    .slice(start, start + 50)
    .map((row) => ({ ...row, createTime: `${payload.day} ${row.createTime.slice(11)}` }));
  const next = start + rows.length;
  const hasMore = next < availableRows.length;
  return {
    status: 200,
    data: {
      day: payload.day,
      filters: { hideInternal: true },
      rows,
      pageSize: 50,
      hasMore,
      nextCursor: hasMore ? `fixture-cursor-${next}` : null,
    },
  };
}) as typeof growthApi.adminPointsGovernanceDailyDetails;

const i18n = createI18n({
  legacy: false,
  locale,
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN, 'en-US': enUS },
});
const app = createApp(PointsGovernanceTrendHarness, { autoRefreshFailure: state === 'refresh-error' });
app.directive('auto-scrollbar', {});
app.use(createPinia()).use(i18n).mount('#app');
