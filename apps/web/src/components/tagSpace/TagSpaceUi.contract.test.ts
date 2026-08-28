// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relativePath: string) {
  return readFileSync(resolve(process.cwd(), 'src', relativePath), 'utf8');
}

describe('统一标签模块交互契约', () => {
  it('详情内容由专用跨类型时间线接口加载，并支持两种明确排序', () => {
    const source = read('view/tagDetail/TagDetail.vue');
    expect(source).toContain('fetchTagSpaceResources');
    expect(source).not.toContain('fetchGlobalSearch');
    expect(source).toContain("{ value: 'updated', label: t('tagSpace.sortByUpdated') }");
    expect(source).toContain("{ value: 'added', label: t('tagSpace.sortByAdded') }");
    expect(source).toContain('watch([activeType, resourceSort, resourceKeyword]');
  });

  it('资源数量只用于展示，筛选值始终使用稳定的资源类型', () => {
    const source = read('view/tagDetail/TagDetail.vue');
    expect(source).toContain('...overviewMetrics.value.map((metric) => ({');
    expect(source).toContain('value: metric.key');
    expect(source).toContain('count: metric.value');
  });

  it('移动端不显示局部搜索，只保留共享顶栏的全局搜索', () => {
    const detail = read('view/tagDetail/TagDetail.vue');
    expect(detail).toMatch(/<BInput\s+v-if="!bookmark\.isMobile"/u);
    expect(detail).toContain('html.light-note-mobile-rendering');
  });

  it('移动端以同一标签空间目录快速切换，不恢复第二套标签管理页', () => {
    const detail = read('view/tagDetail/TagDetail.vue');
    const drawer = read('components/tagSpace/MobileTagDirectoryDrawer.vue');
    const mobileTopBar = read('components/mobile/MobileTopBar.vue');
    const directoryRow = read('components/tagSpace/TagDirectoryRow.vue');
    const tagRoute = read('router/modules/tagDetail.ts');
    const mobileNavigation = read('config/mobileNavigation.ts');
    expect(detail).toContain('<MobileTagDirectoryDrawer');
    expect(detail).toContain('@click="openMobileTagDirectory"');
    expect(detail).toContain(':loading="sidebarLoading"');
    expect(detail).toContain(':error="sidebarError"');
    expect(detail).toContain("useMobileTopBar(['tagDetail']");
    expect(detail).toContain("addLabel: () => t('tagSpace.createTag')");
    expect(detail).toContain('showAdd: () => !isReadOnly.value');
    expect(detail).toContain('class="mobile-tag-edit"');
    expect(detail).toContain('@click="editTag()"');
    expect(mobileTopBar).toContain('v-if="activeBinding?.onAdd && showAdd"');
    expect(drawer).toContain('<BDrawer');
    expect(drawer).not.toContain('<template #header-actions>');
    expect(drawer).not.toContain('mobile-full-screen');
    expect(drawer).toContain('show-handle');
    expect(drawer).toContain('height="min(78dvh, 680px)"');
    expect(drawer).toContain('<BInput');
    expect(drawer).toContain('v-auto-scrollbar');
    expect(drawer).toContain("t('tagSpace.openSpaceBreakdownAria'");
    expect(drawer).toContain('tagItem.counts.bookmark');
    expect(drawer).toContain('tagItem.counts.note');
    expect(drawer).toContain('tagItem.counts.file');
    expect(drawer).toContain("t('tagSpace.switcherNoMatchDesc')");
    expect(drawer).toContain('matches.findIndex');
    expect(drawer).toContain('activeTagId.value');
    expect(drawer).toContain('closeCurrentMobileOverlayThen');
    expect(drawer).toContain('tagItem.iconUrl || icon.resource.tag');
    expect(directoryRow).toContain(':disabled="disabled"');
    expect(tagRoute).toContain("mobileShell: 'resources'");
    expect(tagRoute).toContain('mobileTopSwitcher: true');
    expect(tagRoute).toContain('mobileBottomNav: true');
    expect(mobileNavigation).toContain("routeNames: ['tagMg', 'tagDetail']");
  });

  it('标签总览入口直接进入最近标签空间，不再渲染第二套卡片总览', () => {
    const detail = read('view/tagDetail/TagDetail.vue');
    const entry = read('components/tagSpace/TagSpaceEntry.vue');
    const routes = read('router/modules/manage.ts');
    const navigation = read('utils/tagSpaceNavigation.ts');
    const settings = read('view/settings/Settings.vue');
    expect(detail).toMatch(/<BButton\s+v-if="!isReadOnly"[\s\S]*?@click="editTag\(\)"/u);
    expect(detail).toContain("blockGuestWrite('edit-tag')");
    expect(entry).toContain('resolveTagSpaceEntryId');
    expect(entry).toContain('router.replace(`/tag/${entryId}`)');
    expect(entry).not.toContain('<ResourcePageShell');
    expect(entry).not.toContain('TagSpaceIndex');
    expect(existsSync(resolve(process.cwd(), 'src/view/manage/TagMg.vue'))).toBe(false);
    expect(routes).toContain("import('@/components/tagSpace/TagSpaceEntry.vue')");
    expect(routes).not.toContain('view/manage/TagMg.vue');
    expect(routes).toContain('beforeEnter: async (to) =>');
    expect(routes).toContain('await resolveTagSpaceEntryId()');
    expect(navigation).toContain('await fetchTagSpace(rememberedId, 1)');
    expect(navigation).toContain("fetchTagSpaces({ sort: 'recent', includeEmpty: true, page: 1, pageSize: 1 })");
    expect(settings).not.toContain('tagManageView');
  });

  it('首屏骨架与最终三栏工作区同构，目录、主题内容和说明区不会突然跳位', () => {
    const detail = read('view/tagDetail/TagDetail.vue');
    expect(detail).toContain('class="tag-space-workspace tag-space-workspace--skeleton"');
    expect(detail).toContain('class="tag-directory-rail tag-directory-rail--skeleton"');
    expect(detail).toContain('class="skeleton-profile-card"');
    expect(detail).toContain('class="skeleton-resources-panel"');
    expect(detail).toContain('class="tag-insight-rail tag-insight-rail--skeleton"');
    expect(detail).toMatch(/@media \(max-width: 1260px\)[\s\S]*?\.tag-directory-rail\s*\{[\s\S]*?display:\s*none/u);
    expect(detail).toMatch(/@media \(max-width: 980px\)[\s\S]*?\.tag-insight-rail\s*\{[\s\S]*?display:\s*none/u);
    expect(detail).toMatch(
      /@media \(max-width: 767px\)[\s\S]*?\.skeleton-profile-card\s*\{[\s\S]*?grid-template-columns:\s*1fr/u,
    );
  });

  it('标签模块复用标准页头，操作集中到右侧且不在目录与主题卡片重复出现', () => {
    const detail = read('view/tagDetail/TagDetail.vue');
    expect(detail).toContain(':title="t(\'tagSpace.title\')"');
    expect(detail).toContain(':subtitle="t(\'tagSpace.subtitle\')"');
    expect(detail).toContain('compact-mobile-heading');
    expect(detail).toContain(':show-header="!bookmark.isMobile"');
    expect(detail).toContain('<template #actions>');
    expect(detail).not.toContain('class="tag-profile-actions"');
    expect(detail).not.toContain('class="rail-add"');
  });

  it('左侧目录分页读取全部标签，详情资源默认完整进入触底自动续页', () => {
    const detail = read('view/tagDetail/TagDetail.vue');
    expect(detail).toContain('while (hasMore)');
    expect(detail).toContain('collected.size === previousSize');
    expect(detail).toContain('pageSize: 50');
    expect(detail).toContain('new IntersectionObserver');
    expect(detail).toContain('ref="resourceSentinelRef"');
    expect(detail).toContain("type: 'all'");
    expect(detail).toContain('pageSize: 20');
    expect(detail).not.toMatch(/@click="loadMore"/u);
    expect(detail).not.toContain('showGroupedOverview');
    expect(detail).not.toContain('loadGroupedPreviews');
    expect(detail).not.toContain("t('tagSpace.viewAllType'");
    expect(detail).toContain('related-topic-grid');
  });

  it('桌面端复用共享页头基线，页面本身不滚动且目录与资源列表各自滚动', () => {
    const detail = read('view/tagDetail/TagDetail.vue');
    expect(detail).not.toMatch(/\.tag-space-shell\s*\{[\s\S]*?padding-top:/u);
    expect(detail).toMatch(/\.tag-space-detail\s*\{[\s\S]*?overflow:\s*hidden/u);
    expect(detail).toMatch(
      /\.tag-space-workspace\s*\{[\s\S]*?height:\s*100%[\s\S]*?min-height:\s*0[\s\S]*?align-items:\s*stretch/u,
    );
    expect(detail).toMatch(/\.tag-directory-rail\s*\{[\s\S]*?height:\s*100%/u);
    expect(detail).not.toContain('height: calc(100vh - 126px)');
    expect(detail).toMatch(/\.rail-section--directory\s*\{[\s\S]*?overflow:\s*auto/u);
    expect(detail).toContain('ref="resourceScrollRef"');
    expect(detail).toMatch(/\.resource-scroll-region\s*\{[\s\S]*?overflow:\s*auto/u);
    expect(detail).toContain('const container = resourceScrollRef.value');
  });

  it('目录切换保留当前空间直至新数据原子替换，避免整页骨架闪烁', () => {
    const detail = read('view/tagDetail/TagDetail.vue');
    expect(detail).toContain('const preserveContent = Boolean(tag.value)');
    expect(detail).toContain('detailLoading.value = !preserveContent');
    expect(detail).toContain('detailRefreshing.value = preserveContent');
    expect(detail).toContain("switchingTagId.value = preserveContent && previousTagId !== tagId ? tagId : ''");
    expect(detail).toContain('Promise.allSettled([');
    expect(detail).toContain('fetchTagSpaceResources({\n          id: tagId');
    expect(detail).toContain('if (sequence !== detailSequence) return');
    expect(detail).toContain(':aria-busy="detailRefreshing"');
    expect(detail).toContain('switchingTagId ?');
    expect(detail).toContain('displayedTagId === String(sidebarTag.id)');
    expect(detail).toContain('const tags = new Map(sidebarTags.value.map');
    expect(detail).toContain('if (!sidebarTags.value.length) void loadSidebarTags()');
  });

  it('标签详情呈现独立知识空间，而不是复刻标签管理卡片', () => {
    const detail = read('view/tagDetail/TagDetail.vue');
    const resourceRow = read('components/tagSpace/TagSpaceResourceRow.vue');
    expect(detail).toContain('class="tag-space-workspace"');
    expect(detail).toContain('class="tag-directory-rail"');
    expect(detail).toContain('class="tag-profile-card"');
    expect(detail).toContain('class="tag-insight-rail"');
    expect(detail).toContain("value: 'related'");
    expect(detail).toContain('<TagSpaceResourceRow');
    expect(detail).toContain('v-for="group in resourceGroups"');
    expect(detail).toContain("t('tagSpace.resourceSectionTitle'");
    expect(resourceRow).toContain('class="tag-space-resource-row"');
    expect(resourceRow).toContain('resource-row-tags');
  });

  it('标签档案使用中性图标底板，说明卡与主档案对齐且不再重复展示使用建议', () => {
    const detail = read('view/tagDetail/TagDetail.vue');
    expect(detail).toContain("'has-custom-icon': tag.iconUrl && !tagIconLoadError");
    expect(detail).toMatch(/\.tag-profile-icon\s*\{[\s\S]*?background:\s*var\(--workspace-panel-bg-color\)/u);
    expect(detail).toContain('class="insight-card insight-card--description"');
    expect(detail).toContain('--tag-profile-height: 120px');
    expect(detail).toContain('--tag-workspace-heading-offset: 0px');
    expect(detail).toMatch(/\.tag-insight-rail\s*\{[\s\S]*?padding-top:\s*var\(--tag-workspace-heading-offset\)/u);
    expect(detail).toMatch(/\.insight-card--description\s*\{[\s\S]*?min-height:\s*var\(--tag-profile-height\)/u);
    expect(detail).not.toContain("t('tagSpace.usageTipsTitle')");
    expect(detail).not.toContain('class="usage-tips"');
    expect(detail).toContain('class="mobile-tag-edit"');
    expect(detail.match(/@click="editTag\(\)"/gu) || []).toHaveLength(2);
    expect(detail).toContain("tag.value?.description || ''");
  });

  it('目录与主区去掉重复标题，当前标签直接留在稳定目录中', () => {
    const detail = read('view/tagDetail/TagDetail.vue');
    expect(detail).not.toContain("t('tagSpace.currentTopic')");
    expect(detail).not.toContain("t('tagSpace.workspaceTitle')");
    expect(detail).not.toContain('class="rail-heading"');
    expect(detail).toContain('class="rail-overview"');
    expect(detail).toContain('if (tag.value && !tags.has(displayedTagId.value))');
  });

  it('标签目录支持悬停与右键操作，标签元信息通过弹框编辑', () => {
    const detail = read('view/tagDetail/TagDetail.vue');
    const dialog = read('components/manage/tagEditMg/TagEditorDialog.vue');
    const form = read('components/manage/tagEditMg/TagEditorForm.vue');
    const directoryRow = read('components/tagSpace/TagDirectoryRow.vue');
    expect(detail).toContain("const tagMenuTriggers: BActionMenuTrigger[] = ['hover', 'contextmenu']");
    expect(detail).toContain('<BActionMenu');
    expect(detail).toContain('<TagDirectoryRow');
    expect(directoryRow).toContain('<BButton');
    expect(directoryRow).toContain('icon.resource.tag');
    expect(detail).toContain('handleDirectoryTagAction');
    expect(detail).toContain('<TagEditorDialog');
    expect(detail).not.toContain('router.push(`/manage/editTag/${tag.value.id}`)');
    expect(dialog).toContain('<BModal');
    expect(dialog).toContain('fullscreen-mobile');
    expect(dialog).toContain('@update:visible="handleModalVisibleUpdate"');
    expect(dialog).toContain('if (!nextVisible && visible.value) requestCancel()');
    expect(form).toContain("$t('tagManage.tagDescription')");
    expect(form).toContain('v-model:value="tag.description"');
    expect(dialog).toContain(':can-delete="handleType === \'edit\'"');
    expect(form).toContain("$t('tagManage.deleteTag')");
    expect(form).toContain('@click="emit(\'delete\')"');
  });

  it('标签编辑器通过专用轻量读模型初始化，不再串联四个业务列表接口', () => {
    const editor = read('composables/useTagEditor.ts');
    expect(editor).toContain("'/api/bookmark/getTagEditorData'");
    expect(editor).not.toContain("'/api/bookmark/queryTagList'");
    expect(editor).not.toContain("'/api/bookmark/getBookmarkList'");
    expect(editor).not.toContain("'/api/note/queryNoteList'");
    expect(editor).not.toContain("'/api/file/queryFiles'");
  });

  it('标签分析打开后自动执行，隐藏来源角标并允许把同一结果保存为笔记', () => {
    const detail = read('view/tagDetail/TagDetail.vue');
    expect(detail).toContain(':show-prompt="false"');
    expect(detail).toContain(':show-grounding="false"');
    expect(detail).toContain("tagAiResourceRefs.length ? 'summarize' : ''");
    expect(detail).toContain('#result-actions');
    expect(detail).toContain('persistAiMarkdownResultAsNote');
    expect(detail).toContain("t('aiSkills.saveAsNote')");
  });

  it('旧标签编辑深链兼容重定向到标签空间弹框', () => {
    const routes = read('router/modules/manage.ts');
    expect(routes).toContain("String(to.params.id) === 'add'");
    expect(routes).toContain("{ name: 'tagMg', query: { create: '1' } }");
    expect(routes).toContain("{ name: 'tagDetail', params: { id: to.params.id }, query: { edit: '1' } }");
  });

  it('表单、下拉与气泡均复用 B 系列组件', () => {
    const source = `${read('view/tagDetail/TagDetail.vue')}\n${read('components/manage/tagEditMg/TagEditorForm.vue')}`;
    expect(source).not.toMatch(/<(input|select)\b/iu);
    expect(source).toContain('<BInput');
    expect(source).toContain('<BSelect');
    expect(source).toContain('<BActionMenu');
  });
});
