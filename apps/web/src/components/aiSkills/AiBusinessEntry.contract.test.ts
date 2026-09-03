import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), `src/${path}`), 'utf8');

describe('业务 AI 入口能力契约', () => {
  it('云文件入口复用共享格式清单，图片动作表达 OCR 语义且不开放自由提问', () => {
    const source = read('components/cloudSpace/fieldList.vue');
    const presentation = read('utils/fileAiSummary.ts');

    expect(source).toContain("import { isAiDocumentFileNameSupported } from '@lightnote/shared'");
    expect(source).toContain('isAiDocumentFileNameSupported(item.fileName)');
    expect(source).toContain('<ResourceBatchActionBar');
    expect(source).toContain('<ResourceOutcomeDrawer');
    expect(source).toContain('quickReadable: isAiDocumentFileNameSupported(file.fileName)');
    expect(source).toContain('resolveFileAiSummaryPresentation');
    expect(presentation).toContain("'cloudSpace.aiExtractAndSummarizeImage'");
    expect(presentation).toContain("'cloudSpace.aiExtractAndSummarizeImageInstruction'");
    expect(source).toContain(':show-prompt="false"');
    expect(source).toContain(':show-grounding="false"');
    expect(source).toContain(':auto-run-action-id="fileAiAutoRunActionId"');
    expect(source).toContain('persistAiMarkdownResultAsNote');
    expect(source).toContain('#result-actions');
    expect(source).not.toContain("skillId: 'file.create_note_preview'");
    expect(source).not.toContain("id: 'extract-todos'");
  });

  it('书签入口统一为单卡自动分析，并由用户把分析结果保存为笔记', () => {
    const desktopTable = read('components/manage/bookmarkMg/BookmarkTable.vue');
    const mobileTable = read('components/manage/bookmarkMg/BookmarkTableMobile.vue');
    const homeCards = read('components/home/CardPanel.vue');
    const dialog = read('components/manage/bookmarkMg/BookmarkAiDialog.vue');
    const snapshot = read('components/manage/bookmarkEditMg/BookmarkSnapshotModal.vue');

    expect(desktopTable).not.toContain('openSelectedBookmarksInAi');
    expect(mobileTable).not.toContain('openSelectedBookmarksInAi');
    expect(dialog).toContain('props.bookmarks.slice(0, 1)');
    expect(dialog).toContain(':show-prompt="false"');
    expect(dialog).toContain(':show-grounding="false"');
    expect(dialog).toContain('auto-run-action-id="summarize"');
    expect(dialog).toContain("'bookmark.summarize_page'");
    expect(dialog).toContain('persistAiMarkdownResultAsNote');
    expect(dialog).toContain('#result-actions');
    expect(dialog).toContain("t('aiSkills.saveAsNote')");
    expect(dialog).not.toContain('bookmark.create_note_preview');
    expect(dialog).not.toContain("mode?: 'analyze' | 'create_note'");
    expect(dialog).not.toContain("'bookmark.compare_pages'");
    expect(homeCards).toContain("key: 'analyzeBookmark'");
    expect(homeCards).not.toContain('mode="create_note"');
    expect(snapshot).toContain("'/api/bookmark/archive'");
    expect(snapshot).toContain("'/api/bookmark/summarize'");
    expect(snapshot).not.toContain("'/api/bookmark/archive-summary'");
    expect(snapshot).toContain('await loadSnap();');
    expect(snapshot).not.toContain('await generateArchive();');
    expect(snapshot).not.toContain('await generateSummary();');
  });

  it('只有一个固定分析动作的入口打开即执行，不再显示重复任务按钮', () => {
    const panel = read('components/aiSkills/AiSkillPanel.vue');
    const noteDialog = read('components/noteLibrary/library/NoteAiDialog.vue');
    const tagDetail = read('view/tagDetail/TagDetail.vue');
    const inbox = read('view/inbox/Inbox.vue');
    const search = read('view/search/SearchCenter.vue');

    expect(panel).toContain('visibleActions');
    expect(panel).toContain('action.id !== autoRunId');
    expect(noteDialog).toContain("resourceRefs.length ? 'summarize' : ''");
    expect(tagDetail).toContain("tagAiResourceRefs.length ? 'summarize' : ''");
    expect(noteDialog).toContain(':show-grounding="false"');
    expect(tagDetail).toContain(':show-grounding="false"');
    expect(inbox).toContain('auto-run-action-id="analyze"');
    expect(search).toContain("searchAiResourceRefs.value.length === 1 ? 'summarize' : ''");
    expect(search.match(/:show-grounding="false"/gu) || []).toHaveLength(2);
  });

  it('书签存档弹窗不在按钮上重复标记免费或额度信息', () => {
    const zhLocale = read('i18n/locales/zh-CN.ts');
    const enLocale = read('i18n/locales/en-US.ts');
    const snapshot = read('components/manage/bookmarkEditMg/BookmarkSnapshotModal.vue');

    expect(zhLocale).toContain("snapshotCreateArchive: '保存网页正文'");
    expect(zhLocale).toContain("aiSummaryGenerate: 'AI 生成摘要'");
    expect(zhLocale).toContain("aiSummaryRefresh: 'AI 重新生成'");
    expect(enLocale).toContain("snapshotCreateArchive: 'Save page text'");
    expect(enLocale).toContain("aiSummaryGenerate: 'Generate AI summary'");
    expect(snapshot).not.toContain('bookmarkMg.snapshotHint');
  });
});
