import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/view/organize/OrganizeCenter.vue'), 'utf8');
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
    expect(source).toContain('summary.value.totals.affectedResourceTotal');
    expect(source).toContain('summary.value.totals.hasMore');
  });

  it('交互控件全部复用 B 组件，静态图标从 icon 配置读取', () => {
    expect(source).toContain("import BInput from '@/components/base/BasicComponents/BInput.vue'");
    expect(source).toContain("import BSelect from '@/components/base/BasicComponents/BSelect.vue'");
    expect(source).toContain("import BModal from '@/components/base/BasicComponents/BModal/BModal.vue'");
    expect(source).toContain("import icon from '@/config/icon'");
    expect(source).not.toMatch(/<(input|select|table)\b/);
    expect(source).not.toMatch(/<svg\b|<path\b/);
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
    expect(source).toContain('html.light-note-mobile-rendering .organize-overview-card');
    expect(source).toMatch(/\.organize-nav-item\.active\s*\{[\s\S]*?border-left:\s*4px solid/);
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
});
