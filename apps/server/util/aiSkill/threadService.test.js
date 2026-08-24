import { describe, expect, it, vi } from 'vitest';
import { appendAiSkillTurn, resolveAiSkillThread } from './threadService.js';

const skill = Object.freeze({
  id: 'file.ask',
  version: 1,
  contextPolicy: Object.freeze({ historyTurns: 2 }),
});
const context = Object.freeze({
  scopeDigest: 'a'.repeat(64),
  identity: Object.freeze({
    actorUserId: 'actor-1',
    subjectUserId: 'subject-1',
    adminContextMode: 'maintain',
    adminContextId: 'context-1',
  }),
});

describe('AI Skill thread', () => {
  it('新请求只生成待落库线程，不在模型调用前制造空历史', async () => {
    const thread = await resolveAiSkillThread({
      skill,
      request: { threadId: null },
      context,
      database: { query: vi.fn() },
    });
    expect(thread).toMatchObject({ persisted: false, history: [] });
    expect(thread.id).toMatch(/^[0-9a-f-]{36}$/u);
  });

  it('管理员只读预览允许单轮处理但不创建或续用自然语言线程', async () => {
    const readonlyContext = {
      ...context,
      identity: { ...context.identity, adminContextMode: 'readonly' },
    };
    await expect(
      resolveAiSkillThread({ skill, request: { threadId: null }, context: readonlyContext, database: {} }),
    ).resolves.toBeNull();
    await expect(
      resolveAiSkillThread({ skill, request: { threadId: 'thread-1' }, context: readonlyContext, database: {} }),
    ).rejects.toMatchObject({ code: 'ADMIN_PREVIEW_READONLY', status: 403 });
  });

  it('只读取同 actor、subject、Skill 和 scopeDigest 的最近有界轮次', async () => {
    const database = {
      query: vi
        .fn()
        .mockResolvedValueOnce([
          [
            {
              id: 'thread-1',
              actor_user_id: 'actor-1',
              subject_user_id: 'subject-1',
              admin_context_mode: 'maintain',
              admin_context_id: 'context-1',
              skill_id: 'file.ask',
              skill_version: 1,
              scope_digest: 'a'.repeat(64),
              status: 'active',
            },
          ],
        ])
        .mockResolvedValueOnce([
          [
            { user_text: '后一个问题', assistant_text: '后一个回答' },
            { user_text: '前一个问题', assistant_text: '前一个回答' },
          ],
        ]),
    };
    const thread = await resolveAiSkillThread({
      skill,
      request: { threadId: 'thread-1' },
      context,
      database,
    });
    expect(database.query.mock.calls[1][1]).toEqual(['thread-1', 2]);
    expect(thread.history).toEqual([
      { role: 'user', content: '前一个问题' },
      { role: 'assistant', content: '前一个回答' },
      { role: 'user', content: '后一个问题' },
      { role: 'assistant', content: '后一个回答' },
    ]);
  });

  it('跨 Skill、跨账号或资源版本变化都拒绝继承', async () => {
    const database = {
      query: vi.fn().mockResolvedValue([
        [
          {
            id: 'thread-1',
            actor_user_id: 'actor-1',
            subject_user_id: 'subject-1',
            admin_context_mode: 'maintain',
            admin_context_id: 'context-1',
            skill_id: 'file.ask',
            skill_version: 1,
            scope_digest: 'b'.repeat(64),
            status: 'active',
          },
        ],
      ]),
    };
    await expect(
      resolveAiSkillThread({ skill, request: { threadId: 'thread-1' }, context, database }),
    ).rejects.toMatchObject({ code: 'AI_SKILL_THREAD_SCOPE_CONFLICT', status: 409 });
  });

  it('同一 actor 与 subject 在不同管理员授权上下文中也不能继承线程', async () => {
    const database = {
      query: vi.fn().mockResolvedValue([
        [
          {
            id: 'thread-1',
            actor_user_id: 'actor-1',
            subject_user_id: 'subject-1',
            admin_context_mode: 'maintain',
            admin_context_id: 'another-context',
            skill_id: 'file.ask',
            skill_version: 1,
            scope_digest: 'a'.repeat(64),
            status: 'active',
          },
        ],
      ]),
    };
    await expect(
      resolveAiSkillThread({ skill, request: { threadId: 'thread-1' }, context, database }),
    ).rejects.toMatchObject({ code: 'AI_SKILL_THREAD_SCOPE_CONFLICT', status: 409 });
  });

  it('线程与轮次在同一事务写入并限制保留数量', async () => {
    const connection = {
      beginTransaction: vi.fn(),
      query: vi.fn().mockResolvedValue([{ affectedRows: 1 }]),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
    };
    await appendAiSkillTurn({
      thread: { id: 'thread-1', persisted: false },
      skill,
      context,
      requestId: 'request-1',
      userText: '问题',
      assistantText: '回答',
      database: { getConnection: vi.fn().mockResolvedValue(connection) },
    });
    expect(connection.beginTransaction).toHaveBeenCalledOnce();
    expect(connection.query).toHaveBeenCalledTimes(3);
    expect(connection.query.mock.calls[0][0]).toContain('INSERT INTO ai_skill_threads');
    expect(connection.query.mock.calls[1][0]).toContain('INSERT INTO ai_skill_turns');
    expect(connection.query.mock.calls[2][0]).toContain('DELETE FROM ai_skill_turns');
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.release).toHaveBeenCalledOnce();
  });
});
