import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/view/growth/GrowthPage.vue'), 'utf8');

describe('GrowthPage 宽屏桌面导航布局', () => {
  it('复用全站桌面与紧凑布局判断，只在宽屏显示左侧导航', () => {
    expect(source).toContain('bookmark.isDesktop && !bookmark.isCompactLayout');
    expect(source).toContain('<aside v-if="useWideDesktopLayout" class="growth-desktop-sidebar">');
    expect(source).toMatch(/<BTabs[\s\S]*?v-if="!useWideDesktopLayout"[\s\S]*?class="growth-section-tabs"/);
    expect(source).toMatch(/\.growth-workspace--wide\s*\{[\s\S]*?grid-template-columns:\s*220px minmax\(0, 1fr\)/);
    expect(source).toContain('max-width: 1360px');
  });

  it('宽屏把返回、标题和说明纳入同一个固定侧栏，紧凑布局仍显示顶部标题', () => {
    expect(source).toMatch(/<header v-if="!useWideDesktopLayout" class="growth-hero">/);
    expect(source).toMatch(
      /<aside v-if="useWideDesktopLayout" class="growth-desktop-sidebar">[\s\S]*?<header class="growth-hero growth-hero--sidebar">[\s\S]*?growth\.pageTitle[\s\S]*?growth\.pageSubtitle/,
    );
    expect(source).toMatch(
      /\.growth-desktop-sidebar\s*\{[\s\S]*?position:\s*sticky;[\s\S]*?max-height:\s*calc\(100vh - 36px\)/,
    );
  });

  it('奖励二级入口进入左栏，紧凑布局仍保留原有顶部二级 Tab', () => {
    expect(source).toContain("section.key === 'rewards' && rewardsExpanded");
    expect(source).toContain('@click="selectRewardSection(rewardSection.key)"');
    expect(source).toMatch(
      /<template v-if="activeSection === 'rewards'">[\s\S]*?<BTabs[\s\S]*?v-if="!useWideDesktopLayout"[\s\S]*?class="growth-reward-tabs"/,
    );
  });

  it('C5 功能开启时默认积分中心优先，并保持四个旧深链键兼容', () => {
    expect(source).toContain(
      "const validRewardSections: RewardSection[] = ['center', 'shop', 'lottery', 'inventory', 'ledger']",
    );
    expect(source).toContain('const activeRewardSection = ref<RewardSection>(');
    expect(source).toContain("enabled && pointsCenterEnabled.value ? 'center' : enabled ? 'inventory' : 'shop'");
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

  it('当前奖励分区保持选中时，二级入口仍可独立展开和折叠', () => {
    expect(source).toContain("const rewardsExpanded = ref(activeSection.value === 'rewards')");
    expect(source).toContain(`:aria-expanded="section.key === 'rewards' ? rewardsExpanded : undefined"`);
    expect(source).toMatch(
      /if \(section === 'rewards' && activeSection\.value === 'rewards'\)\s*\{\s*rewardsExpanded\.value = !rewardsExpanded\.value;\s*return;/,
    );
    expect(source).toMatch(/watch\(activeSection,[\s\S]*?rewardsExpanded\.value = section === 'rewards';/);
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
});
