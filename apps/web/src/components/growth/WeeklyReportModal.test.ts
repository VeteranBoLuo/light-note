import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const modal = read('src/components/growth/WeeklyReportModal.vue');
const poster = read('src/components/growth/WeeklyReportPoster.vue');
const insights = read('src/components/growth/WeeklyReportInsights.vue');
const zhSource = read('src/i18n/locales/zh-CN-core.ts');
const enSource = read('src/i18n/locales/en-US-core.ts');
const growthPage = read('src/view/growth/GrowthPage.vue');
const notificationBell = read('src/components/notification/NotificationBell.vue');

describe('成长周报改版', () => {
  it('只使用 B 组件与统一图标，不在模板内新增原生控件或静态 SVG', () => {
    for (const source of [modal, poster, insights]) {
      const template = source.slice(0, source.indexOf('<script'));
      expect(template).not.toMatch(/<(?:button|input|select|textarea|svg)(?:\s|>)/i);
    }
    expect(modal).toContain('<BModal');
    expect(modal).toMatch(/<BTabs[\s\S]*?variant="segment"/);
    expect(insights).toContain('<BProgress');
  });

  it('周报卡是固定画布，预览只缩放，导出克隆同一画布', () => {
    expect(poster).toMatch(/width:\s*400px;[\s\S]*?height:\s*640px;/);
    expect(poster).toContain('ui-density-fixed: 周报卡为固定 400×640 导出画布');
    expect(poster).not.toContain('@media');
    expect(modal).toContain('transform: `scale(${posterScale.value})`');
    expect(modal).toContain('poster.cloneNode(true)');
    expect(modal).toContain('prepareMaskedIconsForCanvas(exportPoster, window)');
    expect(modal).toContain('scale: EXPORT_SCALE');
    expect(modal).toContain('exportHost.remove()');
  });

  it('周报卡只放公开汇总，资源标题只出现在仅自己可见的右栏', () => {
    expect(poster).not.toMatch(/report\.(?:items|prev)/);
    expect(insights).toContain('report.items');
    expect(insights).toContain("t('growth.wrPrivateOnly')");
  });

  it('按本周/上周加载并丢弃过期响应，通知快照仍是上周时换成实时数据', () => {
    expect(modal).toContain('getWeeklyReport(period)');
    expect(modal).toContain('if (token !== generation) return;');
    expect(modal).toContain('activeKey.value = shownKey.value;');
    expect(modal).toContain('live.start === snapshot.start');
    expect(growthPage).toContain('<WeeklyReportModal v-model:visible="wrVisible" />');
    expect(notificationBell).toContain(':snapshot="wrData" initial-period="last"');
  });

  it('操作栏放在弹框底栏，移动端固定在底部并保留安全区', () => {
    expect(modal).toContain('<template #footer>');
    expect(modal).toContain("ensureCloudFolder('周报')");
    expect(modal).toContain('env(safe-area-inset-bottom)');
    expect(modal).toMatch(/\.wr-footer\.is-mobile \.wr-footer-actions \.b_btn\s*\{[\s\S]*?height:\s*44px/);
    expect(modal).toMatch(/exportDisabled = computed\(\(\) => !shown\.value \|\| shown\.value\.blank/);
  });

  it('移动端全屏弹框由周报内容区接管纵向滚动', () => {
    expect(modal).toMatch(
      /\.weekly-report-modal\.is-mobile-fullscreen \.weekly-report-content\s*\{[\s\S]*?overflow-y:\s*auto\s*!important/,
    );
    expect(modal).toContain('touch-action: pan-y');
  });

  it('右栏跳转先关闭弹框，挑战与资源复用统一路由', () => {
    expect(modal).toContain('closeCurrentMobileOverlayThen');
    expect(insights).toContain('resolveWeeklyChallengeRoute(challenge.metric, isMobile.value)');
    expect(insights).toContain('resolveResourceRoute(');
    expect(insights).toContain('claimWeekly(challenge.key)');
  });

  it('关键状态不依赖移动端会被回退的混色底', () => {
    expect(insights).not.toContain('color-mix');
    expect(poster).not.toContain('color-mix');
  });

  it('组件用到的周报文案在中英文都存在', () => {
    const keys = new Set<string>();
    for (const source of [modal, poster, insights]) {
      for (const match of source.matchAll(/growth\.(wr[A-Z]\w*)/g)) keys.add(match[1]);
      for (const match of source.matchAll(/'(wr[A-Z]\w*)'/g)) keys.add(match[1]);
    }
    for (const match of poster.matchAll(/title: '(wrMilestone\w+)'/g)) keys.add(`${match[1]}Desc`);
    expect(keys.size).toBeGreaterThan(60);
    for (const key of keys) {
      expect(zhSource, key).toContain(`    ${key}:`);
      expect(enSource, key).toContain(`    ${key}:`);
    }
  });
});
