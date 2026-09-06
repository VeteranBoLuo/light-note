import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/view/growth/GrowthPage.vue'), 'utf8');
const feedbackSource = readFileSync(resolve(process.cwd(), 'src/composables/useGrowthClaimFeedback.ts'), 'utf8');

describe('GrowthPage 宽屏桌面导航布局', () => {
  it('复用全站桌面与紧凑布局判断，只在宽屏显示左侧导航', () => {
    expect(source).toContain('bookmark.isDesktop && !bookmark.isCompactLayout');
    expect(source).toContain('<aside v-if="useWideDesktopLayout" class="growth-desktop-sidebar">');
    expect(source).toMatch(/<BTabs[\s\S]*?v-if="!useWideDesktopLayout"[\s\S]*?class="growth-section-tabs"/);
    expect(source).toMatch(/\.growth-workspace--wide\s*\{[\s\S]*?grid-template-columns:\s*208px minmax\(0, 1fr\)/);
    expect(source).toContain('max-width: 1480px');
  });

  it('宽屏把返回、标题和说明纳入同一个固定侧栏，紧凑布局仍显示顶部标题', () => {
    expect(source).toMatch(/<header v-if="!useWideDesktopLayout" class="growth-hero">/);
    expect(source).toMatch(
      /<aside v-if="useWideDesktopLayout" class="growth-desktop-sidebar">[\s\S]*?<header class="growth-hero growth-hero--sidebar">[\s\S]*?growth\.pageTitle[\s\S]*?growth\.pageSubtitle/,
    );
    expect(source).toMatch(/\.growth-desktop-sidebar\s*\{[\s\S]*?position:\s*static;[\s\S]*?max-height:\s*100%/);
    expect(source).toContain(`:class="{ 'growth-page--wide': useWideDesktopLayout }"`);
    expect(source).toMatch(/\.growth-page--wide\s*\{[\s\S]*?overflow:\s*hidden;/);
    expect(source).toMatch(
      /\.growth-workspace--wide \.growth-main\s*\{[\s\S]*?height:\s*100%;[\s\S]*?overflow-y:\s*auto;/,
    );
    expect(source).not.toContain('scrollbar-gutter: stable');
    expect(source).toContain('ref="growthMainRef" class="growth-main"');
    expect(source).toContain('useWideDesktopLayout.value ? growthMainRef.value : growthPageRef.value');
    expect(source).toContain("bookmark.isMobile && section === 'rewards'");
    expect(source).toMatch(
      /function selectRewardSection[\s\S]*?if \(useWideDesktopLayout\.value\)[\s\S]*?resetMobileScrollElement\(growthMainRef\.value\)/,
    );
  });

  it('宽屏把奖励页扁平化为一级入口，紧凑布局仍保留顶部二级 Tab', () => {
    expect(source).toContain('v-for="option in desktopNavigationOptions"');
    expect(source).toContain('@click="selectDesktopNavigation(option)"');
    expect(source).toContain('key: `reward-${option.key}`');
    expect(source).not.toContain('growth-side-subnav');
    expect(source).toMatch(
      /<template v-if="activeSection === 'rewards'">[\s\S]*?<BTabs[\s\S]*?v-if="!useWideDesktopLayout"[\s\S]*?class="growth-reward-tabs"/,
    );
  });

  it('奖励页保留五个入口与旧深链兼容', () => {
    expect(source).toContain(
      "const validRewardSections: RewardSection[] = ['center', 'shop', 'lottery', 'inventory', 'ledger']",
    );
    expect(source).toContain('const activeRewardSection = ref<RewardSection>(');
    expect(source).toContain("hasRewardDeepLink ? (routeRewardSection as RewardSection) : 'inventory'");
    expect(source).toMatch(
      /const options:[\s\S]*?key: 'center'[\s\S]*?key: 'inventory'[\s\S]*?key: 'shop'[\s\S]*?key: 'ledger'[\s\S]*?key: 'lottery'/,
    );
    for (const legacyKey of ['shop', 'lottery', 'inventory', 'ledger']) {
      expect(source).toContain(`'${legacyKey}'`);
    }
  });

  it('宽屏和紧凑桌面都使用资产与奖励全称，移动端保留短标签', () => {
    expect(source).toContain('growthV2Enabled.value && !bookmark.isMobile');
    expect(source).toContain("t('growth.assetsRewardsTitle')");
    expect(source).toContain("t('growth.mobileTabRewards')");
  });

  it('移动端进入抽奖时等待面板布局稳定，并在积分抽奖标题上方保留完整间距', () => {
    expect(source).toContain('async function scrollLotteryToPreferredPosition()');
    expect(source).toContain("document.getElementById('lottery-title')");
    expect(source).toContain('requestAnimationFrame(() => requestAnimationFrame(() => resolve()))');
    expect(source).toContain('scrollIntoContainer(container, lotteryTitle, 112');
    expect(source).toContain('@focus-header="scrollLotteryToPreferredPosition"');
    expect(source).toContain("if (section === 'lottery') void scrollLotteryToPreferredPosition()");
  });

  it('扁平导航不再依赖折叠状态，奖励项直接切换对应页', () => {
    expect(source).not.toContain('rewardsExpanded');
    expect(source).not.toContain(':aria-expanded');
    expect(source).toMatch(/function isDesktopNavigationActive[\s\S]*?option\.reward === activeRewardSection\.value/);
    expect(source).toMatch(
      /function selectDesktopNavigation[\s\S]*?activeRewardSection\.value = option\.reward;[\s\S]*?selectSection\(option\.section\)/,
    );
  });

  it('当前项同时使用实色描边、左侧标记和实心图标底表达', () => {
    expect(source).toMatch(
      /\.growth-side-nav-item\.b_btn\.is-active\s*\{[\s\S]*?border-color:\s*var\(--primary-color\)/,
    );
    expect(source).toMatch(
      /\.growth-side-nav-item\.b_btn\.is-active::before\s*\{[\s\S]*?background:\s*var\(--primary-color\)/,
    );
    expect(source).toMatch(
      /\.growth-side-nav-item\.is-active \.growth-side-nav-icon\s*\{[\s\S]*?background:\s*var\(--primary-color\)[\s\S]*?color:\s*#fff/,
    );
  });

  it('侧栏交互继续使用 BButton 与统一 SvgIcon', () => {
    const sidebar = source.match(/<aside v-if="useWideDesktopLayout"[\s\S]*?<\/aside>/)?.[0] || '';
    expect(sidebar).toContain('<BButton');
    expect(sidebar).toContain('<SvgIcon');
    expect(sidebar).not.toMatch(/<(?:button|input|select|textarea)(?:\s|>)/i);
    expect(sidebar).not.toMatch(/<svg(?:\s|>)/i);
  });

  it('可领取成就同时映射到桌面侧栏与移动端共用 Tab 的角标', () => {
    expect(source).toContain('const achievementBadge = achievementClaimableCount.value');
    expect(source).toContain('badge: achievementBadge > 0 ? achievementBadge : undefined');
    expect(source).toContain('class="growth-side-nav-badge"');
    expect(source).toMatch(
      /\.growth-side-nav-badge\s*\{[\s\S]*?border:\s*1px solid var\(--primary-color\)[\s\S]*?background:\s*var\(--primary-color\)[\s\S]*?color:\s*#fff/,
    );
    expect(source).toMatch(
      /\.growth-section-tabs :deep\(\.tab-badge\)\s*\{[\s\S]*?background:\s*var\(--primary-color\)[\s\S]*?color:\s*#fff/,
    );
  });

  it('一键领取只保留一份按钮模板，桌面显示构成 Tooltip，成功提示读取服务端回执', () => {
    const taskHeading =
      source.match(/<header v-if="growthV2Enabled" class="growth-section-heading">[\s\S]*?<\/header>/)?.[0] || '';
    expect(taskHeading).toContain('<BTooltip');
    expect(taskHeading).toContain(':disabled="!bookmark.isDesktop"');
    expect(taskHeading.match(/class="growth-claim-all"/g)).toHaveLength(1);
    expect(source).toContain('const pendingBreakdown = snapshotClaimableBreakdown()');
    expect(source).toContain('claimSuccessMessage(res.data.receipts, pendingBreakdown)');
    expect(feedbackSource).toContain("t('growth.claimAllSuccessBySource', { sources })");
  });

  it('工作台周挑战入口定位到任务分区末尾，并在异步挑战数据加载后重新对齐', () => {
    expect(source).toContain('<section v-else-if="taskView === \'weekly\'" id="growth-weekly">');
    expect(source).toContain("if (hash === '#growth-weekly') return 'tasks'");
    expect(source).toContain("block: route.hash === '#growth-weekly' ? 'end' : 'start'");
    expect(source).toContain('@loaded="handleWeeklyLoaded"');
    expect(source).toMatch(/function handleWeeklyLoaded[\s\S]*?route\.hash === '#growth-weekly'[\s\S]*?scrollToHash/);
  });

  it('概览将知识足迹与签到日历合并，任务页按日常、每周与新手路线切换', () => {
    expect(source).toContain('class="growth-panel growth-knowledge-panel"');
    const knowledgeStart = source.indexOf('class="growth-panel growth-knowledge-panel"');
    const calendarIndex = source.indexOf('<SigninCalendar', knowledgeStart);
    const heatmapIndex = source.indexOf(
      '<ActivityHeatmap ref="heatmapRef" class="growth-knowledge-panel__heatmap" />',
      knowledgeStart,
    );
    expect(calendarIndex).toBeGreaterThan(knowledgeStart);
    expect(heatmapIndex).toBeGreaterThan(calendarIndex);
    expect(source).toContain(':show-calendar="!useWideDesktopLayout"');
    expect(source).toContain('v-model:active-tab="taskView"');
    expect(source).toContain(':options="taskViewOptions"');
    expect(source).toContain('class="growth-task-summary"');
  });

  it('共享任务卡不被宽屏 Flex 容器压缩，周任务与新手路线都交由主内容区滚动', () => {
    expect(source).toMatch(/\.growth-task-center\s*\{[\s\S]*?flex:\s*0 0 auto;[\s\S]*?overflow:\s*hidden;/);
    expect(source).toMatch(
      /<div class="growth-task-workspace__main">[\s\S]*?id="growth-weekly"[\s\S]*?id="growth-tasks"/,
    );
    expect(source).toMatch(
      /\.growth-workspace--wide \.growth-main\s*\{[\s\S]*?height:\s*100%;[\s\S]*?overflow-y:\s*auto;/,
    );
  });

  it('宽屏概览按原型先展示状态条和等级资产，再并排展示下一步与每日任务', () => {
    const todayIndex = source.indexOf('<TodayGrowthCard');
    const growthIndex = source.indexOf('<GrowthCard');
    const statsIndex = source.indexOf('<GrowthStats');
    const routineIndex = source.indexOf('class="growth-overview-routine"');
    const nextActionIndex = source.indexOf('<GrowthNextActionCard', routineIndex);
    const dailyIndex = source.indexOf('<DailyQuests', routineIndex);

    expect(todayIndex).toBeGreaterThan(-1);
    expect(growthIndex).toBeGreaterThan(todayIndex);
    expect(statsIndex).toBeGreaterThan(growthIndex);
    expect(routineIndex).toBeGreaterThan(statsIndex);
    expect(nextActionIndex).toBeGreaterThan(routineIndex);
    expect(dailyIndex).toBeGreaterThan(nextActionIndex);
    expect(source).toContain(':compact="useWideDesktopLayout"');
    expect(source).toContain(':show-next-action="!useWideDesktopLayout"');
    expect(source).toMatch(/\.growth-overview-routine\s*\{[\s\S]*?grid-template-columns:/);
  });

  it('成长页只保留成长足迹时间线，不再展示或自动加载旧内容回顾卡', () => {
    expect(source).not.toContain('RecapCard');
    expect(source).not.toContain('loadRecap');
    expect(source).not.toContain('recapLoading');
    expect(source).not.toContain('recapError');
    expect(source).toContain('<GrowthTimeline v-if="timeline.length" :items="timeline" />');
    expect(source).toContain('<div v-else class="growth-state">{{ t(\'growth.footprintEmpty\') }}</div>');
  });
});
