import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/view/search/SearchCenter.vue'), 'utf8');

describe('资源中心工作区布局', () => {
  it('桌面端由资源范围、结果区与检查器组成三栏，中等宽度仍保留检查器', () => {
    expect(source).toContain('class="resource-scope-pane"');
    expect(source).toContain('class="result-panel"');
    expect(source).toContain('class="resource-inspector-pane"');
    expect(source).toMatch(
      /\.search-layout\s*\{[\s\S]*?grid-template-columns:\s*clamp\(220px, 14vw, 280px\) minmax\(0, 1fr\) clamp\(350px, 20vw, 410px\)/,
    );
    expect(source).toMatch(
      /@media \(min-width: 768px\) and \(max-width: 1380px\)[\s\S]*?grid-template-columns:\s*minmax\(176px, 200px\) minmax\(0, 1fr\) minmax\(270px, 300px\)/,
    );
    expect(source).toMatch(
      /@media \(min-width: 768px\) and \(max-width: 980px\)[\s\S]*?grid-template-columns:\s*minmax\(96px, 120px\) minmax\(240px, 1fr\) minmax\(210px, 28vw\)/,
    );
    expect(source).not.toMatch(/\.resource-inspector-pane\s*\{[\s\S]{0,120}?display:\s*none/);
  });

  it('标签筛选仍复用现有查询状态，并在移动端计入筛选角标与抽屉', () => {
    expect(source).toContain("t('resourceCenter.tagFilterAnyHint')");
    expect(source).toContain(':selected="queryState.tags.includes(tag)"');
    expect(source).toContain('@click="toggleTagFilter(tag)"');
    expect(source).toMatch(/const mobileActiveFilterCount = computed\([\s\S]*?queryState\.tags\.length/);
    expect(source).toContain('class="mobile-filter-tags"');
    expect(source).toMatch(/fetchGlobalSearch\([\s\S]*?tags:\s*queryState\.tags/);
  });

  it('搜索和视图工具位于中栏首行，右侧操作采用原型的主次两行层级', () => {
    const layoutStart = source.indexOf('<section class="search-layout">');
    const headerStart = source.indexOf('class="search-header"', layoutStart);
    const resultStart = source.indexOf('class="result-panel"', layoutStart);
    const desktopControlsStart = source.indexOf('class="desktop-result-controls"', headerStart);
    const desktopControlsEnd = source.indexOf('</div>', desktopControlsStart);
    const desktopControlsSource = source.slice(desktopControlsStart, desktopControlsEnd);
    const toolbarActionsStart = source.indexOf('<div v-else class="toolbar-actions">', resultStart);
    const toolbarActionsEnd = source.indexOf('</div>', toolbarActionsStart);
    const toolbarActionsSource = source.slice(toolbarActionsStart, toolbarActionsEnd);
    expect(headerStart).toBeGreaterThan(layoutStart);
    expect(resultStart).toBeGreaterThan(headerStart);
    expect(desktopControlsSource).not.toContain('select-visible-btn');
    expect(toolbarActionsSource).toContain('select-visible-btn');
    expect(source).toMatch(/\.search-header\s*\{[\s\S]*?grid-column:\s*2;[\s\S]*?grid-row:\s*1;/);
    expect(source).toMatch(
      /\.resource-inspector-actions\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/,
    );
    expect(source).toMatch(/\.resource-inspector-actions :deep\(\.b_btn\)[\s\S]*?width:\s*100%/);
    expect(source).toMatch(/\.resource-inspector-actions :deep\(\.b_btn:first-child\)[\s\S]*?grid-column:\s*1 \/ -1/);
    expect(source).toMatch(/<BButton block size="large" type="primary" @click="openItem\(inspectedResource\)">/);
  });

  it('详情检查器使用带资源语义图标的摘要卡，不再展示只有类型胶囊的大块占位区', () => {
    expect(source).toContain('class="resource-inspector-hero"');
    expect(source).toContain('<SvgIcon :src="inspectedResourceIcon" size="23" />');
    expect(source).toContain('const RESOURCE_INSPECTOR_ICONS');
    expect(source).toMatch(/bookmark:\s*icon\.resource\.bookmark/);
    expect(source).toMatch(/note:\s*icon\.resource\.note/);
    expect(source).toMatch(/file:\s*icon\.resource\.file/);
    expect(source).toMatch(/tag:\s*icon\.resource\.tag/);
    expect(source).not.toContain('class="resource-inspector-preview"');
  });

  it('桌面点击卡片更新检查器、默认选择首项，移动端仍直接打开资源', () => {
    expect(source).not.toContain('@mouseenter="inspectResource(item)"');
    expect(source).not.toContain('@focusin="inspectResource(item)"');
    expect(source).toContain('@open="handleResultOpen(item)"');
    expect(source).toMatch(/const inspectedResource = computed\([\s\S]*?allVisibleItems\.value\[0\]/);
    expect(source).toMatch(/function handleResultOpen[\s\S]*?bookmark\.isMobile[\s\S]*?openItem\(item\)/);
    expect(source).toMatch(/\.resource-result-entry\.is-inspected :deep\(\.result-item\)[\s\S]*?border-color/);
    expect(source).not.toMatch(/\.resource-result-entry\.is-inspected[\s\S]*?outline:/);
  });

  it('资源范围与资源状态可独立折叠，右键菜单可以直接打开资源', () => {
    expect(source).toContain('const scopeTypesExpanded = ref(true)');
    expect(source).toContain('const scopeStateExpanded = ref(true)');
    expect(source).toContain(':aria-expanded="scopeTypesExpanded"');
    expect(source).toContain(':aria-expanded="scopeStateExpanded"');
    expect(source).toContain(':src="icon.noteTree.chevron"');
    expect(source).toMatch(/function menuForSearchItem[\s\S]*?key:\s*'open'[\s\S]*?icon:\s*icon\.noteTree\.openPage/);
    expect(source).toMatch(/function handleItemMenu[\s\S]*?action === 'open'[\s\S]*?openItem\(item\)/);
  });

  it('桌面资源范围使用单选切换，移动端类型抽屉继续支持多选', () => {
    expect(source).toMatch(/function selectDesktopType[\s\S]*?queryState\.types = type === 'all' \? \[\] : \[type\]/);
    expect(source).toContain('function toggleTypeFilter(type: GlobalSearchType)');
  });
});
