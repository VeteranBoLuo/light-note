import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  aiNoteDraftInternals,
  consumeAiNoteDraft,
  createAiNoteDraftHandoff,
  discardAiNoteDraft,
  readAiNoteDraft,
  stageAiNoteDraft,
} from './aiNoteDraft';

describe('aiNoteDraft', () => {
  beforeEach(() => sessionStorage.clear());

  it('暂存后只能消费一次', () => {
    const token = stageAiNoteDraft({ title: '总结', content: '# 正文', type: 'markdown' });
    expect(consumeAiNoteDraft(token)).toEqual({ title: '总结', content: '# 正文', type: 'markdown' });
    expect(consumeAiNoteDraft(token)).toBeNull();
  });

  it('只读草稿支持刷新恢复，显式丢弃后才移除', () => {
    const token = stageAiNoteDraft({ title: '总结', content: '# 正文', type: 'markdown' });
    expect(readAiNoteDraft(token)?.content).toBe('# 正文');
    expect(readAiNoteDraft(token)?.content).toBe('# 正文');
    discardAiNoteDraft(token);
    expect(readAiNoteDraft(token)).toBeNull();
  });

  it('过期草稿不可恢复且会清理', () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(70_002);
    const token = stageAiNoteDraft({ content: '正文' }, 60_000);
    expect(readAiNoteDraft(token)).toBeNull();
    expect(sessionStorage.getItem(`${aiNoteDraftInternals.STORAGE_PREFIX}${token}`)).toBeNull();
    vi.restoreAllMocks();
  });

  it('只把笔记预览结果交接给现有编辑器，并保持内容类型', () => {
    const handoff = createAiNoteDraftHandoff(
      {
        protocolVersion: 1,
        requestId: 'request-1',
        skillId: 'file.create_note_preview',
        skillVersion: 1,
        status: 'preview_ready',
        threadId: null,
        scopeDigest: null,
        result: {
          kind: 'artifact_preview',
          artifactType: 'note',
          title: '文件整理',
          content: '<p>正文</p>',
          contentType: 'html',
          writeCommitted: false,
        },
        sources: [],
        coverage: null,
        availableActions: [],
        receipt: null,
        error: null,
      },
      '备用标题',
    );

    expect(handoff?.route).toEqual({
      path: '/noteLibrary/add',
      query: { type: 'html', aiDraft: handoff?.token },
    });
    expect(readAiNoteDraft(handoff?.token)).toEqual({
      title: '文件整理',
      content: '<p>正文</p>',
      type: 'html',
    });
  });

  it('拒绝把非笔记预览或空正文交给编辑器', () => {
    const base = {
      protocolVersion: 1 as const,
      requestId: 'request-1',
      skillId: 'todo.parse_draft',
      skillVersion: 1,
      status: 'preview_ready' as const,
      threadId: null,
      scopeDigest: null,
      sources: [],
      coverage: null,
      availableActions: [],
      receipt: null,
      error: null,
    };
    expect(
      createAiNoteDraftHandoff({
        ...base,
        result: { kind: 'structured_draft', draftType: 'todo', title: '待办' },
      }),
    ).toBeNull();
    expect(
      createAiNoteDraftHandoff({
        ...base,
        result: { kind: 'artifact_preview', artifactType: 'note', title: '空草稿', content: '   ' },
      }),
    ).toBeNull();
  });
});
