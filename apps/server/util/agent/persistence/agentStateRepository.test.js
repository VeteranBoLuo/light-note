import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AgentStateRepositoryError,
  commitAgentConversationMutation,
  createAgentPersistenceContext,
  createAgentRun,
  loadAgentArtifactVersion,
  loadAgentConversationState,
  loadAgentSourceSet,
  loadLatestEditableAgentArtifactVersion,
  prepareAgentArtifactVersion,
  prepareAgentResultSet,
  prepareAgentSourceSet,
  settleAgentRun,
  transitionAgentArtifactVersion,
} from './agentStateRepository.js';

const contextInput = {
  conversationId: 'conversation-1',
  actorId: 'actor-1',
  actorRole: 'root',
  subjectId: 'subject-1',
  ownerKey: 'admin-context:trusted-owner',
  adminContextMode: 'maintain',
  adminContextId: 'admin-context-1',
  runtimeVersion: 'v3',
};

function connectionMock() {
  return {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    query: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
  };
}

describe('Agent Phase 2 持久仓储', () => {
  beforeEach(() => vi.clearAllMocks());

  it('身份同时绑定 actor、subject、管理上下文与 ownerKey 摘要', () => {
    const context = createAgentPersistenceContext(contextInput);
    expect(context).toMatchObject({
      conversationId: 'conversation-1',
      actorId: 'actor-1',
      subjectId: 'subject-1',
      adminContextMode: 'maintain',
      adminContextId: 'admin-context-1',
    });
    expect(context.ownerKeyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(() =>
      createAgentPersistenceContext({ ...contextInput, adminContextMode: 'normal', adminContextId: 'forbidden' }),
    ).toThrowError(AgentStateRepositoryError);
  });

  it('SourceSet、ResultSet 和 ArtifactVersion 只保存有界结构与摘要', () => {
    const sourceSet = prepareAgentSourceSet(
      {
        refs: [{ type: 'note', id: 'note-1' }],
        dialogueAnchor: {
          conversationId: 'another-conversation',
          messageIds: ['message-1', 'message-2'],
          topicEpoch: 3,
          digest: 'a'.repeat(64),
        },
      },
      contextInput,
    );
    expect(sourceSet).toMatchObject({ kind: 'mixed', subjectId: 'subject-1' });
    expect(sourceSet.items.dialogueAnchor).toMatchObject({ conversationId: 'conversation-1', topicEpoch: 3 });
    expect(sourceSet.sourceDigest).toMatch(/^[a-f0-9]{64}$/);

    const resultSet = prepareAgentResultSet(
      {
        runId: 'run-1',
        capabilityId: 'note.query',
        refs: [{ type: 'note', id: 'note-1' }],
        metadata: { totalCount: 7, returned: 1, totalExact: true, partial: true, nextCursor: 'next' },
      },
      contextInput,
    );
    expect(resultSet).toMatchObject({
      totalCount: 7,
      returnedCount: 1,
      completeness: 'partial',
      nextCursor: 'next',
    });
    expect(resultSet.queryFingerprint).toMatch(/^[a-f0-9]{64}$/);

    const artifact = prepareAgentArtifactVersion(
      { capabilityId: 'note.create', content: '# 标题\n正文', state: 'ready', sourceSetId: sourceSet.id },
      contextInput,
    );
    expect(artifact).toMatchObject({ state: 'ready', content: '# 标题\n正文', sourceSetId: sourceSet.id });
    expect(artifact.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(() => prepareAgentResultSet({ capabilityId: 'note.query' }, contextInput)).toThrowError(
      AgentStateRepositoryError,
    );
  });

  it('按服务端 owner 条件恢复焦点，并保持 active id 的确定顺序', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        [
          {
            revision: 4,
            topic_epoch: 2,
            discourse_state: JSON.stringify({ revision: 4, activeDomain: 'note' }),
            active_source_set_ids: JSON.stringify(['source-2', 'source-1']),
            active_result_set_ids: JSON.stringify(['result-1']),
            latest_artifact_version_id: 'artifact-1',
            last_run_id: 'run-1',
            update_time: '2026-08-21T10:00:00.000Z',
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          { id: 'source-1', kind: 'explicit', items_json: '{}', source_digest: '1'.repeat(64) },
          { id: 'source-2', kind: 'explicit', items_json: '{}', source_digest: '2'.repeat(64) },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            id: 'result-1',
            handle_id: 'rsh-1',
            run_id: 'run-1',
            goal_id: 'goal-1',
            capability_id: 'note.query',
            entity_type: 'note',
            query_fingerprint: '3'.repeat(64),
            filters_json: '{}',
            refs_json: '[{"type":"note","id":"note-1"}]',
            ordering_json: '[]',
            field_mask_json: '["id"]',
            total_count: 1,
            returned_count: 1,
            completeness: 'complete',
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            id: 'artifact-1',
            artifact_chain_id: 'chain-1',
            capability_id: 'note.create',
            version: 2,
            state: 'ready',
            content_md: '正文',
            content_hash: '4'.repeat(64),
          },
        ],
      ]);

    const snapshot = await loadAgentConversationState(contextInput, { query });

    expect(snapshot.revision).toBe(4);
    expect(snapshot.sourceSets.map((item) => item.id)).toEqual(['source-2', 'source-1']);
    expect(snapshot.resultSets[0]).toMatchObject({ handleId: 'rsh-1', completeness: 'complete' });
    expect(snapshot.artifactVersion).toMatchObject({ id: 'artifact-1', state: 'ready' });
    expect(query.mock.calls[0][1]).toEqual([
      'conversation-1',
      'actor-1',
      expect.stringMatching(/^[a-f0-9]{64}$/),
      'actor-1',
      'subject-1',
      'maintain',
      'admin-context-1',
    ]);
  });

  it('按会话身份和 owner 摘要读取单个 ArtifactVersion', async () => {
    const query = vi.fn().mockResolvedValue([
      [
        {
          id: 'artifact-1',
          artifact_chain_id: 'chain-1',
          capability_id: 'note.create',
          version: 1,
          state: 'ready',
          content_md: '正文',
          content_hash: 'a'.repeat(64),
        },
      ],
    ]);

    await expect(loadAgentArtifactVersion(contextInput, 'artifact-1', { query })).resolves.toMatchObject({
      id: 'artifact-1',
      state: 'ready',
      content: '正文',
    });
    expect(query.mock.calls[0][1]).toEqual([
      'artifact-1',
      'conversation-1',
      expect.stringMatching(/^[a-f0-9]{64}$/),
      'subject-1',
      'actor-1',
      'subject-1',
      'maintain',
      'admin-context-1',
    ]);
  });

  it('从旧版本 ID 只恢复同一版本链的最新可编辑 Artifact 与 SourceSet', async () => {
    const latestQuery = vi.fn().mockResolvedValue([
      [
        {
          id: '20000000-0000-4000-8000-000000000003',
          artifact_chain_id: '20000000-0000-4000-8000-000000000010',
          capability_id: 'note.create',
          version: 3,
          state: 'ready',
          content_md: '最新可信正文',
          content_hash: 'b'.repeat(64),
          source_set_id: '20000000-0000-4000-8000-000000000020',
        },
      ],
    ]);
    await expect(
      loadLatestEditableAgentArtifactVersion(contextInput, '20000000-0000-4000-8000-000000000001', {
        query: latestQuery,
      }),
    ).resolves.toMatchObject({ version: 3, content: '最新可信正文', state: 'ready' });
    expect(latestQuery.mock.calls[0][0]).toContain("latest.state IN ('draft', 'ready')");
    expect(latestQuery.mock.calls[0][0]).toContain('ORDER BY latest.version DESC');

    const sourceQuery = vi.fn().mockResolvedValue([
      [
        {
          id: '20000000-0000-4000-8000-000000000020',
          kind: 'explicit',
          items_json: JSON.stringify({ refs: [{ type: 'note', id: 'note-1' }] }),
          source_digest: 'c'.repeat(64),
        },
      ],
    ]);
    await expect(
      loadAgentSourceSet(contextInput, '20000000-0000-4000-8000-000000000020', { query: sourceQuery }),
    ).resolves.toMatchObject({ id: '20000000-0000-4000-8000-000000000020', items: { refs: [{ id: 'note-1' }] } });
    expect(sourceQuery.mock.calls[0][1]).toEqual([
      '20000000-0000-4000-8000-000000000020',
      'conversation-1',
      expect.stringMatching(/^[a-f0-9]{64}$/),
      'subject-1',
      'actor-1',
      'subject-1',
      'maintain',
      'admin-context-1',
    ]);
  });

  it('CAS 冲突不写入任何句柄，也不覆盖更高 revision', async () => {
    const connection = connectionMock();
    connection.query.mockResolvedValueOnce([[{ id: 'conversation-1' }]]).mockResolvedValueOnce([[{ revision: 5 }]]);
    const database = { getConnection: vi.fn().mockResolvedValue(connection) };

    const result = await commitAgentConversationMutation(
      contextInput,
      {
        expectedRevision: 4,
        state: { discourseState: { activeDomain: 'note' } },
        sourceSets: [{ refs: [{ type: 'note', id: 'note-1' }] }],
      },
      database,
    );

    expect(result).toEqual({ state: 'conflict', currentRevision: 5 });
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.query).toHaveBeenCalledTimes(2);
    expect(connection.release).toHaveBeenCalledOnce();
  });

  it('shadow 单调镜像允许跳过丢失 revision，但绝不覆盖更新状态', async () => {
    const connection = connectionMock();
    connection.query
      .mockResolvedValueOnce([[{ id: 'conversation-1' }]])
      .mockResolvedValueOnce([[{ revision: 2 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const database = { getConnection: vi.fn().mockResolvedValue(connection) };

    await expect(
      commitAgentConversationMutation(
        contextInput,
        {
          commitMode: 'monotonic_mirror',
          expectedRevision: 5,
          state: { discourseState: { revision: 6, activeDomain: 'note' } },
        },
        database,
      ),
    ).resolves.toMatchObject({ state: 'committed', revision: 6 });
    expect(connection.query.mock.calls[2][1].at(-1)).toBe(2);
  });

  it('在同一事务中先落新句柄，再以 expected revision 提交焦点', async () => {
    const connection = connectionMock();
    connection.query
      .mockResolvedValueOnce([[{ id: 'conversation-1' }]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }]);
    const database = { getConnection: vi.fn().mockResolvedValue(connection) };
    const sourceId = '10000000-0000-4000-8000-000000000001';
    const resultId = '10000000-0000-4000-8000-000000000002';
    const artifactId = '10000000-0000-4000-8000-000000000003';

    const result = await commitAgentConversationMutation(
      contextInput,
      {
        expectedRevision: 0,
        state: {
          discourseState: { activeDomain: 'note' },
          activeSourceSetIds: [sourceId],
          activeResultSetIds: [resultId],
          latestArtifactVersionId: artifactId,
          lastRunId: 'run-1',
        },
        sourceSets: [{ id: sourceId, runId: 'run-1', refs: [{ type: 'note', id: 'note-1' }] }],
        resultSets: [
          {
            id: resultId,
            runId: 'run-1',
            goalId: 'goal-1',
            capabilityId: 'note.query',
            refs: [{ type: 'note', id: 'note-1' }],
            metadata: { totalCount: 1, returned: 1, totalExact: true, complete: true },
          },
        ],
        artifactVersions: [
          {
            id: artifactId,
            artifactChainId: '10000000-0000-4000-8000-000000000004',
            runId: 'run-1',
            capabilityId: 'note.create',
            content: '正文',
            state: 'ready',
            sourceSetId: sourceId,
          },
        ],
      },
      database,
    );

    expect(result).toMatchObject({ state: 'committed', revision: 1 });
    expect(connection.query.mock.calls[2][0]).toContain('INSERT INTO ai_agent_source_set');
    expect(connection.query.mock.calls[3][0]).toContain('INSERT INTO ai_agent_result_set');
    expect(connection.query.mock.calls[4][0]).toContain('INSERT INTO ai_agent_artifact_version');
    expect(connection.query.mock.calls[5][0]).toContain('INSERT INTO ai_agent_conversation_state');
    expect(connection.commit).toHaveBeenCalledOnce();
  });

  it('Run 和 Artifact 状态更新都带 owner、subject、摘要与旧状态门禁', async () => {
    const connection = connectionMock();
    connection.query.mockResolvedValueOnce([[{ id: 'conversation-1' }]]).mockResolvedValueOnce([{ affectedRows: 1 }]);
    const database = {
      getConnection: vi.fn().mockResolvedValue(connection),
      query: vi.fn().mockResolvedValue([{ affectedRows: 1 }]),
    };

    await expect(
      createAgentRun(contextInput, { id: 'run-1', baseRevision: 3, status: 'running' }, database),
    ).resolves.toEqual({ id: 'run-1', status: 'running' });
    expect(connection.query.mock.calls[1][0]).toContain('INSERT INTO ai_agent_run');

    await expect(
      settleAgentRun(
        contextInput,
        'run-1',
        { status: 'completed', goalStates: [{ goalId: 'goal-1', state: 'completed' }] },
        database,
      ),
    ).resolves.toBe(true);
    expect(database.query.mock.calls[0][0]).toContain('actor_id = ? AND subject_id = ? AND owner_key_hash = ?');

    await expect(
      transitionAgentArtifactVersion(
        contextInput,
        'artifact-1',
        { state: 'committed', expectedStates: ['ready'], contentHash: 'a'.repeat(64) },
        database,
      ),
    ).resolves.toBe(true);
    expect(database.query.mock.calls[1][0]).toContain('content_hash = ? AND state IN (?)');
  });
});
