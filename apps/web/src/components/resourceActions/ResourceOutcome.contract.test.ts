import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), `src/${path}`), 'utf8');

const actionBar = read('components/resourceActions/ResourceBatchActionBar.vue');
const outcomeDrawer = read('components/resourceActions/ResourceOutcomeDrawer.vue');
const cloudSpace = read('components/cloudSpace/fieldList.vue');
const resourceCenter = read('view/search/SearchCenter.vue');
const bookmarkTable = read('components/manage/bookmarkMg/BookmarkTable.vue');
const bookmarkTableMobile = read('components/manage/bookmarkMg/BookmarkTableMobile.vue');
const noteLibrary = read('view/noteLibrary/NoteLibrary.vue');

describe('资源批量操作与成果抽屉契约', () => {
  it('批量态使用不挤压页面的共享悬浮操作栏，并复用移动端底栏', () => {
    expect(actionBar).toContain('<Teleport to="body">');
    expect(actionBar).toContain('<MobileStickyActionBar');
    expect(actionBar).toContain('v-if="$slots.leading"');
    expect(actionBar).toContain('v-if="showPrimary && showMobilePrimary"');
    expect(actionBar).toContain('showPrimary?: boolean');
    expect(actionBar).toContain('primaryIcon?: string');
    expect(actionBar).toContain('primaryIcon || icon.common.magicWand');
    expect(actionBar).toMatch(/\.resource-batch-action-bar\s*\{[\s\S]*?position:\s*fixed/);
    expect(actionBar).toContain('<BButton');
    expect(actionBar).toContain('<BTooltip');
    expect(actionBar).not.toMatch(/<(?:button|input|select|textarea)\b/u);
    expect(actionBar).not.toContain('<svg');
    expect(actionBar).toContain(':global(html.light-note-mobile-rendering .resource-batch-action-bar--mobile)');
  });

  it('成果抽屉只消费真实可用的资料型 AI 目录，并使用统一报价与任务链路', () => {
    expect(outcomeDrawer).toContain(':mobile-full-screen="true"');
    expect(outcomeDrawer).toContain('fetchToolboxCatalog');
    expect(outcomeDrawer).toContain('createToolboxQuote');
    expect(outcomeDrawer).toContain('createToolboxJob');
    expect(outcomeDrawer).toContain('createToolboxClientRequestId');
    expect(outcomeDrawer).toContain('tool.availability.enabled');
    expect(outcomeDrawer).toContain("tool.executionMode === 'ai_skill'");
    expect(outcomeDrawer).toContain("tool.input.kind === 'resources'");
    expect(outcomeDrawer).toContain('tool.input.minItems');
    expect(outcomeDrawer).toContain('tool.input.maxItems');
    expect(outcomeDrawer).toContain('tool.input.resourceTypes');
    expect(outcomeDrawer).toContain('tool.billingMedia.includes');
    expect(outcomeDrawer).toContain('billingMedium: billingMedium.value');
    expect(outcomeDrawer).not.toMatch(/<(?:button|input|select|textarea)\b/u);
    expect(outcomeDrawer).not.toContain('<svg');
  });

  it('快捷分析保留显式资料范围与存为笔记闭环，不混入本地文件工具', () => {
    expect(outcomeDrawer).toContain('<AiSkillPanel');
    expect(outcomeDrawer).toContain(':resource-refs="aiResourceRefs"');
    expect(outcomeDrawer).toContain('persistAiMarkdownResultAsNote');
    expect(outcomeDrawer).toContain("tool.executionMode === 'ai_skill'");
    expect(outcomeDrawer).not.toContain("tool.executionMode === 'browser'");
    expect(cloudSpace).toContain('quickReadable: isAiDocumentFileNameSupported(file.fileName)');
    expect(resourceCenter).toContain("item.type !== 'file' || isAiDocumentFileNameSupported(item.title)");
  });

  it('云空间与资源中心复用同一交互，且全量匹配不会被误传给 AI', () => {
    for (const source of [cloudSpace, resourceCenter]) {
      expect(source).toContain('<ResourceBatchActionBar');
      expect(source).toContain('<ResourceOutcomeDrawer');
      expect(source).toContain(':show-mobile-primary="false"');
      expect(source).toContain("key: 'outcome'");
      expect(source).toMatch(/key: 'clear',[\s\S]*?icon: icon\.common\.close/);
      expect(source).not.toMatch(/mobileBatchActions[\s\S]*?key: 'toggleAll'/);
    }
    expect(cloudSpace).not.toContain('class="mobile-batch-toolbar"');
    expect(resourceCenter).not.toContain('class="batch-toolbar"');
    expect(cloudSpace).toContain("'field-list--batch-mode': batchMode");
    expect(cloudSpace).toContain('class="batch-action-delete"');
    expect(cloudSpace).not.toContain('batchDesktopMoreActions');
    expect(cloudSpace).not.toMatch(/mobileBatchActions[\s\S]*?key: 'exit'/);
    expect(resourceCenter).toContain("'search-page--batch': batchMode");
    expect(resourceCenter).toContain('<template #leading>');
    expect(resourceCenter).toContain(':checked="batchSelectAllChecked"');
    expect(resourceCenter).toContain('class="batch-action-delete"');
    expect(resourceCenter).not.toContain('desktopBatchMoreActions');
    expect(resourceCenter).not.toMatch(/mobileBatchActions[\s\S]*?key: 'exit'/);
    expect(resourceCenter).toMatch(
      /\.search-page--batch \.resource-inspector-pane\s*\{[\s\S]*?padding-bottom:\s*112px/,
    );
    expect(resourceCenter).toContain(':primary-disabled="allMatchingActive || !selectedCount"');
    expect(resourceCenter).toMatch(/function openBatchOutcomeDrawer\(\)[\s\S]*?if \(allMatchingActive\.value\)/);
    expect(resourceCenter).toContain("scopeMode: 'selected'");
  });

  it('P1 将共享底栏与成果抽屉扩展到书签和笔记，同时保留单项 AI 快捷入口', () => {
    for (const source of [bookmarkTable, bookmarkTableMobile, noteLibrary]) {
      expect(source).toContain('<ResourceBatchActionBar');
      expect(source).toContain('<ResourceOutcomeDrawer');
      expect(source).toContain('<template #leading>');
    }
    for (const source of [bookmarkTableMobile, noteLibrary]) {
      expect(source).toContain("key: 'outcome'");
      expect(source).toMatch(/key: 'clear',[\s\S]*?icon: icon\.common\.close/);
    }

    expect(outcomeDrawer).toContain("'bookmark_manage' | 'note_library'");
    expect(bookmarkTable).toContain('surface="bookmark_manage"');
    expect(bookmarkTable).toContain(':row-clickable="selectionMode"');
    expect(bookmarkTable).toContain('@click.stop="handleBookmarkUrlClick($event, bookmarkItem)"');
    expect(bookmarkTable).toContain('<BookmarkAiDialog');
    expect(bookmarkTable).toContain('openBookmarksInAi([bookmarkItem])');
    expect(bookmarkTable).toContain(':selected-ids="selectedAiOrganizeIds"');
    expect(bookmarkTable).not.toContain('<BButton v-if="selectedRows.length > 0" type="danger"');

    expect(bookmarkTableMobile).toContain(':show-mobile-primary="false"');
    expect(bookmarkTableMobile).toContain('showAdd: () => !batchMode.value');
    expect(bookmarkTableMobile).not.toContain('<MobileStickyActionBar');
    expect(bookmarkTableMobile).toContain('<BookmarkAiDialog');

    expect(noteLibrary).toContain('surface="note_library"');
    expect(noteLibrary).toContain('@click="toggleBatchMode"');
    expect(noteLibrary).toContain("$t(batchMode ? 'note.exitBatch' : 'note.batchAction')");
    expect(noteLibrary).toContain(':show-mobile-primary="false"');
    expect(noteLibrary).toContain('showAdd: () => !batchMode.value');
    expect(noteLibrary).toContain('<NoteAiDialog');
    expect(noteLibrary).toContain('openNotesAi([note])');
    expect(noteLibrary).toContain("supportedTypes: ['note']");
  });

  it('选中态在共享移动渲染基线下仍有实色描边和明确图标', () => {
    expect(outcomeDrawer).toMatch(/\.resource-outcome-intent\.b_btn\.is-selected[\s\S]*?border:\s*2px solid/);
    expect(outcomeDrawer).toContain(':src="icon.message.success"');
    expect(outcomeDrawer).toContain(':global(html.light-note-mobile-rendering .resource-outcome-intent');
    expect(outcomeDrawer).toMatch(/\.resource-outcome-intent\.b_btn\s*\{[\s\S]*?height:\s*auto/);
    expect(outcomeDrawer).toMatch(/\.resource-outcome-detail-options :deep\(\.b_btn\)\s*\{[\s\S]*?width:\s*100%/);
    expect(outcomeDrawer).toContain('drawerScrollRef.value.scrollTop = 0');
  });
});
