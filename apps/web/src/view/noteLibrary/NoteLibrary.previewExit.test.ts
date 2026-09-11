import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/view/noteLibrary/NoteLibrary.vue'), 'utf8');

describe('笔记库桌面预览退出', () => {
  it('预览详情路径由笔记库写入共享工作区，并在失效时清理恢复状态', () => {
    expect(source).toContain(':breadcrumb="previewBreadcrumb"');
    expect(source).toContain('@breadcrumb-resolved="handlePreviewBreadcrumbResolved"');
    expect(source).toContain('@detail-resolved="handlePreviewDetailResolved"');
    expect(source).toContain('@unavailable="handlePreviewUnavailable"');
    expect(source).toMatch(
      /function handlePreviewBreadcrumbResolved[\s\S]*noteWorkspace\.revealNotePath\(noteId, payload\.items\)/u,
    );
    expect(source).toMatch(/function handlePreviewUnavailable[\s\S]*closePreview\(true\)/u);
  });

  it('预览态点击笔记库只退出预览，普通态仍执行原有重置', () => {
    expect(source).toContain('@title-click="handleNoteLibraryTitleClick"');
    expect(source).toMatch(
      /async function handleNoteLibraryTitleClick\(\)[\s\S]*if \(desktopPreviewOpen\.value\)[\s\S]*closeDesktopPreview\(\);[\s\S]*return;[\s\S]*await resetNoteLibrary\(\);/,
    );
  });

  it('进入预览前记录列表滚动位置，退出后在原视图恢复', () => {
    expect(source).toMatch(/function openLibraryNote[\s\S]*captureDesktopPreviewScroll\(\);/);
    expect(source).toContain("querySelector<HTMLElement>('.note-main-panel [data-mobile-resource-scroll]')");
    expect(source).toContain('top: element.scrollTop');
    expect(source).toContain('left: element.scrollLeft');
    expect(source).toContain('snapshot.viewMode !== currentViewMode.value');
    expect(source).toContain('element.scrollTop = snapshot.top');
    expect(source).toContain('element.scrollLeft = snapshot.left');
  });

  it('沿父级面包屑切换预览不会覆盖最初的列表滚动快照', () => {
    const openBreadcrumbFunction = source.match(/function openPreviewBreadcrumbPage[\s\S]*?\n  }/)?.[0] || '';
    expect(openBreadcrumbFunction).toContain('setDesktopPreviewPage(noteId, source)');
    expect(openBreadcrumbFunction).not.toContain('captureDesktopPreviewScroll');
    expect(openBreadcrumbFunction).not.toContain('closeDesktopPreview');
  });

  it('顶部笔记入口在路由成功落到根页时清除 keepAlive 内的预览和筛选现场', () => {
    const outcomeStateIndex = source.indexOf('const outcomeDrawerOpen = ref(false);');
    const rootEntryWatchIndex = source.indexOf(
      'watch([libraryRootEntryRequestToken, () => router.currentRoute.value.path], applyPendingLibraryRootEntryRequest',
    );
    expect(outcomeStateIndex).toBeGreaterThan(-1);
    expect(rootEntryWatchIndex).toBeGreaterThan(-1);
    expect(outcomeStateIndex).toBeLessThan(rootEntryWatchIndex);
    expect(source).toContain('libraryRootEntryRequestToken');
    expect(source).toMatch(
      /function applyPendingLibraryRootEntryRequest[\s\S]*router\.currentRoute\.value\.path !== '\/noteLibrary'[\s\S]*clearNoteLibraryRootViewState\(\);/,
    );
    expect(source).toContain(
      'watch([libraryRootEntryRequestToken, () => router.currentRoute.value.path], applyPendingLibraryRootEntryRequest',
    );
    expect(source).toContain("flush: 'sync'");
    expect(source).toContain('onActivated(applyPendingLibraryRootEntryRequest)');
  });

  it('预览详情和待整理操作会同步卡片、预览副本与列表缓存', () => {
    expect(source).toContain('@pending-state="syncPreviewNotePendingState"');
    expect(source).toMatch(
      /function syncNotePendingState[\s\S]*noteList\.value\.forEach[\s\S]*previewNoteSeed\.value![\s\S]*updateNotePendingState/u,
    );
    expect(source).toMatch(
      /async function toggleNoteInbox[\s\S]*syncNotePendingState\(noteId, !wasPending\);[\s\S]*invalidateNoteDetailPrefetch/u,
    );
    expect(source).toMatch(/function syncPreviewNotePendingState[\s\S]*if \(previewPendingLocallyChanged\) return;/u);
  });
});
