import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import zh from '@/i18n/locales/zh-CN';

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, any>,
  bookmark: { isDesktop: true, isMobile: false, isCompactLayout: false },
}));
vi.mock('@/store', () => ({
  bookmarkStore: () => mocks.bookmark,
  useUserStore: () => ({ id: 'navigation-test', adminContext: null }),
}));
vi.mock('@/composables/useGrowth.ts', async () => {
  const { ref } = await import('vue');
  for (const key of ['growth', 'dashboard', 'growthTasks', 'lottery', 'weekly', 'claimable', 'preferences'])
    mocks.state[key] = ref(null);
  for (const key of [
    'loading',
    'growthError',
    'dashboardLoading',
    'dashboardError',
    'growthTasksLoading',
    'growthTasksError',
    'claimableLoading',
    'claimableError',
    'preferencesLoading',
    'preferencesError',
    'claimingRewards',
  ])
    mocks.state[key] = ref(false);
  for (const key of [
    'load',
    'loadDashboard',
    'loadGrowthTasks',
    'loadWeekly',
    'loadLottery',
    'loadClaimable',
    'claimAllRewards',
    'loadPreferences',
    'savePreferences',
    'claimDailyBonus',
    'claimAchievement',
    'useProtectCard',
  ])
    mocks.state[key] = vi.fn(async () => null);
  return { useGrowth: () => mocks.state };
});
vi.mock('@/composables/useForegroundRefresh', () => ({ useForegroundRefresh: vi.fn() }));
vi.mock('@/composables/useMobileTopBar', () => ({ useMobileTopBar: vi.fn() }));
vi.mock('@/api/commonApi.ts', () => ({ recordOperation: vi.fn() }));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/growth/GrowthCard.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/growth/GrowthTasks.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/growth/ActivityHeatmap.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/growth/SigninCalendar.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/growth/DailyQuests.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/growth/GrowthStats.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/growth/AchievementWall.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/growth/GrowthTimeline.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/growth/MilestoneLadder.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/growth/PointsShop.vue', () => ({ default: { render: () => h('h2', '兑换测试页') } }));
vi.mock('@/components/growth/LotteryDraw.vue', () => ({ default: { render: () => h('h2', '抽奖测试页') } }));
vi.mock('@/components/growth/MyInventory.vue', () => ({ default: { render: () => h('h2', '背包测试页') } }));
vi.mock('@/components/growth/WeeklyChallenge.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/growth/TodayGrowthCard.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/growth/GrowthPreferencesCard.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/growth/GrowthNextActionCard.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/growth/AchievementHighlights.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/growth/WeeklyReportModal.vue', () => ({ default: { render: () => null } }));
import GrowthPage from './GrowthPage.vue';

let cleanup: (() => void) | undefined;
const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
const settle = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
};
async function mount(entry = '/growth') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/source', component: { render: () => null } },
      { path: '/growth', component: GrowthPage },
    ],
  });
  await router.push('/source');
  await router.push(entry);
  await router.isReady();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(RouterView) });
  app.use(router).use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh } }));
  app.directive('click-log', {});
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  await settle();
  const click = (name: string, role = 'button') => {
    const element = [...host.querySelectorAll<HTMLElement>(role === 'tab' ? '[role="tab"]' : 'button')].find(
      (el) => el.textContent?.trim() === name,
    );
    expect(element, `navigation control ${name}`).toBeTruthy();
    element!.click();
  };
  return { host, router, click };
}
beforeEach(() => {
  mocks.bookmark.isDesktop = true;
  mocks.bookmark.isMobile = false;
  mocks.bookmark.isCompactLayout = false;
  mocks.state.growth.value = { features: { growthCenterV2: true, pointsCenter: true } };
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  vi.unstubAllGlobals();
  if (originalScrollIntoView) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScrollIntoView);
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
});

describe('成长中心路由导航', () => {
  it.each(['overview', 'tasks', 'achievements'])(
    '首次从 %s 点击抽奖只写入一次完整目标，不落到背包',
    async (section) => {
      const { host, router, click } = await mount(`/growth?section=${section}&renderProfile=desktop`);
      const replace = vi.spyOn(router, 'replace');
      click('抽奖');
      await settle();
      expect(router.currentRoute.value.query).toMatchObject({
        section: 'rewards',
        reward: 'lottery',
        renderProfile: 'desktop',
      });
      expect(host.querySelector('[aria-current="page"]')?.textContent).toContain('抽奖');
      expect(host.querySelector('.growth-main h2')?.textContent).toBe('抽奖测试页');
      expect(replace).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    ['背包', 'inventory'],
    ['兑换', 'shop'],
  ])('首次点击%s也保存完整奖励路由', async (label, reward) => {
    const { host, router, click } = await mount();
    click(label);
    await settle();
    expect(router.currentRoute.value.query).toMatchObject({ section: 'rewards', reward });
    expect(host.querySelector('[aria-current="page"]')?.textContent).toContain(label);
  });
  it.each([false, true])('成长配置在路由提交前后到达也不覆盖所选抽奖：提交后 %s', async (afterCommit) => {
    mocks.state.growth.value = { features: { growthCenterV2: false } };
    const { host, router, click } = await mount();
    click('抽奖');
    if (afterCommit) await settle();
    mocks.state.growth.value = { features: { growthCenterV2: true } };
    await settle();
    expect(router.currentRoute.value.query.reward).toBe('lottery');
    expect(host.querySelector('.growth-main h2')?.textContent).toBe('抽奖测试页');
  });
  it('外部深链接与积分旧入口切换后，页签和路由保持一致', async () => {
    const { host, router } = await mount();
    await router.replace('/growth?section=rewards&reward=lottery');
    await settle();
    expect(host.querySelector('.growth-main h2')?.textContent).toBe('抽奖测试页');
    await router.replace('/growth?section=rewards&reward=ledger&renderProfile=mobile');
    await settle();
    expect(router.currentRoute.value.query).toEqual({
      section: 'rewards',
      reward: 'inventory',
      inventoryTab: 'points',
      renderProfile: 'mobile',
    });
    expect(host.querySelector('.growth-main h2')?.textContent).toBe('背包测试页');
  });
  it('移动端一级和二级页签最终落在所选抽奖，返回仍到来源页', async () => {
    Object.assign(mocks.bookmark, { isDesktop: false, isMobile: true, isCompactLayout: true });
    const { host, router, click } = await mount();
    click('奖励', 'tab');
    await settle();
    click('抽奖', 'tab');
    await settle();
    expect(router.currentRoute.value.query).toMatchObject({ section: 'rewards', reward: 'lottery' });
    expect(host.querySelector('.growth-main h2')?.textContent).toBe('抽奖测试页');
    router.back();
    await settle();
    expect(router.currentRoute.value.path).toBe('/source');
  });
  it.each([false, true])('切换与再次点击当前分区只重置正文滚动位置：移动端 %s', async (mobile) => {
    Object.assign(mocks.bookmark, { isDesktop: !mobile, isMobile: mobile, isCompactLayout: mobile });
    const { host, router, click } = await mount();
    const page = host.querySelector<HTMLElement>('.growth-page')!;
    const main = host.querySelector<HTMLElement>('.growth-main')!;
    const content = mobile ? page : main;
    const other = mobile ? main : page;
    content.scrollTop = 240;
    other.scrollTop = 180;
    click('任务', mobile ? 'tab' : 'button');
    await settle();
    expect(router.currentRoute.value.query.section).toBe('tasks');
    expect(content.scrollTop).toBe(0);
    expect(other.scrollTop).toBe(180);
    content.scrollTop = 320;
    click('任务', mobile ? 'tab' : 'button');
    await settle();
    expect(content.scrollTop).toBe(0);
    expect(other.scrollTop).toBe(180);
  });
  it('任务锚点入口仍能切换对应分区，手动进入抽奖会移除旧锚点', async () => {
    const { router, click } = await mount('/growth#growth-tasks');
    await settle();
    expect(router.currentRoute.value.query.section).toBe('tasks');
    expect(router.currentRoute.value.hash).toBe('#growth-tasks');
    click('抽奖');
    await settle();
    expect(router.currentRoute.value.query).toMatchObject({ section: 'rewards', reward: 'lottery' });
    expect(router.currentRoute.value.hash).toBe('');
  });
});
