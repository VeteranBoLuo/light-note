import { describe, expect, it } from 'vitest';
import type { AiAgentRecoverySnapshot } from '@/api/aiWorkspaceApi';
import { applyAiRecoverySnapshot, shouldAttemptAiStreamRecovery } from './aiStreamRecovery';

function snapshot(overrides: Partial<AiAgentRecoverySnapshot> = {}): AiAgentRecoverySnapshot {
  return {
    protocolVersion: '2.0',
    requestId: 'request-1',
    sessionId: 'session-1',
    answer: '权威完整答案',
    sources: [{ type: 'note', id: 'note-1', title: '来源一' }],
    citations: [],
    evidence: [
      {
        evidenceRef: 'evidence-1',
        sourceId: 'note:note-1',
        citationKey: '1',
        locator: { type: 'paragraph', value: '2' },
        excerpt: '证据',
      },
    ],
    citationAudit: { citedKeys: ['1'], invalidKeys: [], verifiedCitationCount: 1, evidenceCount: 1 },
    coverage: { complete: true },
    activity: [{ eventId: 1, event: 'response.started' }],
    stage: 'completed',
    status: 'completed',
    terminal: {
      status: 'completed',
      eventId: 8,
      error: null,
      message: null,
      at: '2026-07-19T00:00:00.000Z',
    },
    lastEventId: 8,
    startedAt: '2026-07-19T00:00:00.000Z',
    updatedAt: '2026-07-19T00:00:01.000Z',
    ...overrides,
  };
}

describe('AI stream terminal recovery', () => {
  it('只允许当前、未取消、未见终态且尚未尝试的请求恢复一次', () => {
    const base = {
      attempted: false,
      requestCurrent: true,
      requestId: 'request-1',
      reliableTerminalReceived: false,
      cancelled: false,
    };
    expect(shouldAttemptAiStreamRecovery(base)).toBe(true);
    expect(shouldAttemptAiStreamRecovery({ ...base, attempted: true })).toBe(false);
    expect(shouldAttemptAiStreamRecovery({ ...base, requestCurrent: false })).toBe(false);
    expect(shouldAttemptAiStreamRecovery({ ...base, requestId: '' })).toBe(false);
    expect(shouldAttemptAiStreamRecovery({ ...base, reliableTerminalReceived: true })).toBe(false);
    expect(shouldAttemptAiStreamRecovery({ ...base, cancelled: true })).toBe(false);
  });

  it('以快照整体替换断流前内容，不合并 delta、来源、证据或活动', () => {
    const target = {
      content: '权威',
      sources: [{ type: 'file' as const, id: 'old', title: '旧来源' }],
      evidence: [{ evidenceRef: 'old', sourceId: 'old', citationKey: '9', locator: null, excerpt: '旧证据' }],
      coverage: { complete: false },
      activity: ['旧活动'],
    };

    expect(
      applyAiRecoverySnapshot(
        target,
        snapshot({
          activity: [
            { eventId: 1, event: 'response.started' },
            {
              event: 'memory_context',
              status: 'used',
              count: 1,
              types: ['preference'],
              scopes: ['global'],
              memoryId: 'memory-secret-id',
              content: '记忆正文 secret',
            },
          ],
        }),
      ),
    ).toBe('completed');
    expect(target).toMatchObject({
      content: '权威完整答案',
      requestId: 'request-1',
      sources: [{ type: 'note', id: 'note-1', title: '来源一' }],
      evidence: [{ evidenceRef: 'evidence-1' }],
      coverage: { complete: true },
      activity: [
        { eventId: 1, event: 'response.started' },
        { event: 'memory_context', status: 'used', count: 1, types: ['preference'], scopes: ['global'] },
      ],
      recovered: true,
      stage: 'completed',
      terminal: { status: 'completed', eventId: 8 },
    });
    expect(target.content).not.toBe('权威权威完整答案');
    expect(JSON.stringify(target.activity)).not.toContain('memory-secret-id');
    expect(JSON.stringify(target.activity)).not.toContain('记忆正文');
  });

  it('拒绝状态与终态不一致的非权威快照', () => {
    const invalid = snapshot({
      status: 'completed',
      terminal: {
        status: 'failed',
        eventId: 8,
        error: 'AI_SERVICE_ERROR',
        message: '失败',
        at: '2026-07-19T00:00:01.000Z',
      },
    });
    expect(() => applyAiRecoverySnapshot({ content: '原内容' }, invalid)).toThrow(
      'AI_RESPONSE_RECOVERY_SNAPSHOT_INVALID',
    );
    expect(() => applyAiRecoverySnapshot({ content: '原内容' }, snapshot({ lastEventId: 9 }))).toThrow(
      'AI_RESPONSE_RECOVERY_SNAPSHOT_INVALID',
    );
  });
});
