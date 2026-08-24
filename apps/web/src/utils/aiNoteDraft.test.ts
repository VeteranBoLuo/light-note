import { beforeEach, describe, expect, it, vi } from 'vitest';
const apiBasePostMock = vi.hoisted(() => vi.fn());
const confirmNoteShareExposureMock = vi.hoisted(() => vi.fn());

vi.mock('@/http/request', () => ({ apiBasePost: apiBasePostMock }));
vi.mock('@/utils/noteShareExposure', () => ({ confirmNoteShareExposure: confirmNoteShareExposureMock }));

import {
  aiNoteDraftInternals,
  consumeAiNoteDraft,
  createAiNoteDraftHandoff,
  discardAiNoteDraft,
  persistAiNotePreview,
  readAiNoteDraft,
  stageAiNoteDraft,
} from './aiNoteDraft';

describe('aiNoteDraft', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    confirmNoteShareExposureMock.mockResolvedValue(null);
  });

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

  it('确认笔记预览后立即持久化，并返回已保存笔记路由', async () => {
    apiBasePostMock.mockResolvedValue({ status: 200, data: { id: 'note/created' }, msg: '' });
    const response = {
      protocolVersion: 1 as const,
      requestId: 'request-1',
      skillId: 'note.create_from_sources',
      skillVersion: 1,
      status: 'preview_ready' as const,
      threadId: null,
      scopeDigest: null,
      result: {
        kind: 'artifact_preview',
        artifactType: 'note',
        title: '今日总结',
        content: '# 正文',
        contentType: 'markdown',
        writeCommitted: false,
      },
      sources: [],
      coverage: null,
      availableActions: [],
      receipt: null,
      error: null,
    };

    await expect(persistAiNotePreview(response, '备用标题')).resolves.toEqual({
      noteId: 'note/created',
      route: { path: '/noteLibrary/note%2Fcreated' },
    });
    expect(apiBasePostMock).toHaveBeenCalledWith(
      '/api/note/addNote',
      {
        title: '今日总结',
        content: '# 正文',
        type: 'markdown',
        idempotencyKey: 'ai-skill-note:request-1',
      },
      { silent: true },
    );
    expect(sessionStorage.length).toBe(0);
  });

  it('创建接口失败时不得伪装成已保存', async () => {
    apiBasePostMock.mockResolvedValue({ status: 500, data: { code: 'WRITE_FAILED' }, msg: '写入失败' });
    const response = {
      protocolVersion: 1 as const,
      requestId: 'request-2',
      skillId: 'file.create_note_preview',
      skillVersion: 1,
      status: 'preview_ready' as const,
      threadId: null,
      scopeDigest: null,
      result: { kind: 'artifact_preview', artifactType: 'note', title: '文件总结', content: '正文' },
      sources: [],
      coverage: null,
      availableActions: [],
      receipt: null,
      error: null,
    };

    await expect(persistAiNotePreview(response)).rejects.toMatchObject({
      message: '写入失败',
      code: 'WRITE_FAILED',
      status: 500,
    });
  });

  it('缺少服务端请求标识时失败关闭，避免不同预览共用同一幂等键', async () => {
    const response = {
      protocolVersion: 1 as const,
      requestId: '',
      skillId: 'note.create_from_sources',
      skillVersion: 1,
      status: 'preview_ready' as const,
      threadId: null,
      scopeDigest: null,
      result: { kind: 'artifact_preview', artifactType: 'note', title: '总结', content: '正文' },
      sources: [],
      coverage: null,
      availableActions: [],
      receipt: null,
      error: null,
    };

    await expect(persistAiNotePreview(response)).rejects.toMatchObject({
      code: 'AI_NOTE_REQUEST_ID_MISSING',
      status: 422,
    });
    expect(apiBasePostMock).not.toHaveBeenCalled();
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
