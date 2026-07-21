import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  resolveFingerprint: vi.fn((req) => String(req?.headers?.fingerprint || req?.ip || 'unknown')),
}));

vi.mock('../db/index.js', () => ({ default: { query: mocks.poolQuery } }));
vi.mock('./aiQuota.js', () => ({ resolveFingerprint: mocks.resolveFingerprint }));

const {
  cleanupExpiredResponseEvents,
  persistAiResponseSnapshot,
  recoverAiResponse,
  resolveAiResponseRecoveryIdentity,
  aiResponseRecoveryInternals,
} = await import('./aiResponseRecoveryService.js');

const normalIdentity = {
  actorUserId: 'user-1',
  subjectUserId: 'user-1',
  adminContextMode: 'normal',
  adminContextId: null,
};

function terminalFixture() {
  const events = [
    { event: 'response.started', requestId: 'request-1', protocolVersion: '2.0', eventId: 1 },
    { event: 'delta', requestId: 'request-1', protocolVersion: '2.0', eventId: 2, output: { text: '答案' } },
    { event: 'response.completed', requestId: 'request-1', protocolVersion: '2.0', eventId: 3 },
  ];
  const snapshot = {
    protocolVersion: '2.0',
    requestId: 'request-1',
    sessionId: 'session-1',
    answer: '答案',
    sources: [],
    citations: [],
    evidence: [],
    coverage: null,
    activity: [],
    stage: 'completed',
    status: 'completed',
    terminal: { status: 'completed', eventId: 3 },
    lastEventId: 3,
  };
  return { snapshot, events };
}

describe('AI response recovery service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('终态保存时剔除逐 token delta、只存结构事件与终态，固定 10 分钟 TTL，并写入四维所有者身份', async () => {
    const database = { query: vi.fn().mockResolvedValue([[]]) };

    const result = await persistAiResponseSnapshot(normalIdentity, terminalFixture(), database);

    // 3 个事件中 delta(eventId 2) 被剔除,只持久化 started(1) + completed(3)
    expect(result).toEqual(expect.objectContaining({ eventCount: 2, lastEventId: 3, ttlSeconds: 600 }));
    expect(database.query).toHaveBeenCalledTimes(2);
    const [insertSql, params] = database.query.mock.calls[1];
    expect(insertSql).toContain('admin_context_mode, admin_context_id');
    expect(insertSql).toContain('DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? SECOND)');
    expect(params.slice(0, 9)).toEqual([
      'request-1',
      'user-1',
      'user-1',
      'normal',
      null,
      1,
      'response.started',
      expect.any(String),
      600,
    ]);
    expect(JSON.parse(params.at(-2))).toEqual(
      expect.objectContaining({
        event: 'response.completed',
        recoverySnapshot: expect.objectContaining({ answer: '答案', status: 'completed' }),
      }),
    );
  });

  it('长回答的大量逐 token delta 不会撑破恢复事件上限，仍能保存终态快照', async () => {
    const database = { query: vi.fn().mockResolvedValue([[]]) };
    const events = [{ event: 'response.started', requestId: 'request-1', protocolVersion: '2.0', eventId: 1 }];
    for (let i = 0; i < 800; i += 1) {
      events.push({
        event: 'delta',
        requestId: 'request-1',
        protocolVersion: '2.0',
        eventId: i + 2,
        output: { text: '字' },
      });
    }
    const terminalEventId = events[events.length - 1].eventId + 1;
    events.push({
      event: 'response.completed',
      requestId: 'request-1',
      protocolVersion: '2.0',
      eventId: terminalEventId,
    });
    const snapshot = {
      protocolVersion: '2.0',
      requestId: 'request-1',
      sessionId: 'session-1',
      answer: '很长的答案',
      sources: [],
      citations: [],
      evidence: [],
      coverage: null,
      activity: [],
      stage: 'completed',
      status: 'completed',
      terminal: { status: 'completed', eventId: terminalEventId },
      lastEventId: terminalEventId,
    };

    const result = await persistAiResponseSnapshot(normalIdentity, { snapshot, events }, database);

    // 800 个 delta 全被剔除,只剩 started + completed;不再因超过 500 事件上限抛错
    expect(result.eventCount).toBe(2);
    expect(result.lastEventId).toBe(terminalEventId);
  });

  it('按 lastEventId 返回缺失事件，同时无论事件是否为空都返回终态 snapshot', async () => {
    const fixture = terminalFixture();
    const rows = fixture.events.map((event, index) => ({
      event_id: event.eventId,
      event_type: event.event,
      payload_json: JSON.stringify(
        index === fixture.events.length - 1 ? { ...event, recoverySnapshot: fixture.snapshot } : event,
      ),
      expires_at: '2026-07-19T12:10:00.000Z',
    }));
    const database = {
      query: vi.fn().mockResolvedValueOnce([[]]).mockResolvedValueOnce([rows]),
    };

    const recovered = await recoverAiResponse(normalIdentity, { requestId: 'request-1', lastEventId: 2 }, database);

    expect(recovered.snapshot.answer).toBe('答案');
    expect(recovered.events).toEqual([expect.objectContaining({ event: 'response.completed', eventId: 3 })]);
    expect(recovered.events[0]).not.toHaveProperty('recoverySnapshot');
    const [, selectParams] = database.query.mock.calls[1];
    expect(selectParams).toEqual(['user-1', 'user-1', 'normal', null, 'request-1']);
  });

  it('管理员恢复查询必须同时匹配 actor、subject、mode 与 adminContextId', async () => {
    const fixture = terminalFixture();
    const terminalEvent = fixture.events.at(-1);
    const database = {
      query: vi
        .fn()
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([
          [
            {
              event_id: 3,
              event_type: terminalEvent.event,
              payload_json: JSON.stringify({ ...terminalEvent, recoverySnapshot: fixture.snapshot }),
              expires_at: '2026-07-19T12:10:00.000Z',
            },
          ],
        ]),
    };
    const identity = {
      actorUserId: 'root-1',
      subjectUserId: 'user-2',
      actorRole: 'root',
      adminContextMode: 'readonly',
      adminContextId: 'admin-context-9',
    };

    await recoverAiResponse(identity, { requestId: 'request-1' }, database);

    const [sql, params] = database.query.mock.calls[1];
    expect(sql).toContain('admin_context_id <=> ?');
    expect(params).toEqual(['root-1', 'user-2', 'readonly', 'admin-context-9', 'request-1']);
  });

  it('拒绝普通上下文跨主体身份，且 visitor 使用设备指纹派生隔离 ID', () => {
    expect(() =>
      aiResponseRecoveryInternals.assertIdentity({
        actorUserId: 'user-1',
        subjectUserId: 'user-2',
        adminContextMode: 'normal',
      }),
    ).toThrow(expect.objectContaining({ code: 'AI_RESPONSE_RECOVERY_IDENTITY_INVALID' }));

    const first = resolveAiResponseRecoveryIdentity({
      user: { id: 'visitor', role: 'visitor' },
      headers: { fingerprint: 'device-a' },
    });
    const second = resolveAiResponseRecoveryIdentity({
      user: { id: 'visitor', role: 'visitor' },
      headers: { fingerprint: 'device-b' },
    });
    expect(first.actorUserId).toMatch(/^visitor:/);
    expect(first.actorUserId).toBe(first.subjectUserId);
    expect(first.actorUserId).not.toBe(second.actorUserId);
  });

  it('不存在或已过期时返回稳定 404 错误码', async () => {
    const database = { query: vi.fn().mockResolvedValue([[]]) };
    await expect(recoverAiResponse(normalIdentity, { requestId: 'request-1' }, database)).rejects.toMatchObject({
      code: 'AI_RESPONSE_RECOVERY_NOT_FOUND',
      status: 404,
    });
  });

  it('独立清理会分批删除过期快照，避免低流量环境长期残留', async () => {
    const database = {
      query: vi
        .fn()
        .mockResolvedValueOnce([{ affectedRows: 500 }])
        .mockResolvedValueOnce([{ affectedRows: 23 }]),
    };

    await expect(cleanupExpiredResponseEvents(database)).resolves.toEqual({ deleted: 523 });
    expect(database.query).toHaveBeenCalledTimes(2);
  });
});
