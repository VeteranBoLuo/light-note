import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/view/search/SearchCenter.vue'), 'utf8');
const searchMetaSource = readFileSync(resolve(process.cwd(), 'src/components/searchCenter/searchMeta.ts'), 'utf8');
const inspectorSource = readFileSync(
  resolve(process.cwd(), 'src/components/searchCenter/ResourceInspectorPanel.vue'),
  'utf8',
);
const tagMatchSource = readFileSync(resolve(process.cwd(), 'src/components/searchCenter/TagMatchStrip.vue'), 'utf8');
const tagFilterSource = readFileSync(
  resolve(process.cwd(), 'src/components/searchCenter/ResourceTagFilterPopover.vue'),
  'utf8',
);

describe('资源中心 2.0 工作区边界', () => {
  it('只把书签、笔记和文件作为可检索资源，标签不再混进资源结果', () => {
    expect(searchMetaSource).toContain(
      'SEARCH_CENTER_TYPE_LIST: TaggableResourceType[] = [...TAGGABLE_RESOURCE_TYPES]',
    );
    expect(source).toMatch(/normalizeSearchResultItems[\s\S]*?SEARCH_CENTER_TYPE_LIST\.includes\(item\.type\)/);
    expect(source).toContain('separateTagMatches: true');
    expect(source).toContain('标签是筛选条件与空间导航，不进入资源勾选、批量处理或右侧检查器');
    expect(source).not.toMatch(/RESOURCE_INSPECTOR_ICONS[\s\S]{0,220}?tag:/);
  });

  it('标签筛选位于桌面左栏，移动端复用同一查询状态并收进筛选抽屉', () => {
    expect(source).toContain('class="resource-scope-section resource-scope-section--tags"');
    expect(source).toContain('class="resource-scope-tag-filter"');
    expect(source).toContain('<ResourceTagFilterPopover');
    expect(source).toContain(':selected="queryState.tags"');
    expect(source).toContain('@toggle="toggleTagFilter"');
    expect(source).toContain('@clear="clearTagFilters"');
    expect(tagFilterSource).toContain('<BPopover');
    expect(tagFilterSource).toContain('<BInput');
    expect(tagFilterSource).toContain(':aria-selected="selected.includes(tag)"');
    expect(tagFilterSource).toMatch(/resource-tag-picker\s*\{[\s\S]*?height:\s*min\(390px/);
    expect(source).toContain('const options = [');
    expect(source).toContain('...new Set(viewState.tagOptions.length');
    expect(source).toMatch(/return \[\.\.\.options, \.\.\.queryState\.tags\.filter/);
    expect(source).toContain("{ tags: queryState.tags.join(',') }");
    expect(source).not.toContain("queryState.tags.map((tag) => encodeURIComponent(tag)).join(',')");
    expect(source).toContain('class="mobile-filter-tags"');
    expect(source).toMatch(/const mobileActiveFilterCount = computed\([\s\S]*?queryState\.tags\.length/);
    expect(source).toMatch(/fetchGlobalSearch\([\s\S]*?tags:\s*queryState\.tags/);
  });

  it('关键词匹配的标签以独立导航条展示真实图标和三类资源数量', () => {
    expect(source).toMatch(
      /<TagMatchStrip[\s\S]*?:items="viewState\.tagMatches"[\s\S]*?@open="openTagMatch"[\s\S]*?\/>/,
    );
    expect(source).toMatch(/function openTagMatch[\s\S]*?router\.push\(item\.route/);
    expect(tagMatchSource).toContain(':src="item.iconUrl || icon.resource.tag"');
    expect(tagMatchSource).toContain('item.counts.bookmark');
    expect(tagMatchSource).toContain('item.counts.note');
    expect(tagMatchSource).toContain('item.counts.file');
    expect(tagMatchSource).toMatch(/\.tag-match-strip__list\s*\{[\s\S]*?display:\s*flex/);
    expect(tagMatchSource).toMatch(/\.tag-match-strip__list\s*\{[\s\S]*?overflow-x:\s*auto/);
    expect(tagMatchSource).toMatch(/\.tag-match-card\s*\{[\s\S]*?scroll-snap-align:\s*start/);
  });

  it('无关键词按最近更新浏览，输入关键词后默认按相关度搜索', () => {
    expect(source).toContain("sort: 'updated'");
    expect(source).toMatch(
      /function defaultSortForKeyword\(keyword: string\): ResourceSort \{[\s\S]*?keyword\.trim\(\) \? 'relevance' : 'updated'/,
    );
    expect(source).toMatch(/buildQueryPayload[\s\S]*?queryState\.sort !== defaultSortForKeyword\(q\)/);
    expect(source).toMatch(/queryState\.keyword\.trim\(\) \? res\.tagMatches \|\| \[\] : \[\]/);
    expect(source).toContain("t('resourceCenter.recentContent')");
  });

  it('桌面保留资源范围、结果和检查器三栏，只有左右栏与列表区独立滚动', () => {
    expect(source).toContain('class="resource-scope-pane"');
    expect(source).toContain('class="result-panel"');
    expect(source).toContain('class="resource-inspector-pane"');
    expect(source).toMatch(
      /@media \(min-width: 768px\)[\s\S]*?\.search-layout\s*\{[\s\S]*?grid-template-columns:\s*clamp\(220px, 14vw, 280px\) minmax\(0, 1fr\) clamp\(350px, 20vw, 410px\)/,
    );
    expect(source).toMatch(/\.resource-scope-pane\s*\{[\s\S]*?overflow:\s*hidden auto/);
    expect(source).toMatch(/@media \(min-width: 768px\)[\s\S]*?\.search-page\s*\{[\s\S]*?overflow:\s*hidden/);
    expect(source).toMatch(/\.result-scroll-area\s*\{[\s\S]*?overflow:\s*hidden auto/);
  });

  it('桌面与移动端复用同一个资源检查器，移动端先打开底部抽屉再执行操作', () => {
    expect(source.match(/<ResourceInspectorPanel/g)).toHaveLength(2);
    expect(source).toContain(':open="mobileInspectorVisible"');
    expect(source).toContain('placement="bottom"');
    expect(source).toContain('presentation="drawer"');
    expect(source).toMatch(
      /function handleResultOpen[\s\S]*?bookmark\.isMobile[\s\S]*?inspectResource\(item\)[\s\S]*?mobileInspectorVisible\.value = true/,
    );
    expect(source).toContain("import { closeCurrentMobileOverlayThen } from '@/utils/mobileOverlayHistory'");
    expect(source).toMatch(
      /function closeMobileInspectorThen[\s\S]*?closeCurrentMobileOverlayThen[\s\S]*?mobileInspectorVisible\.value = false/,
    );
    expect(source).toMatch(
      /function openInspectedMobileResource[\s\S]*?snapshotDisplaySearchItem\(item\)[\s\S]*?closeMobileInspectorThen\([\s\S]*?openItem\(snapshot\)/,
    );
    expect(source).toMatch(
      /function openInspectedMobileAi[\s\S]*?snapshotDisplaySearchItem\(item\)[\s\S]*?closeMobileInspectorThen\([\s\S]*?openResourceAi\(snapshot\)/,
    );
    expect(inspectorSource).toContain("emit('open', resource)");
    expect(inspectorSource).toContain("emit('analyze', resource)");
    expect(inspectorSource).toContain("emit('inbox', resource)");
    expect(inspectorSource).toContain("emit('delete', resource)");
  });

  it('检查器提供资源级动作，标签管理只跳转到单资源标签工作页', () => {
    expect(inspectorSource).toContain('<BActionMenu');
    expect(inspectorSource).toContain('icon.manage_categoryBtn_tag');
    expect(inspectorSource).toContain('icon.noteTree.openPage');
    expect(inspectorSource).toContain('icon.ai.organize');
    expect(inspectorSource).toContain('icon.contextMenu.inbox');
    expect(inspectorSource).toContain('icon.table_delete');
    expect(source).toMatch(
      /function openSingleTagWorkspace[\s\S]*?mode: 'explicit'[\s\S]*?selectedCount: 1[\s\S]*?closeMobileInspectorThen\([\s\S]*?path: '\/search\/batch-tags'/,
    );
    expect(source).not.toMatch(/getSingleDeleteApi[\s\S]{0,180}?tag/);
    expect(inspectorSource).toContain('class="resource-inspector-tags__label"');
    expect(inspectorSource).toContain('max-width="min(100%, 180px)"');
    expect(inspectorSource).not.toContain('.resource-inspector-tags > span');
  });

  it('结果始终保留资源类型分组，并通过观察器滚动加载', () => {
    expect(source).toContain('v-for="group in visibleGroups"');
    expect(source).toContain('class="group-header"');
    expect(source).toContain('ref="resultLoadSentinel"');
    expect(source).toMatch(/new IntersectionObserver\([\s\S]*?loadMoreResults\(\)/);
    expect(source).toMatch(/function loadMoreResults\(\)[\s\S]*?loadData\(false, 0, true\)/);
  });

  it('加载、错误、空状态都有独立反馈，空状态不再引导去标签管理', () => {
    expect(source).toContain('v-if="shouldShowLoadingSkeleton"');
    expect(source).toContain('v-else-if="viewState.error"');
    expect(source).toContain('class="empty-state"');
    expect(source).not.toContain("message.error(t('resourceCenter.refreshFailed'))");
    expect(source).toContain("t('resourceCenter.emptyActionBookmark')");
    expect(source).toContain("t('resourceCenter.emptyActionNote')");
    expect(source).toContain("t('resourceCenter.emptyActionFile')");
    expect(source).not.toContain("t('resourceCenter.emptyActionTag')");
  });
});
