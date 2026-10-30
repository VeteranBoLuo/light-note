import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, reactive, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';
import enUS from '@/i18n/locales/en-US';

const mocks = vi.hoisted(() => ({
  user: null as any,
  getReport: vi.fn(),
  complete: vi.fn(),
  status: vi.fn(),
  seen: vi.fn(),
  success: vi.fn(),
}));
vi.mock('@/store', () => ({ useUserStore: () => mocks.user }));
vi.mock('@/api/growthApi', () => ({
  getAnnualReport: mocks.getReport,
  completeAnnualReport: mocks.complete,
  getAnnualReportStatus: mocks.status,
}));
vi.mock('@/api/userApi', () => ({ default: { markFeatureAnnouncementSeen: mocks.seen } }));
vi.mock('@/api/commonApi', () => ({ recordOperation: vi.fn() }));
vi.mock('@/api/cloudFileUploadApi', () => ({ ensureCloudFolder: vi.fn(), uploadCloudFile: vi.fn() }));
vi.mock('@/utils/canvasExport', () => ({ prepareMaskedIconsForCanvas: vi.fn() }));
vi.mock('@/utils/mobileOverlayHistory', () => ({
  closeCurrentMobileOverlayThen: async (close: () => void, next: () => unknown) => (close(), next()),
}));
vi.mock('@/components/base/BasicComponents/BDrawer.vue', () => ({
  default: defineComponent({
    props: ['open'],
    setup:
      (props, { slots }) =>
      () =>
        props.open ? h('aside', { class: 'drawer' }, slots.default?.()) : null,
  }),
}));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: { error: vi.fn(), success: mocks.success, info: vi.fn() },
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { render: () => h('span') } }));
vi.mock('vue-router', () => ({
  useRoute: () => ({ fullPath: '/growth/annual/2026' }),
  useRouter: () => ({ push: vi.fn() }),
}));

import { useAnnualReport } from '@/composables/useAnnualReport';
import type { AnnualReport } from '@/utils/annualReport';
import { annualDayLevel, formatAnnualCompact } from '@/utils/annualReport';
import AnnualStory from './AnnualStory.vue';
import AnnualReportPoster from './AnnualReportPoster.vue';
import AnnualReportMobile from './AnnualReportMobile.vue';
import { annualTitleSub, annualTitleText } from './annualTitle';

const FULL: AnnualReport = {
  year: 2026,
  available: true,
  phase: 'preview',
  start: '2026-01-01',
  dataEnd: '2026-12-14',
  tier: 'full',
  chapters: ['cover', 'overview', 'rhythm', 'notes', 'bookmarks', 'keywords', 'time', 'action', 'poster'],
  profile: { joinedDay: '2025-03-01', joinDays: 641, level: 11, levelName: '翰林' },
  title: { key: 'combined', noun: 'bookmark', modifier: 'night', basis: 38 },
  overview: {
    total: 512,
    byType: { bookmark: 186, note: 142, file: 97, todo: 64, organize: 23 },
    resources: 425,
    batchExcluded: 35,
    first: { type: 'bookmark', id: 'b1', title: 'MDN · CSS 容器查询', date: '2026-01-03' },
    last: { type: 'note', id: 'n9', title: '周末计划', date: '2026-12-14' },
  },
  rhythm: {
    activeDays: 168,
    days: Array.from({ length: 348 }, (_, index) => (index % 3 === 0 ? 2 : 0)),
    months: [22, 18, 35, 78, 52, 41, 47, 55, 49, 58, 39, 18],
    monthActive: [9, 7, 13, 24, 17, 14, 16, 18, 15, 17, 12, 6],
    longestStreak: { days: 19, start: '2026-04-02', end: '2026-04-20' },
    busiestDay: { date: '2026-04-12', count: 23 },
    busiestMonth: { month: 4, count: 78 },
  },
  notes: {
    count: 142,
    chars: 186_000,
    avgChars: 1310,
    perMonth: [6, 5, 9, 22, 15, 11, 13, 14, 12, 17, 12, 6],
    mostRevised: { id: 'n1', title: '2026 读书清单', versions: 37 },
    longest: { id: 'n2', title: '置身事内 · 读书笔记', chars: 12_000 },
    highlights: [{ id: 'n1', title: '2026 读书清单', versions: 37, chars: 800 }],
  },
  bookmarks: {
    count: 186,
    domains: [
      { domain: 'github.com', count: 31 },
      { domain: 'juejin.cn', count: 18 },
    ],
    busiestDay: { date: '2026-03-18', count: 14 },
  },
  keywords: {
    top: [
      { id: 't1', name: '前端', count: 64 },
      { id: 't2', name: '读书', count: 41 },
      { id: 't3', name: 'Android', count: 27 },
    ],
    newTags: [{ id: 't3', name: 'Android', count: 27, month: 3 }],
  },
  time: {
    hours: Array.from({ length: 24 }, (_, hour) => (hour >= 21 ? 60 : 10)),
    peakHour: 23,
    peakSegment: { key: 'night', from: 21, to: 24, share: 38 },
    weekdayShare: 71,
  },
  action: {
    todos: 64,
    organized: 23,
    checkinDays: 121,
    longestCheckinStreak: 46,
    achievements: 9,
    points: 3420,
    exp: 9000,
    startLevel: 1,
    level: 11,
    since: '2026-07-08',
  },
  light: null,
};

function i18nFor(locale: 'zh-CN' | 'en-US') {
  return createI18n({ legacy: false, locale, messages: { 'zh-CN': zhCN, 'en-US': enUS } });
}

function mount(component: any, props: Record<string, unknown> = {}, locale: 'zh-CN' | 'en-US' = 'zh-CN') {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(component, props) });
  app.use(i18nFor(locale));
  app.mount(host);
  return { host, unmount: () => (app.unmount(), host.remove()) };
}

beforeEach(() => {
  mocks.user = reactive({ id: 'u1', role: 'user', alias: '小满', preferences: {}, adminContext: null });
  mocks.getReport.mockReset();
  mocks.complete.mockReset();
  mocks.success.mockReset();
  mocks.seen.mockReset().mockResolvedValue({ status: 200 });
  mocks.status.mockResolvedValue({ status: 200, data: { available: true, eligible: true, entryActive: true } });
  window.localStorage.clear();
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('annual report helpers', () => {
  it('builds titles from rule keys in both languages', () => {
    const zh = i18nFor('zh-CN').global;
    const en = i18nFor('en-US').global;
    expect(annualTitleText(FULL, zh.t)).toBe('深夜收藏家');
    expect(annualTitleSub(FULL, zh.t, 'zh-CN')).toBe('晚上九点后，留下了 38% 的记录');
    expect(annualTitleText(FULL, en.t)).toBe('Night-owl Collector');
    const plain = { ...FULL, title: { key: 'combined', noun: 'note', modifier: null, basis: 40 } } as AnnualReport;
    expect(annualTitleText(plain, zh.t)).toBe('笔耕者');
    expect(annualTitleSub(plain, zh.t, 'zh-CN')).toBe('笔记占了今年 40% 的记录');
    const starter = {
      ...FULL,
      tier: 'light',
      title: { key: 'starter', noun: null, modifier: null, basis: null },
      profile: { ...FULL.profile!, joinedDay: '2026-11-02' },
    } as AnnualReport;
    expect(annualTitleText(starter, zh.t)).toBe('启程者');
    expect(annualTitleSub(starter, zh.t, 'zh-CN')).toContain('来到轻笺');
  });

  it('grades calendar days and compacts big numbers', () => {
    expect([0, 1, 3, 5, 15].map(annualDayLevel)).toEqual([0, 1, 2, 3, 4]);
    expect(formatAnnualCompact(186_000, 'zh-CN')).toBe('18.6万');
    expect(formatAnnualCompact(9_999, 'zh-CN')).toBe('9,999');
  });
});

describe('annual report rendering', () => {
  it('renders every story chapter without leaking a zero chapter', async () => {
    for (const chapter of FULL.chapters!.filter((key) => key !== 'poster')) {
      const view = mount(AnnualStory, { report: FULL, chapter, number: 1, displayName: '小满', avatarSrc: '' });
      await nextTick();
      expect(view.host.textContent?.trim().length, chapter).toBeGreaterThan(10);
      view.unmount();
    }
    const overview = mount(AnnualStory, { report: FULL, chapter: 'overview', displayName: '小满', avatarSrc: '' });
    expect(overview.host.textContent).toContain('另有 35 条批量导入未计入');
    overview.unmount();
  });

  it('keeps the poster to totals and only shows keywords when asked', async () => {
    const hidden = mount(AnnualReportPoster, {
      report: FULL,
      displayName: '小满',
      avatarSrc: '',
      showName: false,
      showKeywords: false,
    });
    expect(hidden.host.textContent).toContain('我的 2026');
    expect(hidden.host.textContent).toContain('深夜收藏家');
    expect(hidden.host.textContent).not.toContain('前端');
    expect(hidden.host.textContent).not.toContain('读书清单');
    expect(hidden.host.textContent).not.toContain('小满');
    hidden.unmount();
    const shown = mount(AnnualReportPoster, {
      report: FULL,
      displayName: '小满',
      avatarSrc: '',
      showName: true,
      showKeywords: true,
    });
    expect(shown.host.textContent).toContain('小满');
    expect(shown.host.textContent).toContain('前端');
    shown.unmount();
  });
});

describe('annual report state', () => {
  function host(year = ref(2026)) {
    let api!: ReturnType<typeof useAnnualReport>;
    const view = mount(
      defineComponent({
        setup() {
          api = useAnnualReport(year);
          return () => h('div');
        },
      }),
    );
    return { api: () => api, view };
  }

  it('records the commemorative achievement once when the poster is reached', async () => {
    mocks.getReport.mockResolvedValue({ status: 200, data: FULL });
    mocks.complete.mockResolvedValue({ status: 200, data: { key: 'annual_review_2026', newlyUnlocked: true } });
    const { api, view } = host();
    await vi.waitFor(() => expect(api().state.value).toBe('ready'));
    expect(mocks.seen).toHaveBeenCalledTimes(1);
    api().toPoster();
    await vi.waitFor(() => expect(mocks.complete).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(mocks.success).toHaveBeenCalledWith('获得纪念成就「年度回望 · 2026」'));
    api().prev();
    await nextTick();
    api().toPoster();
    await nextTick();
    expect(mocks.complete).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('drops a stale response after the account changes', async () => {
    let resolveFirst!: (value: unknown) => void;
    mocks.getReport
      .mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce({
        status: 200,
        data: { ...FULL, tier: 'light', chapters: ['cover', 'overview', 'poster'] },
      });
    const { api, view } = host();
    mocks.user.id = 'u2';
    await vi.waitFor(() => expect(api().state.value).toBe('ready'));
    resolveFirst({ status: 200, data: FULL });
    await nextTick();
    expect(api().chapters.value).toEqual(['cover', 'overview', 'poster']);
    view.unmount();
  });
});

describe('mobile navigation', () => {
  it('turns pages by tapping the sides but not when a button is pressed', async () => {
    const events: string[] = [];
    const view = mount(AnnualReportMobile, {
      year: 2026,
      report: FULL,
      state: 'ready',
      chapters: FULL.chapters,
      index: 1,
      current: 'overview',
      isFirst: false,
      isLast: false,
      ownerKey: 'u1',
      displayName: '小满',
      avatarSrc: '',
      showName: true,
      showKeywords: false,
      onNext: () => events.push('next'),
      onPrev: () => events.push('prev'),
    });
    await nextTick();
    const story = view.host.querySelector<HTMLElement>('.arm-story')!;
    story.getBoundingClientRect = () => ({ left: 0, width: 300, top: 0, height: 600 }) as DOMRect;
    story.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 40 }));
    story.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 250 }));
    view.host.querySelector<HTMLElement>('.s-detail')!.click();
    expect(events).toEqual(['prev', 'next']);
    view.unmount();
  });
});
