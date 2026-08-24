import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), `src/${path}`), 'utf8');

describe('业务 AI 入口能力契约', () => {
  it('云文件入口复用共享格式清单，图片动作表达 OCR 语义且不开放自由提问', () => {
    const source = read('components/cloudSpace/fieldList.vue');
    const presentation = read('utils/fileAiSummary.ts');

    expect(source).toContain("import { isAiDocumentFileNameSupported } from '@lightnote/shared'");
    expect(source).toContain(':disabled="!hasAiAnalyzableSelection"');
    expect(source).toContain('isAiDocumentFileNameSupported(item.fileName)');
    expect(source).toContain('resolveFileAiSummaryPresentation');
    expect(presentation).toContain("'cloudSpace.aiExtractAndSummarizeImage'");
    expect(presentation).toContain("'cloudSpace.aiExtractAndSummarizeImageInstruction'");
    expect(source).toContain(':show-prompt="false"');
    expect(source).not.toContain("id: 'extract-todos'");
  });

  it('书签管理仅保留单卡分析，并把网页存档与 AI 摘要拆成显式动作', () => {
    const desktopTable = read('components/manage/bookmarkMg/BookmarkTable.vue');
    const mobileTable = read('components/manage/bookmarkMg/BookmarkTableMobile.vue');
    const dialog = read('components/manage/bookmarkMg/BookmarkAiDialog.vue');
    const snapshot = read('components/manage/bookmarkEditMg/BookmarkSnapshotModal.vue');

    expect(desktopTable).not.toContain('openSelectedBookmarksInAi');
    expect(mobileTable).not.toContain('openSelectedBookmarksInAi');
    expect(dialog).toContain('props.bookmarks.slice(0, 1)');
    expect(dialog).toContain(':show-prompt="false"');
    expect(dialog).toContain("'bookmark.summarize_page'");
    expect(dialog).not.toContain("'bookmark.compare_pages'");
    expect(snapshot).toContain("'/api/bookmark/archive'");
    expect(snapshot).toContain("'/api/bookmark/summarize'");
    expect(snapshot).not.toContain("'/api/bookmark/archive-summary'");
    expect(snapshot).toContain('await loadSnap();');
    expect(snapshot).not.toContain('await generateArchive();');
    expect(snapshot).not.toContain('await generateSummary();');
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
