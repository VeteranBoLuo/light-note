import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/view/inbox/Inbox.vue'), 'utf8');

describe('待整理资源 AI 路由', () => {
  it('按资源类型调用所属模块的 Skill，不再借用搜索模块通用 Skill', () => {
    expect(source).toContain("resourceType === 'file') return 'file.summarize'");
    expect(source).toContain("resourceType === 'note') return 'note.batch_summarize'");
    expect(source).toContain("resourceType === 'bookmark') return 'bookmark.summarize_page'");
    expect(source).not.toContain('search.summarize_selected');
    expect(source).toContain('surface="inbox"');
  });

  it('文件入口复用云空间类型语义，并在执行前拦截不支持的文件', () => {
    expect(source).toContain('resolveFileAiSummaryPresentation({ fileName: item.title })');
    expect(source).toContain('isAiDocumentFileNameSupported(item.title)');
    expect(source).toContain("t('cloudSpace.aiUnsupportedFilesSkipped', { count: 1 })");
  });
});
