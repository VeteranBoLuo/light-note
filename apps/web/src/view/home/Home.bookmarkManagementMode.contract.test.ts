// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relativePath: string) {
  return readFileSync(resolve(process.cwd(), 'src', relativePath), 'utf8');
}

describe('桌面书签浏览与管理合并契约', () => {
  const homeSource = read('view/home/Home.vue');
  const managementSource = read('components/manage/bookmarkMg/BookmarkTable.vue');
  const zhLocaleSource = read('i18n/locales/zh-CN.ts');

  it('只在真正桌面预挂载管理界面，mode=manage 仅切换显隐，手机和平板保留独立页面', () => {
    expect(homeSource).toContain("String(route.query.mode || '') === 'manage'");
    expect(homeSource).toContain('bookmark.isDesktop');
    expect(homeSource).toContain('<BookmarkTable');
    expect(homeSource).toContain('v-if="bookmark.isDesktop"');
    expect(homeSource).toContain('v-show="desktopManagementMode"');
    expect(homeSource).toContain('<ResourcePageShell\n      v-show="!desktopManagementMode"');
    expect(homeSource).not.toContain('v-if="desktopManagementMode"');
    expect(homeSource).toContain("router.push('/manage/bookmarkMg')");
  });

  it('两个预挂载视图的开关都由 mode=manage 路由状态控制，切换事件只修改这一份状态', () => {
    expect(homeSource).toContain(':management-mode="desktopManagementMode"');
    expect(homeSource).toContain('@management-mode-change="setDesktopManagementMode"');
    expect(homeSource).toContain(':checked="desktopManagementMode"');
    expect(homeSource).toContain('@change="setDesktopManagementMode"');
    expect(homeSource).toMatch(
      /function setDesktopManagementMode\(enabled: boolean\)[\s\S]*?enabled === desktopManagementMode\.value[\s\S]*?query\.mode = 'manage'[\s\S]*?delete query\.mode/u,
    );
    expect(homeSource).not.toContain(':checked="false"');
    expect(managementSource).toContain(':checked="managementMode"');
    expect(managementSource).toContain("emit('management-mode-change', $event)");
    expect(managementSource).not.toContain(':checked="true"');
  });

  it('管理分支复用首页分页结果，不在 /home 接入 pageSize -1 的全量读模型', () => {
    expect(homeSource).toContain(':external-bookmarks="bookmark.bookmarkList"');
    expect(homeSource).toContain(':external-has-more="bookmark.bookmarkHasMore"');
    expect(homeSource).toContain(':external-load-error="bookmarkLoadError"');
    expect(homeSource).toContain('@load-more="loadMoreBookmarks"');
    expect(homeSource).toContain('pageSize: RESOURCE_LIST_PAGE_SIZE');
    expect(homeSource).not.toContain('pageSize: -1');

    expect(managementSource).toContain('if (props.embedded) return props.reloadBookmarks?.(options) ?? true');
    expect(managementSource).toContain('props.embedded ? props.externalLoadError');
    expect(managementSource).toContain('if (props.embedded) return tableData.value');
    expect(managementSource).toContain('if (props.embedded) {\n      if (pending)');
  });

  it('桌面管理模式保留全局统计与管理操作，并使用显式翻页', () => {
    expect(managementSource).toContain('<section class="hero-stats-section"');
    expect(managementSource).toContain('summarizeBookmarkCoverage(bookmark.tagList, externalLibraryTotal.value)');
    expect(managementSource).toContain('class="bookmark-ai-action"');
    expect(managementSource).toContain('<BActionButton\n                    action="edit"');
    expect(managementSource).toContain('<BActionButton\n                    action="delete"');
    expect(managementSource).toContain('class="bookmark-manage-load-more"');
  });

  it('浏览态和嵌入管理态复用同一套标签目录，不因模式切换替换侧栏', () => {
    const directorySource = read('components/home/BookmarkDirectoryPanel.vue');
    const filterSource = read('view/home/FilterPanel.vue');
    expect(homeSource).toContain('<BookmarkDirectoryPanel v-if="!bookmark.isMobile" />');
    expect(managementSource).toContain('<BookmarkDirectoryPanel v-if="embedded" />');
    expect(managementSource).toContain('<BCard v-else as="aside"');
    expect(directorySource).toContain("import FilterPanel from '@/view/home/FilterPanel.vue'");
    expect(directorySource).toContain('<FilterPanel />');
    expect(filterSource).toContain("String(router.currentRoute.value.query.mode || '') === 'manage'");
    expect(filterSource).toContain('router.push({ path: `/home/${tag.id}`, query: managementQuery.value })');
    expect(filterSource).toContain("router.replace({ path: '/home', query: managementQuery.value })");
  });

  it('桌面按原型把目录与结果并排，统计归入结果列并保持紧凑多列卡片', () => {
    const resultsColumnIndex = managementSource.indexOf('class="bookmark-results-column"');
    const statsIndex = managementSource.indexOf('class="hero-stats-section"');
    const resultPanelIndex = managementSource.indexOf('class="result-panel"');
    expect(resultsColumnIndex).toBeGreaterThan(0);
    expect(statsIndex).toBeGreaterThan(resultsColumnIndex);
    expect(resultPanelIndex).toBeGreaterThan(statsIndex);
    expect(managementSource).toMatch(/\.hero-stats\s*\{[\s\S]*?repeat\(4, minmax\(0, 1fr\)\)/);
    expect(managementSource).toMatch(/\.bookmark-grid\s*\{[\s\S]*?min\(100%, 270px\)/);
    expect(managementSource).toMatch(/\.content-layout\s*\{[\s\S]*?228px minmax\(0, 1fr\)/);
    expect(zhLocaleSource).toContain("aiUseBookmark: '问一问'");
  });

  it('管理卡片沿用浏览卡片的图标尺度和表面，只在底部增加管理操作', () => {
    const browseCardSource = read('components/home/TagCard.vue');
    expect(browseCardSource).toContain(':size="22"');
    expect(browseCardSource).toContain(':tile-size="34"');
    expect(managementSource).toContain(':size="22"');
    expect(managementSource).toContain(':tile-size="34"');
    expect(managementSource).toContain('max-width="120px"');
    expect(managementSource).not.toContain(
      'size="medium"\n                    interactive\n                    max-width="160px"',
    );
    expect(managementSource).toMatch(/\.bookmark-card\s*\{[\s\S]*?linear-gradient\(/u);
    expect(managementSource).toMatch(/\.section-block\s*\{[\s\S]*?padding:\s*12px 0/u);
    expect(managementSource).toMatch(/\.chip-list\s*\{[\s\S]*?flex-wrap:\s*nowrap[\s\S]*?overflow:\s*hidden/u);
    expect(managementSource).toMatch(/\.bookmark-card__footer\s*\{[\s\S]*?border-top:/u);
    expect(managementSource).not.toContain('class="section-title"');
  });

  it('管理模式沿用普通模式页面底色，并固定新增书签按钮的宽度与内容间距避免切换抖动', () => {
    expect(managementSource).toMatch(
      /@media \(min-width: 1200px\)\s*\{[\s\S]*?\.bookmark-page-shell\s*\{[\s\S]*?background:\s*var\(--background-color\)/,
    );
    expect(homeSource).toMatch(/\.bookmark-add-action\s*\{[\s\S]*?min-width:\s*112px/);
    expect(managementSource).toMatch(
      /:deep\(\.resource-page-actions \.resource-action--primary\)\s*\{[\s\S]*?min-width:\s*112px/,
    );
    expect(homeSource).toMatch(/\.bookmark-add-action\s*\{[\s\S]*?gap:\s*7px/);
    expect(managementSource).toMatch(
      /:deep\(\.resource-page-actions \.resource-action--primary\)\s*\{[\s\S]*?gap:\s*7px/,
    );
    expect(homeSource).toContain('<SvgIcon :src="icon.common.add" size="16" />');
    expect(managementSource).toContain('<SvgIcon :src="icon.common.add" color="currentColor" size="16" />');
  });

  it('手机继续渲染旧的独立管理组件，不会挂载桌面统计卡', () => {
    const routeSource = read('view/manage/BookmarkMg.vue');
    const mobileManagementSource = read('components/manage/bookmarkMg/BookmarkTableMobile.vue');
    expect(routeSource).toContain('<BookmarkTableMobile v-if="bookmark.isMobile" />');
    expect(routeSource).toContain('<BookmarkTable v-else />');
    expect(mobileManagementSource).not.toContain('hero-stats-section');
  });
});
