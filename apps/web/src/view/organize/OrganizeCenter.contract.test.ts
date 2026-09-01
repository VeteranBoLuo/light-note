import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/view/organize/OrganizeCenter.vue'), 'utf8');
const dashboardSource = readFileSync(resolve(process.cwd(), 'src/view/organize/OrganizeOverviewDashboard.vue'), 'utf8');
const donutSource = readFileSync(resolve(process.cwd(), 'src/view/organize/OrganizeDonutChart.vue'), 'utf8');
const desktopNavStyle = source.slice(
  source.indexOf('  .organize-nav-item.b_btn {'),
  source.indexOf('  .organize-nav-item > span:nth-child(2)'),
);
const mobileNavStyle = source.slice(
  source.indexOf('    .organize-mobile-nav {', source.indexOf('@media (max-width: 767px)')),
  source.indexOf('    .organize-mobile-nav::-webkit-scrollbar', source.indexOf('@media (max-width: 767px)')),
);

describe('整理中心 2.0 页面契约', () => {
  it('待整理与三类治理问题属于同一中心，但概览中保持两套统计语义', () => {
    expect(source).toContain("type OrganizeView = 'overview' | 'pending' | OrganizeIssueType");
    expect(source).toContain("activeView === 'pending'");
    expect(source).toContain('<Inbox embedded />');
    expect(source).toContain('summary.value?.pendingShortcut.count');
    expect(dashboardSource).toContain('props.summary?.pendingShortcut.count');
    expect(dashboardSource).toContain('props.summary?.issues.untagged.affectedResourceCount');
    expect(dashboardSource).toContain('props.summary?.issues.duplicateBookmark.affectedResourceCount');
  });

  it('交互控件全部复用 B 组件，静态图标从 icon 配置读取', () => {
    expect(source).toContain("import BInput from '@/components/base/BasicComponents/BInput.vue'");
    expect(source).toContain("import BSelect from '@/components/base/BasicComponents/BSelect.vue'");
    expect(dashboardSource).toContain("import BCard from '@/components/base/BasicComponents/BCard.vue'");
    expect(dashboardSource).toContain("import BTable from '@/components/base/BasicComponents/BTable/BTable.vue'");
    expect(source).toContain("import BModal from '@/components/base/BasicComponents/BModal/BModal.vue'");
    expect(dashboardSource).toContain("import BProgress from '@/components/base/BasicComponents/BProgress.vue'");
    expect(source).toContain("import icon from '@/config/icon'");
    expect(`${source}\n${dashboardSource}`).not.toMatch(/<(input|select|table)\b/);
    expect(`${source}\n${dashboardSource}`).not.toMatch(/<svg\b|<path\b/);
    expect(donutSource).toContain('aria-hidden="true"');
  });

  it('移动端内部导航横向滚动，不把五个入口压成等宽网格', () => {
    expect(source).toContain('class="organize-mobile-nav"');
    expect(source).toContain(":is=\"bookmark.isMobile ? 'div' : 'main'\"");
    expect(mobileNavStyle).toMatch(/overflow-x:\s*auto/);
    expect(source).toMatch(/\.organize-mobile-nav__item[\s\S]*?flex:\s*0 0 auto/);
    expect(mobileNavStyle).not.toContain('grid-template-columns');
  });

  it('页面使用共享主题 Token 和移动渲染基线，选中态包含实色边界', () => {
    expect(source).toContain('var(--card-background)');
    expect(source).toContain('var(--text-color)');
    expect(source).toContain('html.light-note-mobile-rendering .organize-nav-item.active');
    expect(dashboardSource).toContain('html.light-note-mobile-rendering .organize-dashboard-card');
    expect(source).toMatch(/\.organize-nav-item\.b_btn\s*\{[\s\S]*?border-left:\s*4px solid transparent/);
    expect(source).toMatch(/\.organize-nav-item\.active\s*\{[\s\S]*?border-left-color:\s*var\(--primary-color\)/);
    expect(source).toMatch(/\.organize-mobile-nav__item\.active\s*\{[\s\S]*?border:\s*2px solid/);
  });

  it('桌面菜单切换只过渡颜色，选中前后不改变边框宽度或内边距', () => {
    expect(source).toMatch(
      /\.organize-nav-item\.b_btn\s*\{[\s\S]*?padding:\s*0 10px 0 7px;[\s\S]*?transition:\s*color[\s\S]*?background-color[\s\S]*?border-color/,
    );
    expect(desktopNavStyle).not.toContain('transition: all');
    expect(source).not.toMatch(/\.organize-nav-item\.active\s*\{[^}]*padding-left/);
  });

  it('总览使用真实摘要、图表与有界预览，不伪造统一进度或健康评分', () => {
    expect(source).toContain('<OrganizeOverviewDashboard');
    expect(dashboardSource).toContain('class="organize-dashboard__grid"');
    expect(dashboardSource).toContain('<OrganizeDonutChart');
    expect(dashboardSource).toContain('props.summary?.pendingShortcut.typeTotals');
    expect(dashboardSource).toContain('props.summary?.issues.bookmarkHealth.coverage');
    expect(dashboardSource).toContain('props.summary?.issues.duplicateBookmark.affectedResourceCount');
    expect(dashboardSource).toContain('pendingPreview.value?.items?.slice(0, 5)');
    expect(dashboardSource).toContain('untaggedPreview.value?.items?.slice(0, 3)');
    expect(dashboardSource).not.toMatch(/healthScore|longUnused|completionRate/);
    expect(dashboardSource).not.toContain("t('organize.refresh')");
  });

  it('移动导航预留与选中态相同的边框宽度，切换时文字不会内缩', () => {
    expect(source).toMatch(/\.organize-mobile-nav__item\s*\{[\s\S]*?border:\s*2px solid transparent/);
    expect(source).toMatch(/\.organize-mobile-nav__item\.active\s*\{[\s\S]*?border:\s*2px solid/);
  });

  it('重复项弹窗关闭后把焦点还给触发点或主内容区', () => {
    expect(source).toContain('duplicateReturnFocus');
    expect(source).toContain('organizeMainRef.value?.focus');
    expect(source).toContain('tabindex="-1"');
  });

  it('重复项合并在同一份操作载荷重试时复用幂等请求号', () => {
    expect(source).toContain('pendingDuplicateResolveRequest');
    expect(source).toContain('pendingDuplicateResolveRequest.value?.payloadKey !== payloadKey');
    expect(source).toContain('clientRequestId: pendingDuplicateResolveRequest.value.requestId');
    expect(source).not.toContain('clientRequestId: generateUUID()');
    expect(source).toContain('duplicateTagMergeBlocked');
    expect(source).toContain('selectedKeeperCanSubmit');
  });

  it('疑似失效一次提交全部书签，并轮询持久任务而不暴露内部批次', () => {
    expect(source).toContain('startBookmarkHealthScan');
    expect(source).toContain('<BProgress');
    expect(source).toContain('healthScan.value?.processed');
    expect(source).toContain('scheduleHealthPolling');
    expect(source).toContain('visibilitychange');
    expect(source).toContain("t('organize.health.canLeave')");
    expect(source).not.toContain('checkBookmarkHealthBatch');
    expect(source).not.toContain('checkBatch');
    expect(source).not.toMatch(/检测下一批|25\s*条/);
  });
});
