import { createApp } from 'vue';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import growthApi from '@/api/growthApi';
import enUS from '@/i18n/locales/en-US';
import zhCN from '@/i18n/locales/zh-CN';
import '@/assets/css/index.less';
import PointsGovernanceTrendHarness from './PointsGovernanceTrendHarness.vue';

type FixtureState = 'mixed' | 'issued-only' | 'spent-only' | 'zero' | 'loading' | 'error' | 'refresh-error';

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

const i18n = createI18n({
  legacy: false,
  locale,
  fallbackLocale: 'zh-CN',
  messages: { 'zh-CN': zhCN, 'en-US': enUS },
});
const app = createApp(PointsGovernanceTrendHarness, { autoRefreshFailure: state === 'refresh-error' });
app.directive('auto-scrollbar', {});
app.use(createPinia()).use(i18n).mount('#app');
