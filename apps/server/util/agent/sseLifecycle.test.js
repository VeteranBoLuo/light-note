import { describe, expect, it, vi } from 'vitest';
import { createAgentSseLifecycle } from './sseLifecycle.js';

function response() {
  return {
    headersSent: false,
    writableEnded: false,
    destroyed: false,
    writeHead: vi.fn(function () {
      this.headersSent = true;
    }),
    write: vi.fn(),
    end: vi.fn(function () {
      this.writableEnded = true;
    }),
  };
}

function events(res) {
  return res.write.mock.calls
    .map(([chunk]) => String(chunk))
    .filter((chunk) => chunk.startsWith('data: {'))
    .map((chunk) => JSON.parse(chunk.slice(6)));
}

describe('Agent SSE lifecycle', () => {
  it('并行发送新旧开始/完成事件，并为每个协议事件分配严格单调 eventId', async () => {
    const res = response();
    const onTerminal = vi.fn();
    const lifecycle = createAgentSseLifecycle({ res, requestId: 'r1', sessionId: 's1', onTerminal });
    lifecycle.start();
    lifecycle.stage('planning');
    lifecycle.send('delta', { output: { text: '答' } });
    lifecycle.send('delta', { output: { text: '案' } });
    await lifecycle.complete({ usage: { totalTokens: 3 } });
    const output = events(res);
    expect(output.map((item) => item.event)).toEqual([
      'response.started',
      'start',
      'stage.changed',
      'delta',
      'delta',
      'response.completed',
      'done',
    ]);
    expect(output.map((item) => item.eventId)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(output.every((item) => item.protocolVersion === '2.0')).toBe(true);
    expect(onTerminal).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          requestId: 'r1',
          sessionId: 's1',
          answer: '答案',
          stage: 'completed',
          status: 'completed',
          lastEventId: 7,
          terminal: expect.objectContaining({ status: 'completed', eventId: 7 }),
        }),
        events: expect.arrayContaining([expect.objectContaining({ event: 'response.completed', eventId: 6 })]),
      }),
    );
    expect(res.end).toHaveBeenCalledOnce();
  });

  it('长请求按阶段发送 heartbeat，失败同时兼容旧 error', async () => {
    vi.useFakeTimers();
    const res = response();
    const lifecycle = createAgentSseLifecycle({ res, requestId: 'r2', heartbeatMs: 1000 });
    lifecycle.start();
    lifecycle.stage('tool_execution');
    await vi.advanceTimersByTimeAsync(1000);
    await lifecycle.fail({ error: 'TIMEOUT', message: '超时' });
    const output = events(res);
    expect(output.some((item) => item.event === 'heartbeat' && item.stage === 'tool_execution')).toBe(true);
    expect(output.slice(-2).map((item) => item.event)).toEqual(['response.failed', 'error']);
    vi.useRealTimers();
  });

  it('客户端断开后仍聚合终态并持久化，不再写关闭的 socket', async () => {
    const res = response();
    const onTerminal = vi.fn();
    const lifecycle = createAgentSseLifecycle({ res, requestId: 'r3', onTerminal });
    lifecycle.start();
    lifecycle.send('delta', { output: { text: '部分答案' } });
    const writeCount = res.write.mock.calls.length;
    res.destroyed = true;

    await lifecycle.fail({ error: 'CLIENT_DISCONNECTED', message: '连接中断' });

    expect(res.write).toHaveBeenCalledTimes(writeCount);
    expect(onTerminal).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          answer: '部分答案',
          status: 'failed',
          terminal: expect.objectContaining({ error: 'CLIENT_DISCONNECTED' }),
        }),
      }),
    );
  });

  it('终态快照聚合来源、证据、覆盖范围、阶段与工具活动', async () => {
    const res = response();
    const onTerminal = vi.fn();
    const lifecycle = createAgentSseLifecycle({ res, requestId: 'r4', sessionId: 's4', onTerminal });
    lifecycle.start();
    lifecycle.stage('tool_execution', { round: 1 });
    lifecycle.send('tool_start', { tool: 'search_notes', round: 1 });
    lifecycle.send('tool_result', { tool: 'search_notes', round: 1, status: 'success' });
    lifecycle.send('sources', {
      sources: [{ sourceId: 'note:1', title: '测试笔记' }],
      evidence: [{ evidenceRef: 'ev-1', sourceId: 'note:1', citationKey: '1' }],
      coverage: { overall: { complete: false, coverageRatio: 0.6 } },
      citationAudit: { evidenceCount: 1, verifiedCitationCount: 1 },
    });
    await lifecycle.complete({ snapshotAnswer: '基于材料的最终答案', output: { session_id: 's4' } });

    const snapshot = onTerminal.mock.calls[0][0].snapshot;
    expect(snapshot).toEqual(
      expect.objectContaining({
        answer: '基于材料的最终答案',
        sources: [expect.objectContaining({ sourceId: 'note:1' })],
        evidence: [expect.objectContaining({ evidenceRef: 'ev-1' })],
        citations: [expect.objectContaining({ citationKey: '1' })],
        coverage: { overall: { complete: false, coverageRatio: 0.6 } },
        citationAudit: { evidenceCount: 1, verifiedCitationCount: 1 },
        stage: 'completed',
      }),
    );
    expect(snapshot.activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: 'stage.changed', stage: 'tool_execution', round: 1 }),
        expect.objectContaining({ event: 'tool_start', tool: 'search_notes' }),
        expect.objectContaining({ event: 'tool_result', tool: 'search_notes', status: 'success' }),
      ]),
    );
  });

  it('记忆影响事件只允许有界枚举和数量，正文、ID 与错误详情不会出流或持久化', async () => {
    const res = response();
    const onTerminal = vi.fn();
    const lifecycle = createAgentSseLifecycle({ res, requestId: 'r-memory', onTerminal });
    lifecycle.start();
    lifecycle.send('memory_context', {
      status: 'used',
      count: 999,
      types: ['preference', 'workflow', 'system_instruction'],
      scopes: ['global', 'conversation', 'foreign_owner'],
      memoryId: 'memory-secret-id',
      content: '用户记忆正文 secret',
      rawError: 'provider-secret',
    });
    await lifecycle.complete({ snapshotAnswer: '完成' });

    const memoryEvent = events(res).find((item) => item.event === 'memory_context');
    expect(memoryEvent).toEqual(
      expect.objectContaining({
        status: 'used',
        count: 20,
        types: ['preference', 'workflow'],
        scopes: ['global', 'conversation'],
      }),
    );
    expect(memoryEvent).not.toHaveProperty('memoryId');
    expect(memoryEvent).not.toHaveProperty('content');
    expect(memoryEvent).not.toHaveProperty('rawError');

    const snapshot = onTerminal.mock.calls[0][0].snapshot;
    expect(snapshot.activity).toContainEqual(
      expect.objectContaining({
        event: 'memory_context',
        status: 'used',
        count: 20,
        types: ['preference', 'workflow'],
        scopes: ['global', 'conversation'],
      }),
    );
    expect(JSON.stringify(snapshot)).not.toContain('memory-secret-id');
    expect(JSON.stringify(snapshot)).not.toContain('用户记忆正文');
    expect(JSON.stringify(snapshot)).not.toContain('provider-secret');
  });
});
