import { describe, expect, it, vi } from 'vitest';
import { createAgentSessionPersistence, mapAgentPersistentSnapshot } from './agentSessionPersistence.js';

const context = {
  conversationId: 'conversation-1',
  actorId: 'actor-1',
  subjectId: 'subject-1',
  ownerKey: 'user:actor-1',
};

describe('Agent session 持久化适配器', () => {
  it('disabled 不接触仓储，enforce 在无持久快照时恢复干净 revision 0', async () => {
    const repository = { load: vi.fn(), commit: vi.fn() };
    expect(createAgentSessionPersistence({ mode: 'disabled', context, repository })).toBeNull();
    expect(repository.load).not.toHaveBeenCalled();

    repository.load.mockResolvedValue(null);
    const persistence = createAgentSessionPersistence({ mode: 'enforce', context, repository });
    await expect(persistence.restore()).resolves.toMatchObject({
      discourseState: { revision: 0, activeSourceSetIds: [], activeResultSetIds: [] },
      sourceSets: [],
      resultSets: [],
    });
    expect(persistence.authoritative).toBe(true);
  });

  it('恢复 SourceSet、ResultSet 与可继续修改的 ArtifactVersion，不恢复正文到会话投影', () => {
    const snapshot = mapAgentPersistentSnapshot({
      revision: 7,
      topicEpoch: 2,
      discourseState: { activeDomain: 'note' },
      activeSourceSetIds: ['source-1'],
      activeResultSetIds: ['result-1'],
      sourceSets: [
        {
          id: 'source-1',
          kind: 'mixed',
          items: {
            refs: [{ type: 'note', id: 'note-1' }],
            attachmentIds: ['attachment-1'],
            dialogueAnchor: {
              conversationId: 'conversation-1',
              messageIds: ['message-1', 'message-2'],
              topicEpoch: 2,
              digest: 'c'.repeat(64),
            },
          },
          sourceDigest: 'a'.repeat(64),
        },
      ],
      resultSets: [
        {
          id: 'result-1',
          handleId: 'rsh-1',
          runId: 'run-1',
          goalId: 'goal-1',
          capabilityId: 'note.query',
          entityType: 'note',
          refs: [{ type: 'note', id: 'note-1' }],
          totalCount: 1,
          returnedCount: 1,
          completeness: 'complete',
        },
      ],
      artifactVersion: {
        id: 'artifact-1',
        artifactChainId: 'chain-1',
        capabilityId: 'note.create',
        state: 'ready',
        content: '不能进入 session',
        contentHash: 'b'.repeat(64),
      },
    });

    expect(snapshot.discourseState).toMatchObject({
      revision: 7,
      activeSourceSetIds: ['source-1'],
      activeResultSetIds: ['result-1'],
      pendingArtifactId: 'artifact-1',
    });
    expect(snapshot.resultSets[0]).toMatchObject({
      domains: ['note'],
      metadata: { totalCount: 1, returned: 1, totalExact: true },
    });
    expect(snapshot.sourceSets[0].dialogueAnchor).toMatchObject({
      messageIds: ['message-1', 'message-2'],
      topicEpoch: 2,
    });
    expect(snapshot.artifactStates[0]).not.toHaveProperty('content');
    expect(JSON.stringify(snapshot)).not.toContain('不能进入 session');
  });

  it('enforce 严格 CAS，shadow 使用单调镜像并对仓储故障 fail-open', async () => {
    const repository = {
      load: vi.fn().mockResolvedValue(null),
      commit: vi
        .fn()
        .mockResolvedValueOnce({ state: 'committed', revision: 1 })
        .mockRejectedValueOnce(Object.assign(new Error('table unavailable'), { code: 'ER_NO_SUCH_TABLE' })),
    };
    const logger = { warn: vi.fn() };
    const enforce = createAgentSessionPersistence({ mode: 'enforce', context, repository, logger });
    const snapshot = mapAgentPersistentSnapshot(null);
    snapshot.discourseState.revision = 1;
    await expect(enforce.commitFocus({ expectedRevision: 0, snapshot })).resolves.toMatchObject({
      state: 'committed',
    });
    expect(repository.commit.mock.calls[0][1]).toMatchObject({ commitMode: 'cas', expectedRevision: 0 });

    const shadow = createAgentSessionPersistence({ mode: 'shadow', context, repository, logger });
    await expect(shadow.mirrorFocus({ expectedRevision: 1, snapshot })).resolves.toEqual({
      state: 'skipped',
      errorCode: 'ER_NO_SUCH_TABLE',
    });
    expect(repository.commit.mock.calls[1][1]).toMatchObject({ commitMode: 'monotonic_mirror' });
    expect(logger.warn).toHaveBeenCalledWith(
      '[Agent] persistent state shadow write failed code=%s',
      'ER_NO_SUCH_TABLE',
    );
  });

  it('durable 句柄与焦点在同一次 commit 中送入仓储', async () => {
    const repository = {
      load: vi.fn(),
      commit: vi.fn().mockResolvedValue({ state: 'committed', revision: 3 }),
    };
    const persistence = createAgentSessionPersistence({ mode: 'enforce', context, repository });
    const snapshot = mapAgentPersistentSnapshot(null);
    snapshot.discourseState = {
      ...snapshot.discourseState,
      revision: 3,
      activeSourceSetIds: ['source-1'],
      activeResultSetIds: ['result-1'],
      activeReadRunId: 'run-1',
    };
    await persistence.commitFocus({
      expectedRevision: 2,
      snapshot,
      durable: {
        sourceSets: [{ id: 'source-1', refs: [{ type: 'note', id: 'note-1' }] }],
        resultSets: [
          {
            id: 'result-1',
            runId: 'run-1',
            capabilityId: 'note.query',
            refs: [{ type: 'note', id: 'note-1' }],
            expiresAt: 1_800_000,
          },
        ],
      },
    });

    expect(repository.commit.mock.calls[0][1]).toMatchObject({
      expectedRevision: 2,
      state: {
        activeSourceSetIds: ['source-1'],
        activeResultSetIds: ['result-1'],
        lastRunId: 'run-1',
      },
      sourceSets: [{ id: 'source-1' }],
      resultSets: [{ id: 'result-1', freshUntil: 1_800_000 }],
    });
  });

  it('Run 生命周期复用同一身份上下文，shadow 写失败不影响请求', async () => {
    const repository = {
      load: vi.fn(),
      commit: vi.fn(),
      createRun: vi.fn().mockResolvedValue({ id: 'run-1', status: 'running' }),
      settleRun: vi.fn().mockRejectedValue(Object.assign(new Error('offline'), { code: 'ECONNRESET' })),
    };
    const logger = { warn: vi.fn() };
    const persistence = createAgentSessionPersistence({ mode: 'shadow', context, repository, logger });

    await expect(persistence.startRun({ id: 'run-1', baseRevision: 2, status: 'running' })).resolves.toEqual({
      id: 'run-1',
      status: 'running',
    });
    await expect(persistence.settleRun('run-1', { status: 'completed' })).resolves.toEqual({
      state: 'skipped',
      errorCode: 'ECONNRESET',
    });
    expect(repository.createRun.mock.calls[0][0]).toMatchObject({
      conversationId: 'conversation-1',
      actorId: 'actor-1',
      subjectId: 'subject-1',
    });
    expect(logger.warn).toHaveBeenCalledWith('[Agent] persistent run shadow write failed code=%s', 'ECONNRESET');
  });

  it('只有 enforce 能通过服务端版本链恢复草稿，并同时恢复其不可变 SourceSet', async () => {
    const artifact = {
      id: 'artifact-v2',
      sourceSetId: 'source-1',
      state: 'ready',
      content: '服务端正文',
    };
    const sourceSet = { id: 'source-1', items: { refs: [{ type: 'note', id: 'note-1' }] } };
    const repository = {
      load: vi.fn(),
      commit: vi.fn(),
      loadEditableArtifact: vi.fn().mockResolvedValue(artifact),
      loadSourceSet: vi.fn().mockResolvedValue(sourceSet),
    };
    const enforce = createAgentSessionPersistence({ mode: 'enforce', context, repository });
    await expect(enforce.recoverEditableArtifact('artifact-v1')).resolves.toEqual({ artifact, sourceSet });
    expect(repository.loadEditableArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: context.conversationId,
        actorId: context.actorId,
        subjectId: context.subjectId,
        ownerKeyHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
      'artifact-v1',
      undefined,
    );

    const shadow = createAgentSessionPersistence({ mode: 'shadow', context, repository });
    await expect(shadow.recoverEditableArtifact('artifact-v1')).resolves.toBeNull();
    expect(repository.loadEditableArtifact).toHaveBeenCalledTimes(1);

    repository.loadSourceSet.mockResolvedValueOnce(null);
    await expect(enforce.recoverEditableArtifact('artifact-v1')).resolves.toBeNull();
  });
});
