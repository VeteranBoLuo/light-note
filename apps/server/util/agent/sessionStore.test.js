import { describe, expect, it, vi } from 'vitest';

const redisFocusValues = new Map();

const redis = {
  on: vi.fn(),
  get: vi.fn(async (key) => (String(key).startsWith('chat:sess:focus:') ? redisFocusValues.get(key) || null : null)),
  setEx: vi.fn().mockResolvedValue('OK'),
  eval: vi.fn(async (_script, { keys, arguments: args }) => {
    const key = keys[0];
    const current = redisFocusValues.get(key) || '';
    if (current) {
      const revision = Number(JSON.parse(current)?.discourseState?.revision || 0);
      if (revision !== Number(args[0])) return [0, current];
    }
    redisFocusValues.set(key, args[2]);
    return [1, ''];
  }),
};
vi.mock('../redisClient.js', () => ({ default: redis }));

const {
  commitSessionTurnSpec,
  getOrCreateSession,
  getSessionDiscourseProjection,
  getSessionId,
  createSessionMaterialClarification,
  recordPendingActionBatch,
  recordSessionArtifactState,
  recordSessionArtifactStateById,
  recordSessionResultSet,
  recordSessionSourceSet,
  recordTurn,
  resolveSessionSourceSet,
  resolveSessionResultSet,
  resolveSessionMaterialClarification,
  listSessionSourceSets,
  resolveSessionActionRetry,
  settleSessionResultFocus,
  settleSessionAction,
} = await import('./sessionStore.js');

describe('agent sessionStore', () => {
  it('新会话使用服务端 UUID，不接受客户端固定 ID', async () => {
    const session = await getOrCreateSession('user:u1', 'client-fixed-session');
    expect(getSessionId(session)).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27}$/i);
    expect(getSessionId(session)).not.toBe('client-fixed-session');
  });

  it('同一 owner 可续用，会话 ID 不能跨 owner 读取', async () => {
    const first = await getOrCreateSession('user:u2', '');
    const continued = await getOrCreateSession('user:u2', first.id);
    const foreign = await getOrCreateSession('user:u3', first.id);
    expect(continued.id).toBe(first.id);
    expect(foreign.id).not.toBe(first.id);
  });

  it('Redis key 包含 owner 哈希与会话 ID，记录轮次后仍写回同一命名空间', async () => {
    redis.setEx.mockClear();
    const session = await getOrCreateSession('user:u4', '');
    await recordTurn(session, '问题', '回答', []);
    await vi.waitFor(() => expect(redis.setEx).toHaveBeenCalled());
    const keys = redis.setEx.mock.calls.map((call) => call[0]);
    expect(keys.every((key) => /^chat:sess:[0-9a-f]{64}:[0-9a-f-]{36}$/i.test(key))).toBe(true);
    expect(keys.every((key) => key.endsWith(session.id))).toBe(true);
  });

  it('取消动作只能以公开参数重新准备，且成功状态不可被后到取消覆盖', async () => {
    const session = await getOrCreateSession('user:u5', '');
    await recordPendingActionBatch(session, {
      batchId: 'batch-1',
      actions: [
        {
          confirmationId: 'confirm-1',
          toolName: 'set_todo_status',
          retryArgs: { keyword: '测试待办', status: 'completed' },
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      ],
    });
    expect(resolveSessionActionRetry(session)).toMatchObject({ state: 'pending' });

    await settleSessionAction({
      ownerKey: 'user:u5',
      sessionId: session.id,
      confirmationId: 'confirm-1',
      state: 'cancelled',
    });
    expect(resolveSessionActionRetry(session)).toMatchObject({
      state: 'retryable',
      action: {
        toolName: 'set_todo_status',
        retryArgs: { keyword: '测试待办', status: 'completed' },
      },
    });

    await settleSessionAction({
      ownerKey: 'user:u5',
      sessionId: session.id,
      confirmationId: 'confirm-1',
      state: 'succeeded',
      summary: '已完成',
    });
    await settleSessionAction({
      ownerKey: 'user:u5',
      sessionId: session.id,
      confirmationId: 'confirm-1',
      state: 'cancelled',
    });
    expect(resolveSessionActionRetry(session)).toMatchObject({ state: 'succeeded' });
  });

  it('同一轮存在多个可重试动作时不猜测目标', async () => {
    const session = await getOrCreateSession('user:u6', '');
    await recordPendingActionBatch(session, {
      batchId: 'batch-2',
      actions: [
        {
          confirmationId: 'confirm-a',
          toolName: 'create_note',
          retryArgs: { title: 'A' },
          expiresAt: new Date(Date.now() - 1_000).toISOString(),
        },
        {
          confirmationId: 'confirm-b',
          toolName: 'add_tag',
          retryArgs: { tagName: 'B' },
          expiresAt: new Date(Date.now() - 1_000).toISOString(),
        },
      ],
    });
    expect(resolveSessionActionRetry(session)).toEqual({ state: 'ambiguous', count: 2 });
  });

  it('Source Set 只保存稳定引用、相同集合复用 ID，并可在当前会话解析', async () => {
    const session = await getOrCreateSession('user:source-owner', '');
    const first = await recordSessionSourceSet(session, {
      refs: [
        { type: 'note', id: 'note-1', title: '不得保存' },
        { type: 'note', id: 'note-1' },
        { type: 'user', id: 'user-1' },
      ],
      scopeRefs: [{ type: 'note_branch', id: 'branch-1', content: '不得保存' }],
      attachmentSourceIds: ['doc-1', 'doc-1'],
    });
    const reused = await recordSessionSourceSet(session, {
      refs: [{ type: 'note', id: 'note-1' }],
      scopeRefs: [{ type: 'note_branch', id: 'branch-1' }],
      attachmentSourceIds: ['doc-1'],
    });

    expect(reused.id).toBe(first.id);
    expect(listSessionSourceSets(session)).toEqual([first]);
    expect(resolveSessionSourceSet(session, first.id)).toMatchObject({
      state: 'ready',
      sourceSet: {
        refs: [{ type: 'note', id: 'note-1' }],
        scopeRefs: [{ type: 'note_branch', id: 'branch-1' }],
        attachmentSourceIds: ['doc-1'],
      },
    });
    expect(JSON.stringify(session.sourceSets)).not.toContain('不得保存');
  });

  it('Source Set ID 不能跨 owner 或跨 session 解析', async () => {
    const ownerSession = await getOrCreateSession('user:source-a', '');
    const foreignSession = await getOrCreateSession('user:source-b', '');
    const sourceSet = await recordSessionSourceSet(ownerSession, { refs: [{ type: 'note', id: 'n1' }] });

    expect(resolveSessionSourceSet(foreignSession, sourceSet.id)).toEqual({ state: 'missing' });
    expect(resolveSessionSourceSet(ownerSession, 'invalid-id')).toEqual({ state: 'missing' });
  });

  it('V3 会话只投影能力、主题纪元和稳定引用，不复制事实正文', async () => {
    const session = await getOrCreateSession('user:v3-state', '');
    const focus = await commitSessionTurnSpec(session, {
      topicEpochAction: 'advance',
      continuationMode: 'independent',
      goals: [
        {
          kind: 'read',
          capabilityId: 'bookmark.query',
          capabilityDomain: 'bookmark',
          implicit: false,
        },
      ],
    });
    const resultSet = await recordSessionResultSet(session, {
      capabilityId: 'bookmark.query',
      domains: ['bookmark'],
      refs: [{ type: 'bookmark', id: 'bookmark-1', title: '不得保存的标题', url: 'https://secret.test' }],
      focusId: focus.id,
    });
    expect(getSessionDiscourseProjection(session)).toEqual({
      schemaVersion: 3,
      revision: 2,
      topicEpoch: 1,
      activeDomain: 'bookmark',
      lastCapabilityIds: ['bookmark.query'],
      lastRunState: 'success',
      lastResultSet: { available: true, domains: ['bookmark'], refTypes: ['bookmark'], refCount: 1 },
      resultSetCandidates: [
        {
          available: true,
          domains: ['bookmark'],
          refTypes: ['bookmark'],
          refCount: 1,
          status: 'success',
        },
      ],
      pendingArtifact: null,
      unresolvedReference: false,
    });
    expect(resolveSessionResultSet(session, { id: resultSet.id })).toMatchObject({
      state: 'ready',
      refs: [{ type: 'bookmark', id: 'bookmark-1' }],
    });
    expect(JSON.stringify(session.resultSets)).not.toContain('不得保存');
    expect(JSON.stringify(session.resultSets)).not.toContain('secret.test');
  });

  it('新读取轮失败时保留旧的已提交 ResultSet 焦点', async () => {
    const session = await getOrCreateSession('user:v3-focus-two-phase', '');
    const previousFocus = await commitSessionTurnSpec(session, {
      topicEpochAction: 'advance',
      continuationMode: 'independent',
      goals: [{ kind: 'read', capabilityId: 'bookmark.query', capabilityDomain: 'bookmark', implicit: false }],
    });
    const previous = await recordSessionResultSet(session, {
      capabilityId: 'bookmark.query',
      domains: ['bookmark'],
      refs: [{ type: 'bookmark', id: 'bookmark-old' }],
      focusId: previousFocus.id,
    });

    const nextFocus = await commitSessionTurnSpec(session, {
      topicEpochAction: 'advance',
      continuationMode: 'independent',
      goals: [{ kind: 'read', capabilityId: 'note.query', capabilityDomain: 'note', implicit: false }],
    });
    expect(resolveSessionResultSet(session)).toMatchObject({
      state: 'ready',
      resultSet: { id: previous.id, capabilityId: 'bookmark.query' },
    });

    await recordSessionResultSet(session, {
      capabilityId: 'note.query',
      domains: ['note'],
      refs: [],
      status: 'error',
      focusId: nextFocus.id,
    });
    expect(resolveSessionResultSet(session)).toMatchObject({
      state: 'ready',
      resultSet: { id: previous.id, capabilityId: 'bookmark.query' },
    });
    expect(getSessionDiscourseProjection(session)).toMatchObject({
      activeDomain: 'bookmark',
      lastCapabilityIds: ['bookmark.query'],
      lastRunState: 'failed',
      lastResultSet: { refTypes: ['bookmark'], refCount: 1 },
    });
  });

  it('同一轮多个结果集不默认取最后一个，可按资源类型确定性消歧', async () => {
    const session = await getOrCreateSession('user:v3-result-ambiguity', '');
    const focus = await commitSessionTurnSpec(session, {
      topicEpochAction: 'advance',
      continuationMode: 'independent',
      goals: [
        { kind: 'read', capabilityId: 'bookmark.query', capabilityDomain: 'bookmark', implicit: false },
        { kind: 'read', capabilityId: 'note.query', capabilityDomain: 'note', implicit: false },
      ],
    });
    await recordSessionResultSet(session, {
      capabilityId: 'bookmark.query',
      domains: ['bookmark'],
      refs: [{ type: 'bookmark', id: 'bookmark-1' }],
      focusId: focus.id,
    });
    await recordSessionResultSet(session, {
      capabilityId: 'note.query',
      domains: ['note'],
      refs: [{ type: 'note', id: 'note-1' }],
      focusId: focus.id,
    });

    expect(resolveSessionResultSet(session)).toEqual({ state: 'ambiguous', count: 2, refs: [] });
    expect(resolveSessionResultSet(session, { types: ['bookmark'] })).toMatchObject({
      state: 'ready',
      refs: [{ type: 'bookmark', id: 'bookmark-1' }],
    });
    expect(getSessionDiscourseProjection(session)).toMatchObject({
      lastResultSet: null,
      resultSetCandidates: [
        { domains: ['bookmark'], refTypes: ['bookmark'] },
        { domains: ['note'], refTypes: ['note'] },
      ],
    });
  });

  it('ResultSet 引用类型遵循统一命名契约，不需要为新业务类型修改白名单', async () => {
    const session = await getOrCreateSession('user:v3-generic-result-ref', '');
    const resultSet = await recordSessionResultSet(session, {
      capabilityId: 'future.query',
      domains: ['future_domain'],
      refs: [
        { type: 'future_resource', id: 'future-1' },
        { type: 'Invalid Type', id: 'ignored' },
      ],
    });

    expect(resultSet).toMatchObject({ refTypes: ['future_resource'], refCount: 1 });
    expect(resolveSessionResultSet(session, { id: resultSet.id })).toMatchObject({
      state: 'ready',
      refs: [{ type: 'future_resource', id: 'future-1' }],
    });
  });

  it('并发读取采用 latest-run-wins，旧轮结果和结算不能串改新轮焦点', async () => {
    const session = await getOrCreateSession('user:v3-concurrent-focus', '');
    const bookmarkFocus = await commitSessionTurnSpec(session, {
      topicEpochAction: 'advance',
      continuationMode: 'independent',
      goals: [{ kind: 'read', capabilityId: 'bookmark.query', capabilityDomain: 'bookmark', implicit: false }],
    });
    const noteFocus = await commitSessionTurnSpec(session, {
      topicEpochAction: 'advance',
      continuationMode: 'independent',
      goals: [{ kind: 'read', capabilityId: 'note.query', capabilityDomain: 'note', implicit: false }],
    });

    await expect(
      recordSessionResultSet(session, {
        capabilityId: 'bookmark.query',
        domains: ['bookmark'],
        refs: [{ type: 'bookmark', id: 'stale-bookmark' }],
        focusId: bookmarkFocus.id,
      }),
    ).resolves.toBeNull();
    await expect(
      settleSessionResultFocus(session, { status: 'failed', focusId: bookmarkFocus.id }),
    ).resolves.toBe(false);

    await expect(
      recordSessionResultSet(session, {
        capabilityId: 'note.query',
        domains: ['note'],
        refs: [{ type: 'note', id: 'current-note' }],
        focusId: noteFocus.id,
      }),
    ).resolves.toMatchObject({ capabilityId: 'note.query', refTypes: ['note'] });
    expect(getSessionDiscourseProjection(session)).toMatchObject({
      activeDomain: 'note',
      lastCapabilityIds: ['note.query'],
      lastRunState: 'success',
      resultSetCandidates: [{ domains: ['note'], refTypes: ['note'], refCount: 1 }],
    });
    expect(JSON.stringify(session.resultSets)).not.toContain('stale-bookmark');
  });

  it('同一 revision 的并发提交通过 Redis CAS 重试收敛到唯一最新读轮', async () => {
    const session = await getOrCreateSession('user:v3-concurrent-cas', '');
    const [bookmarkFocus, noteFocus] = await Promise.all([
      commitSessionTurnSpec(session, {
        topicEpochAction: 'advance',
        continuationMode: 'independent',
        goals: [{ kind: 'read', capabilityId: 'bookmark.query', capabilityDomain: 'bookmark', implicit: false }],
      }),
      commitSessionTurnSpec(session, {
        topicEpochAction: 'advance',
        continuationMode: 'independent',
        goals: [{ kind: 'read', capabilityId: 'note.query', capabilityDomain: 'note', implicit: false }],
      }),
    ]);
    const currentFocus = [bookmarkFocus, noteFocus].find(
      (focus) => focus.id === session.discourseState.pendingFocus?.id,
    );
    const staleFocus = [bookmarkFocus, noteFocus].find((focus) => focus.id !== currentFocus?.id);

    expect(currentFocus).toBeTruthy();
    expect(staleFocus).toBeTruthy();
    await expect(
      recordSessionResultSet(session, {
        capabilityId: 'stale.query',
        domains: ['content'],
        refs: [{ type: 'note', id: 'stale' }],
        focusId: staleFocus.id,
      }),
    ).resolves.toBeNull();
    await expect(
      recordSessionResultSet(session, {
        capabilityId: 'current.query',
        domains: ['content'],
        refs: [{ type: 'note', id: 'current' }],
        focusId: currentFocus.id,
      }),
    ).resolves.toMatchObject({ refCount: 1 });
    expect(JSON.stringify(session.resultSets)).not.toContain('"id":"stale"');
  });

  it('真实读取成功但没有可投影引用时提交本轮语义，并清除旧资源焦点', async () => {
    const session = await getOrCreateSession('user:v3-success-without-resultset', '');
    const bookmarkFocus = await commitSessionTurnSpec(session, {
      topicEpochAction: 'advance',
      continuationMode: 'independent',
      goals: [{ kind: 'read', capabilityId: 'bookmark.query', capabilityDomain: 'bookmark', implicit: false }],
    });
    await recordSessionResultSet(session, {
      capabilityId: 'bookmark.query',
      domains: ['bookmark'],
      refs: [{ type: 'bookmark', id: 'bookmark-old' }],
      focusId: bookmarkFocus.id,
    });

    const statsFocus = await commitSessionTurnSpec(session, {
      topicEpochAction: 'advance',
      continuationMode: 'independent',
      goals: [{ kind: 'read', capabilityId: 'admin.stats.read', capabilityDomain: 'admin', implicit: false }],
    });
    await expect(
      settleSessionResultFocus(session, { status: 'success', focusId: statsFocus.id }),
    ).resolves.toBe(true);

    expect(resolveSessionResultSet(session)).toEqual({ state: 'missing', refs: [] });
    expect(getSessionDiscourseProjection(session)).toMatchObject({
      activeDomain: 'admin',
      lastCapabilityIds: ['admin.stats.read'],
      lastRunState: 'success',
      lastResultSet: null,
      resultSetCandidates: [],
    });
  });

  it('待确认产物和确认状态分离存储，确认后不再作为可继续修改的 pending artifact', async () => {
    const session = await getOrCreateSession('user:v3-artifact', '');
    await recordPendingActionBatch(session, {
      batchId: 'artifact-batch',
      actions: [
        {
          confirmationId: 'confirm-artifact',
          toolName: 'create_note',
          retryArgs: {},
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      ],
    });
    await recordSessionArtifactState(session, {
      id: 'confirm-artifact',
      capabilityId: 'note.create',
      domain: 'note',
      state: 'pending',
    });
    expect(getSessionDiscourseProjection(session).pendingArtifact).toMatchObject({ available: true, state: 'pending' });
    const revisionBeforeSettlement = getSessionDiscourseProjection(session).revision;
    await settleSessionAction({
      ownerKey: 'user:v3-artifact',
      sessionId: session.id,
      confirmationId: 'confirm-artifact',
      state: 'succeeded',
    });
    expect(getSessionDiscourseProjection(session).pendingArtifact).toBeNull();
    expect(getSessionDiscourseProjection(session).revision).toBe(revisionBeforeSettlement + 1);
  });

  it('可通过 owner/session 绑定替换当前产物，且不会为未知会话创建状态', async () => {
    const session = await getOrCreateSession('user:v3-artifact-replacement', '');
    await recordSessionArtifactState(session, {
      id: 'artifact-old',
      capabilityId: 'note.create',
      domain: 'note',
    });

    await expect(
      recordSessionArtifactStateById({
        ownerKey: 'user:v3-artifact-replacement',
        sessionId: session.id,
        artifact: { id: 'artifact-new', capabilityId: 'note.create', domain: 'note' },
      }),
    ).resolves.toBe(true);
    expect(session.discourseState.pendingArtifactId).toBe('artifact-new');
    await expect(
      recordSessionArtifactStateById({
        ownerKey: 'user:foreign',
        sessionId: session.id,
        artifact: { id: 'artifact-foreign', capabilityId: 'note.create', domain: 'note' },
      }),
    ).resolves.toBe(false);
    expect(session.artifactStates.some((item) => item.id === 'artifact-foreign')).toBe(false);
  });

  it('旧产物结算不清除另一张待确认卡，结果未知也不能继续作为 pending artifact', async () => {
    const ownerKey = 'user:v3-artifact-terminal-state';
    const session = await getOrCreateSession(ownerKey, '');
    await recordPendingActionBatch(session, {
      batchId: 'artifact-terminal-batch',
      actions: [
        { confirmationId: 'artifact-old', toolName: 'create_note', retryArgs: {} },
        { confirmationId: 'artifact-current', toolName: 'create_note', retryArgs: {} },
      ],
    });
    await recordSessionArtifactState(session, {
      id: 'artifact-old',
      capabilityId: 'note.create',
      domain: 'note',
    });
    await recordSessionArtifactState(session, {
      id: 'artifact-current',
      capabilityId: 'note.create',
      domain: 'note',
    });

    await recordSessionArtifactState(session, {
      id: 'artifact-old',
      capabilityId: 'note.create',
      domain: 'note',
      state: 'cancelled',
    });
    expect(session.discourseState.pendingArtifactId).toBe('artifact-current');

    await settleSessionAction({
      ownerKey,
      sessionId: session.id,
      confirmationId: 'artifact-current',
      state: 'unknown',
    });
    expect(session.artifactStates.find((item) => item.id === 'artifact-current')?.state).toBe('unknown');
    expect(getSessionDiscourseProjection(session).pendingArtifact).toBeNull();
  });

  it('幂等结算也会修复指向已终态产物的陈旧 pending 指针', async () => {
    const ownerKey = 'user:v3-artifact-stale-pointer';
    const session = await getOrCreateSession(ownerKey, '');
    await recordPendingActionBatch(session, {
      batchId: 'artifact-stale-pointer-batch',
      actions: [{ confirmationId: 'artifact-stale', toolName: 'create_note', retryArgs: {} }],
    });
    await recordSessionArtifactState(session, {
      id: 'artifact-stale',
      capabilityId: 'note.create',
      domain: 'note',
    });
    session.artifactStates.find((item) => item.id === 'artifact-stale').state = 'confirmed';
    const revisionBeforeSettlement = getSessionDiscourseProjection(session).revision;

    await settleSessionAction({
      ownerKey,
      sessionId: session.id,
      confirmationId: 'artifact-stale',
      state: 'succeeded',
    });

    expect(getSessionDiscourseProjection(session).pendingArtifact).toBeNull();
    expect(getSessionDiscourseProjection(session).revision).toBe(revisionBeforeSettlement + 1);
  });

  it('ClarificationState 不公开 Source Set ID，并由下一轮确定性填充单组或多组', async () => {
    const session = await getOrCreateSession('user:clarification', '');
    const first = await recordSessionSourceSet(session, { refs: [{ type: 'note', id: 'n1' }] });
    const second = await recordSessionSourceSet(session, { refs: [{ type: 'note', id: 'n2' }] });
    const clarification = await createSessionMaterialClarification(session, {
      originalMessage: '把这些对比一下',
      sourceSetIds: [second.id, first.id],
    });

    expect(clarification.options).toHaveLength(2);
    expect(JSON.stringify(clarification)).not.toContain(first.id);
    expect(JSON.stringify(clarification)).not.toContain(second.id);
    expect(await resolveSessionMaterialClarification(session, clarification.token, '哪一个都行')).toMatchObject({
      state: 'pending',
    });
    expect(await resolveSessionMaterialClarification(session, clarification.token, '两组都用')).toEqual({
      state: 'ready',
      originalMessage: '把这些对比一下',
      selectedSourceSetIds: [second.id, first.id],
    });
    expect(await resolveSessionMaterialClarification(session, clarification.token, '最近一组')).toEqual({
      state: 'missing',
    });
  });
});
