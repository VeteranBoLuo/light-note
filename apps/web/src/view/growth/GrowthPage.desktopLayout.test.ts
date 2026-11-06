import { readFileSync as rawReadFileSync } from 'node:fs';
import { standardDensitySource } from '@/test/standardDensitySource';

const readFileSync = (path: string, encoding: 'utf8') => standardDensitySource(rawReadFileSync(path, encoding));
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/view/growth/GrowthPage.vue'), 'utf8');

describe('GrowthPage 宽屏桌面导航布局', () => {
  it('复用全站桌面与紧凑布局判断，只在宽屏显示左侧导航', () => {
    expect(source).toContain('bookmark.isDesktop && !bookmark.isCompactLayout');
    expect(source).toContain('<aside v-if="useWideDesktopLayout" class="growth-desktop-sidebar">');
    expect(source).toMatch(/<BTabs[\s\S]*?v-if="!useWideDesktopLayout"[\s\S]*?class="growth-section-tabs"/);
    expect(source).toMatch(/\.growth-workspace--wide\s*\{[\s\S]*?grid-template-columns:\s*200px minmax\(0, 1fr\)/);
    expect(source).toContain('max-width: 1480px');
  });

  it('宽屏把返回与标题压缩为侧栏首行，紧凑布局仍显示顶部标题', () => {
    expect(source).toMatch(/<header v-(?:else-)?if="!useWideDesktopLayout" class="growth-hero">/);
    const sidebar = source.match(/<aside v-if="useWideDesktopLayout"[\s\S]*?<\/aside>/)?.[0] || '';
    expect(sidebar).toMatch(/<header class="growth-sidebar-head">[\s\S]*?:aria-label="t\('common\.back'\)"[\s\S]*?growth\.pageTitle/);
    expect(sidebar).not.toContain('growth.pageSubtitle');
    expect(source).toMatch(/\.growth-desktop-sidebar\s*\{[\s\S]*?position:\s*static;[\s\S]*?max-height:\s*100%/);
    expect(source).toContain("'growth-page--wide': useWideDesktopLayout");
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
    expect(source).toContain('v-for="group in desktopNavigationGroups"');
    expect(source).toContain('v-for="option in group.options"');
    expect(source).toContain('@click="selectDesktopNavigation(option)"');
    expect(source).toContain('key: `reward-${option.key}`');
    expect(source).not.toContain('growth-side-subnav');
    expect(source).toMatch(
      /<template v-if="activeSection === 'rewards'">[\s\S]*?<BTabs[\s\S]*?v-if="!useWideDesktopLayout"[\s\S]*?class="growth-reward-tabs"/,
    );
  });

  it('奖励页归并为背包、兑换和抽奖，积分旧入口交由导航兼容层处理', () => {
    expect(source).toContain('inventoryPointsRoute(route.query)');
    expect(source).toMatch(/const options:[\s\S]*?key: 'inventory'[\s\S]*?key: 'shop'[\s\S]*?key: 'lottery'/);
    expect(source).not.toContain("{ key: 'ledger', label:");
    expect(source).toContain('v-model:active-tab="inventoryTab"');
  });

  it('宽屏和紧凑桌面都使用资产与奖励全称，移动端保留短标签', () => {
    expect(source).toContain('growthV2Enabled.value && !bookmark.isMobile');
    expect(source).toContain("t('growth.assetsRewardsTitle')");
    expect(source).toContain("t('growth.mobileTabRewards')");
  });

  it('移动端进入抽奖时等待面板布局稳定，并在积分抽奖标题上方保留完整间距', () => {
    expect(source).toContain('async function scrollLotteryToPreferredPosition(');
    expect(source).toContain("document.getElementById('lottery-title')");
    expect(source).toContain('requestAnimationFrame(() => requestAnimationFrame(() => resolve()))');
    expect(source).toContain('scrollIntoContainer(container, lotteryTitle, 112');
    expect(source).toContain('@focus-draw="scrollLotteryToPreferredPosition(true)"');
    expect(source).toContain("if (section === 'lottery') void scrollLotteryToPreferredPosition()");
  });

  it('扁平导航不再依赖折叠状态，奖励项直接切换对应页', () => {
    expect(source).not.toContain('rewardsExpanded');
    expect(source).not.toContain(':aria-expanded');
    expect(source).toMatch(/function isDesktopNavigationActive[\s\S]*?option\.reward === activeRewardSection\.value/);
  });

  it('当前项使用实色左侧标记与强调文字表达，不只依赖混色背景', () => {
    expect(source).toMatch(
      /\.growth-side-nav-item\.b_btn\.is-active::before\s*\{[\s\S]*?background:\s*var\(--primary-color\)/,
    );
    expect(source).toMatch(/\.growth-side-nav-item\.b_btn\.is-active\s*\{[\s\S]*?color:\s*var\(--primary-color\)/);
    expect(source).toMatch(
      /\.growth-side-nav-item\.is-active \.growth-side-nav-icon\s*\{[\s\S]*?color:\s*var\(--primary-color\)/,
    );
  });

  it('侧栏按成长与奖励分组，任务进度与免费抽奖挂在入口上，周报、年度报告和成长偏好放在底部', () => {
    expect(source).toContain("label: t('growth.overview.navGrowth')");
    expect(source).toContain("label: t('growth.overview.navRewards')");
    expect(source).toMatch(/option\.key === 'tasks' && quests\.value\.length/);
    expect(source).toMatch(/option\.key === 'lottery' && preferences\.value && !lowPressureMode\.value/);
    const links = source.match(/<div class="growth-side-links">[\s\S]*?<\/div>/)?.[0] || '';
    expect(links).toContain('openWeeklyReport');
    expect(links).toContain('openAnnualReport');
    expect(links).toContain('preferencesVisible = true');
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
    expect(source).toContain('claimSuccessMessage(res.data, pendingBreakdown)');
  });

  it('工作台周挑战入口定位到任务分区末尾，并在异步挑战数据加载后重新对齐', () => {
    expect(source).toContain('<section v-else-if="taskView === \'weekly\'" id="growth-weekly">');
    expect(source).toContain("if (hash === '#growth-weekly') return 'tasks'");
    expect(source).toContain("block: route.hash === '#growth-weekly' ? 'end' : 'start'");
    expect(source).toContain('@loaded="handleWeeklyLoaded"');
    expect(source).toMatch(/function handleWeeklyLoaded[\s\S]*?route\.hash === '#growth-weekly'[\s\S]*?scrollToHash/);
  });

  it('概览按今天、段位与成就、知识足迹排列，签到日历和成长偏好改为弹框', () => {
    const overview = source.match(/<template v-if="activeSection === 'overview'">[\s\S]*?<\/template>\n\n/)?.[0] || '';
    const todayIndex = overview.indexOf('<GrowthTodayPanel');
    const rankIndex = overview.indexOf('<GrowthRankPanel');
    const achievementIndex = overview.indexOf('<GrowthAchievementPanel');
    const footprintIndex = overview.indexOf('<GrowthFootprintPanel');
    expect(todayIndex).toBeGreaterThan(-1);
    expect(rankIndex).toBeGreaterThan(todayIndex);
    expect(achievementIndex).toBeGreaterThan(rankIndex);
    expect(footprintIndex).toBeGreaterThan(achievementIndex);
    expect(overview).not.toContain('<SigninCalendar');
    expect(overview).not.toContain('<GrowthPreferencesCard');
    expect(source).toMatch(/<BModal\s+v-model:visible="calendarVisible"[\s\S]*?<SigninCalendar[\s\S]*?@makeup="onUseProtectCard"/);
    expect(source).toMatch(/<BModal\s+v-if="growthV2Enabled"\s+v-model:visible="preferencesVisible"[\s\S]*?<GrowthPreferencesCard/);
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

  it('成长页只保留成长足迹时间线，不再展示或自动加载旧内容回顾卡', () => {
    expect(source).not.toContain('RecapCard');
    expect(source).not.toContain('loadRecap');
    expect(source).not.toContain('recapLoading');
    expect(source).not.toContain('recapError');
    expect(source).toContain('<GrowthFootprintPanel ref="heatmapRef" :timeline="timeline"');
  });
});
