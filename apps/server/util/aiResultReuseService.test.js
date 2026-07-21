import { beforeEach, describe, expect, it, vi } from 'vitest';

const pool = { query: vi.fn() };
const createAiChangeSet = vi.fn();
const getOwnedAiMessage = vi.fn();
const hashAiChangeState = vi.fn(() => 'before-hash');

vi.mock('../db/index.js', () => ({ default: pool }));
vi.mock('./aiChangeSetService.js', () => ({ createAiChangeSet, hashAiChangeState }));
vi.mock('./aiConversationService.js', () => ({ getOwnedAiMessage }));

const {
  __testing,
  buildReferencedNoteContent,
  extractAiResultReusableBlocks,
  listAiResultNoteTargets,
  listAiResultReusableBlocks,
  prepareAiResultNoteReuse,
  safeSourceHref,
} = await import('./aiResultReuseService.js');

const identity = {
  actorUserId: 'actor-1',
  subjectUserId: 'subject-1',
  adminContextMode: 'normal',
};

function completedMessage(content = '新增结论') {
  return {
    id: 'message-1',
    role: 'assistant',
    status: 'completed',
    content,
    requestId: 'request-1',
    traceId: 'trace-1',
    sources: [
      {
        sourceId: 'source-1',
        resourceType: 'note',
        resourceId: 'source-note',
        resourceVersion: 'v2',
        title: '来源笔记',
        target: { path: '/noteLibrary/source-note' },
      },
    ],
    evidence: [
      {
        sourceId: 'source-1',
        evidenceRef: 'evidence-1',
        citationKey: '1',
        locator: { label: '第 2 段' },
        excerptHash: 'excerpt-hash',
      },
    ],
  };
}

describe('AI result note reuse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOwnedAiMessage.mockResolvedValue(completedMessage());
    createAiChangeSet.mockResolvedValue({ id: 'change-set-1' });
  });

  it('保留可读来源与结构化溯源，同时过滤危险来源协议', () => {
    const content = buildReferencedNoteContent(completedMessage());
    expect(content).toContain('## AI 回答来源');
    expect(content).toContain('[来源笔记](/noteLibrary/source-note)');
    expect(content).toContain('第 2 段');
    const encoded = content.match(/<!-- ([A-Za-z0-9_-]+) -->/)?.[1];
    const metadata = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    expect(metadata).toMatchObject({ schema: 'light-note-ai-sources-v1', requestId: 'request-1' });
    expect(safeSourceHref({ target: { url: 'javascript:alert(1)' } })).toBe('');
  });

  it('回答与来源元数据超过笔记上限时明确拒绝，不静默截断溯源信息', () => {
    expect(() => buildReferencedNoteContent(completedMessage('x'.repeat(1_000_000)))).toThrow(/CONTENT_TOO_LONG/);
  });

  it('合并模式跳过目标笔记中已有的内容块，并保留新内容与来源', () => {
    const message = completedMessage('已有结论\n\n新的证据');
    const composed = __testing.composeTargetContent(
      { title: '目标', type: 'markdown', content: '# 目标\n\n已有结论' },
      message,
      'merge',
      'zh-CN',
    );
    expect(composed.uniqueBlockCount).toBe(1);
    expect(composed.duplicateBlockCount).toBe(1);
    expect(composed.content).toContain('新的证据');
    expect(composed.content).toContain('## AI 回答来源');
  });

  it('HTML 目标只写入清理后的 HTML，不保留脚本、事件属性或危险链接', () => {
    const html = __testing.safeGeneratedHtml(
      '<script>alert(1)</script>\n\n[危险](javascript:alert(1))\n\n<img src="https://example.com/a.png" onerror="alert(2)">',
    );
    expect(html).not.toMatch(/<script|onerror|javascript:/i);
    expect(html).toContain('https://example.com/a.png');
  });

  it('按 Markdown 标题片段和顶层结构拆分稳定可选块', () => {
    const message = completedMessage(
      '开场说明\n\n## 结论\n\n结论内容 [1]\n\n- 要点 A\n- 要点 B\n\n## 建议\n\n建议内容',
    );
    const first = extractAiResultReusableBlocks(message);
    const second = extractAiResultReusableBlocks(message);

    expect(first).toHaveLength(3);
    expect(first.map((item) => item.kind)).toEqual(['paragraph', 'section', 'section']);
    expect(first.map((item) => item.title)).toEqual(['开场说明', '结论', '建议']);
    expect(first[1]).toMatchObject({ citationKeys: ['1'] });
    expect(first.map((item) => item.id)).toEqual(second.map((item) => item.id));
  });

  it('可选块清单由归属校验后的持久化助手消息生成，不返回原始块正文', async () => {
    getOwnedAiMessage.mockResolvedValue(completedMessage('## 结论\n\n可选内容 [1]'));
    const database = { query: vi.fn() };
    const result = await listAiResultReusableBlocks(
      identity,
      { conversationId: 'conversation-1', messageId: 'message-1' },
      database,
    );

    expect(getOwnedAiMessage).toHaveBeenCalledWith(identity, 'conversation-1', 'message-1', database);
    expect(result).toMatchObject({ total: 1, sourceCount: 1, evidenceCount: 1 });
    expect(result.items[0]).toMatchObject({ index: 0, kind: 'section', title: '结论', citationKeys: ['1'] });
    expect(result.items[0]).not.toHaveProperty('content');
  });

  it('目标搜索只查询 subject 自己的未删除笔记，并返回内容哈希版本', async () => {
    const database = {
      query: vi.fn().mockResolvedValue([
        [
          {
            id: 'note-1',
            title: '研究笔记',
            type: 'markdown',
            content_length: 42,
            resource_version: 'version-1',
            update_time: '2026-07-19 12:00:00',
          },
        ],
      ]),
    };
    const result = await listAiResultNoteTargets(identity, { keyword: '研究', limit: 10 }, database);
    expect(result.items[0]).toMatchObject({ id: 'note-1', contentLength: 42, resourceVersion: 'version-1' });
    const [sql, params] = database.query.mock.calls[0];
    expect(sql).toContain('create_by = ? AND del_flag = 0');
    expect(sql).toContain('SHA2');
    expect(params[0]).toBe('subject-1');
    expect(params[1]).toBe('%研究%');
  });

  it('准备写入时同时校验会话消息归属、目标 owner 和客户端内容版本，并生成可逆 Change Set', async () => {
    const database = {
      query: vi.fn().mockResolvedValue([
        [
          {
            id: 'target-note',
            title: '目标笔记',
            content: '原正文',
            type: 'markdown',
            resource_version: 'version-1',
            update_time: '2026-07-19 12:00:00',
          },
        ],
      ]),
    };

    const result = await prepareAiResultNoteReuse(
      identity,
      {
        conversationId: 'conversation-1',
        messageId: 'message-1',
        mode: 'append',
        targetNoteId: 'target-note',
        targetVersion: 'version-1',
      },
      database,
    );

    expect(getOwnedAiMessage).toHaveBeenCalledWith(identity, 'conversation-1', 'message-1', database);
    expect(database.query.mock.calls[0][1]).toEqual(['target-note', 'subject-1']);
    expect(createAiChangeSet).toHaveBeenCalledWith(
      identity,
      expect.objectContaining({
        conversationId: 'conversation-1',
        items: [
          expect.objectContaining({
            operation: 'update_note_content',
            resourceType: 'note',
            resourceId: 'target-note',
            expectedBeforeHash: 'before-hash',
          }),
        ],
      }),
      database,
    );
    expect(result).toMatchObject({
      changeSetId: 'change-set-1',
      preview: { mode: 'append', target: { id: 'target-note' }, undoSupported: true, versionCheck: 'content_hash' },
    });
  });

  it('选段写入只接受服务端块 ID，从持久化回答重建正文并完整保留来源证据', async () => {
    const message = completedMessage('## 结论\n\n保留的结论 [1]\n\n## 附录\n\n不应写入的附录');
    getOwnedAiMessage.mockResolvedValue(message);
    const blocks = extractAiResultReusableBlocks(message);
    const database = {
      query: vi.fn().mockResolvedValue([
        [
          {
            id: 'target-note',
            title: '目标笔记',
            content: '原正文',
            type: 'markdown',
            resource_version: 'version-1',
          },
        ],
      ]),
    };

    const result = await prepareAiResultNoteReuse(
      identity,
      {
        conversationId: 'conversation-1',
        messageId: 'message-1',
        mode: 'selection',
        selectedBlockIds: [blocks[0].id],
        content: '客户端伪造正文',
        targetNoteId: 'target-note',
        targetVersion: 'version-1',
      },
      database,
    );

    const changeInput = createAiChangeSet.mock.calls[0][1];
    const written = changeInput.items[0].after.content;
    expect(written).toContain('保留的结论 [1]');
    expect(written).not.toContain('不应写入的附录');
    expect(written).not.toContain('客户端伪造正文');
    expect(written).toContain('## AI 选段内容');
    const encoded = written.match(/<!-- ([A-Za-z0-9_-]+) -->/)?.[1];
    const metadata = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    expect(metadata.sources).toHaveLength(1);
    expect(metadata.savedSources[0]).toMatchObject({ sourceId: 'source-1', title: '来源笔记' });
    expect(metadata.savedEvidence[0]).toMatchObject({
      evidenceRef: 'evidence-1',
      citationKey: '1',
      excerptHash: 'excerpt-hash',
    });
    expect(metadata.selection).toMatchObject({
      sourceMessageId: 'message-1',
      blockIds: [blocks[0].id],
      selectedBlockCount: 1,
      totalBlockCount: 2,
      citationKeys: ['1'],
    });
    expect(result.preview).toMatchObject({
      mode: 'selection',
      selectedBlockCount: 1,
      totalBlockCount: 2,
      selectedCitationCount: 1,
      sourceCount: 1,
      evidenceCount: 1,
      undoSupported: true,
    });
  });

  it('伪造或过期块 ID 在 Change Set 创建前被拒绝', async () => {
    getOwnedAiMessage.mockResolvedValue(completedMessage('## 结论\n\n权威正文'));
    await expect(
      prepareAiResultNoteReuse(identity, {
        conversationId: 'conversation-1',
        messageId: 'message-1',
        mode: 'selection',
        selectedBlockIds: ['block-99-0000000000000000'],
        targetNoteId: 'target-note',
        targetVersion: 'version-1',
      }),
    ).rejects.toMatchObject({ code: 'RESULT_BLOCK_SELECTION_STALE', status: 409 });
    expect(createAiChangeSet).not.toHaveBeenCalled();
  });

  it('英文界面生成英文审计标题、摘要和原因', async () => {
    const database = {
      query: vi.fn().mockResolvedValue([
        [
          {
            id: 'target-note',
            title: 'Research note',
            content: 'Existing content',
            type: 'markdown',
            resource_version: 'version-1',
          },
        ],
      ]),
    };
    await prepareAiResultNoteReuse(
      identity,
      {
        conversationId: 'conversation-1',
        messageId: 'message-1',
        mode: 'append',
        targetNoteId: 'target-note',
        targetVersion: 'version-1',
        locale: 'en-US',
      },
      database,
    );
    expect(createAiChangeSet).toHaveBeenCalledWith(
      identity,
      expect.objectContaining({
        title: 'AI append: Research note',
        summary: 'Append the answer and its 1 source reference to the end of the note.',
        items: [expect.objectContaining({ reason: 'Append the AI answer and preserve its source references' })],
      }),
      database,
    );
  });

  it('目标内容哈希已变化时在创建 Change Set 前返回 409', async () => {
    const database = {
      query: vi.fn().mockResolvedValue([
        [
          {
            id: 'target-note',
            title: '目标笔记',
            content: '用户新正文',
            type: 'markdown',
            resource_version: 'version-new',
          },
        ],
      ]),
    };
    await expect(
      prepareAiResultNoteReuse(
        identity,
        {
          conversationId: 'conversation-1',
          messageId: 'message-1',
          mode: 'merge',
          targetNoteId: 'target-note',
          targetVersion: 'version-old',
        },
        database,
      ),
    ).rejects.toMatchObject({ code: 'TARGET_VERSION_CONFLICT', status: 409 });
    expect(createAiChangeSet).not.toHaveBeenCalled();
  });
});
