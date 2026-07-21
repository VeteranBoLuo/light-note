import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import useAiAssistantStore, {
  buildAiAssistantDomainKey,
  createAiAssistantMaterialSnapshot,
  resolveAiAssistantRequestEdgeStatus,
  resolveAiAssistantIdentity,
  type AiAssistantIdentity,
} from './aiAssistant';

const identity = (
  actorUserId: string,
  subjectUserId: string,
  adminContextMode: AiAssistantIdentity['adminContextMode'] = 'maintain',
  adminContextId = `${subjectUserId}-context`,
): AiAssistantIdentity => ({ actorUserId, subjectUserId, adminContextMode, adminContextId });

describe('aiAssistant store', () => {
  beforeEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it('用 actor、subject、adminContextMode、adminContextId 四维键隔离会话', () => {
    const self = resolveAiAssistantIdentity({ id: 'root-user', adminContext: null });
    const readonlyA = resolveAiAssistantIdentity({
      id: 'root-user',
      adminContext: { id: 'ctx-a', subjectUserId: 'user-a', mode: 'readonly' },
    });
    const maintainA = resolveAiAssistantIdentity({
      id: 'root-user',
      adminContext: { id: 'ctx-b', subjectUserId: 'user-a', mode: 'maintain' },
    });
    const maintainB = resolveAiAssistantIdentity({
      id: 'root-user',
      adminContext: { id: 'ctx-c', subjectUserId: 'user-b', mode: 'maintain' },
    });
    const maintainASecondContext = resolveAiAssistantIdentity({
      id: 'root-user',
      adminContext: { id: 'ctx-d', subjectUserId: 'user-a', mode: 'maintain' },
    });

    expect(
      new Set([self, readonlyA, maintainA, maintainB, maintainASecondContext].map(buildAiAssistantDomainKey)).size,
    ).toBe(5);
    expect(self).toMatchObject({
      actorUserId: 'root-user',
      subjectUserId: 'root-user',
      adminContextMode: 'self',
    });
  });

  it('A→B→A 恢复各自草稿、材料、消息与滚动位置且不串线', () => {
    const store = useAiAssistantStore();
    const subjectA = identity('root-user', 'user-a');
    const subjectB = identity('root-user', 'user-b');

    store.switchConversation(subjectA, '你好');
    store.draft = 'A 的草稿';
    store.contextRefs = [{ type: 'note', id: 'note-a', title: 'A 的笔记' }];
    store.scopeMode = 'workspace';
    store.attachmentRefs = [
      {
        id: 'attachment-a',
        sourceType: 'cloud',
        fileId: 'file-a',
        fileName: 'A.pdf',
        fileType: 'application/pdf',
        fileSize: 10,
        status: 'ready',
      },
    ];
    store.messages.push({
      id: 'user-message-a',
      role: 'user',
      content: '只属于 A',
      timestamp: new Date('2026-07-19T00:00:00.000Z'),
    });
    store.messages.push({
      id: 'assistant-memory-a',
      role: 'assistant',
      content: '只属于 A 的回答',
      timestamp: new Date('2026-07-19T00:00:01.000Z'),
      activity: [
        {
          event: 'memory_context',
          status: 'used',
          count: 1,
          types: ['preference'],
          scopes: ['global'],
          memoryId: 'memory-a-secret-id',
          content: 'A 的记忆正文',
        },
      ],
    });
    store.scrollTop = 321;

    store.switchConversation(subjectB, '你好');
    expect(store.draft).toBe('');
    expect(store.messages.some((item) => item.content.includes('只属于 A'))).toBe(false);
    store.draft = 'B 的草稿';
    store.messages.push({
      id: 'user-message-b',
      role: 'user',
      content: '只属于 B',
      timestamp: new Date('2026-07-19T00:01:00.000Z'),
    });

    store.switchConversation(subjectA, '你好');
    expect(store.draft).toBe('A 的草稿');
    expect(store.contextRefs).toEqual([{ type: 'note', id: 'note-a', title: 'A 的笔记' }]);
    expect(store.attachmentRefs[0]?.id).toBe('attachment-a');
    expect(store.scrollTop).toBe(321);
    expect(store.scopeMode).toBe('workspace');
    expect(store.messages.some((item) => item.content === '只属于 A')).toBe(true);
    expect(store.messages.some((item) => item.content === '只属于 B')).toBe(false);
    expect(store.messages.find((item) => item.id === 'assistant-memory-a')?.activity).toEqual([
      { event: 'memory_context', status: 'used', count: 1, types: ['preference'], scopes: ['global'] },
    ]);
    expect(JSON.stringify(store.messages)).not.toContain('memory-a-secret-id');
    expect(JSON.stringify(store.messages)).not.toContain('A 的记忆正文');

    store.switchConversation(subjectB, '你好');
    expect(store.draft).toBe('B 的草稿');
    expect(store.scopeMode).toBe('workspace');
    expect(store.messages.some((item) => item.content === '只属于 B')).toBe(true);
    expect(store.messages.some((item) => item.content === '只属于 A')).toBe(false);
    expect(store.messages.some((item) => item.id === 'assistant-memory-a')).toBe(false);
  });

  it('管理员上下文切换会中止旧请求，旧 lease 无权写入新主体', () => {
    const store = useAiAssistantStore();
    const subjectA = identity('root-user', 'user-a');
    const subjectB = identity('root-user', 'user-b');
    store.switchConversation(subjectA, '你好');
    store.messages.push({
      id: 'assistant-a',
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    });
    const leaseA = store.beginRequest('assistant-a');
    expect(store.isRequestCurrent(leaseA)).toBe(true);

    store.switchConversation(subjectB, '你好');

    expect(leaseA.controller.signal.aborted).toBe(true);
    expect(store.isRequestCurrent(leaseA)).toBe(false);
    if (store.isRequestCurrent(leaseA)) {
      store.messages.push({
        id: 'stale-write',
        role: 'assistant',
        content: '不应出现',
        timestamp: new Date(),
      });
    }
    expect(store.messages.some((item) => item.id === 'stale-write')).toBe(false);
    expect(store.isLoading).toBe(false);
  });

  it('同一主体和模式切换授权上下文时不恢复旧材料，且旧 context lease 立即失效', () => {
    const store = useAiAssistantStore();
    const firstContext = identity('root-user', 'user-a', 'maintain', 'context-1');
    const renewedContext = identity('root-user', 'user-a', 'maintain', 'context-2');
    store.switchConversation(firstContext, '你好');
    store.draft = '续期前草稿';
    store.messages.push({ id: 'assistant-a', role: 'assistant', content: '已有回答', timestamp: new Date() });
    const lease = store.beginRequest('assistant-a');

    store.switchConversation(renewedContext, '你好');

    expect(store.draft).toBe('');
    expect(store.messages.some((item) => item.content === '已有回答')).toBe(false);
    expect(store.isRequestCurrent(lease)).toBe(false);
    expect(lease.controller.signal.aborted).toBe(true);

    store.switchConversation(firstContext, '你好');
    expect(store.draft).toBe('续期前草稿');
    expect(store.messages.some((item) => item.content === '已有回答')).toBe(true);
  });

  it('只为普通自有账号迁移旧 v2 三维状态，管理员上下文不会复用旧授权数据', () => {
    const self = identity('user-1', 'user-1', 'self', '');
    const legacyKey = 'ai-assistant-state:v2:user-1:user-1:self';
    localStorage.setItem(
      legacyKey,
      JSON.stringify({
        version: 2,
        identity: { actorUserId: 'user-1', subjectUserId: 'user-1', adminContextMode: 'self' },
        draft: '可安全迁移的自有草稿',
        contextRefs: [],
        attachmentRefs: [],
        messages: [],
        scrollTop: 0,
        shouldFollowMessages: true,
        showScrollToBottom: false,
        sessionId: '',
        conversationId: '',
        longChatHinted: false,
        scopeMode: 'selected',
        temporarySession: false,
        savedAt: '2026-07-19T00:00:00.000Z',
      }),
    );

    const store = useAiAssistantStore();
    store.switchConversation(self, '你好');
    expect(store.draft).toBe('可安全迁移的自有草稿');
    expect(localStorage.getItem(legacyKey)).toBeNull();
    expect(localStorage.getItem(buildAiAssistantDomainKey(self))).toContain('可安全迁移的自有草稿');

    const admin = identity('root-user', 'user-1', 'maintain', 'new-context');
    localStorage.setItem(
      'ai-assistant-state:v2:root-user:user-1:maintain',
      JSON.stringify({ version: 2, draft: '不应恢复的管理员草稿' }),
    );
    store.switchConversation(admin, '你好');
    expect(store.draft).toBe('');
  });

  it('用户消息材料快照与后续编辑隔离，持久化后仍可原样重放', () => {
    const contexts = [{ type: 'note' as const, id: 'note-1', title: '原笔记' }];
    const attachments = [
      {
        id: 'attachment-1',
        sourceType: 'cloud' as const,
        fileId: 'file-1',
        fileName: '原文件.pdf',
        fileType: 'application/pdf',
        fileSize: 100,
        status: 'ready' as const,
      },
    ];
    const snapshot = createAiAssistantMaterialSnapshot(contexts, attachments);
    contexts[0].title = '已修改';
    attachments[0].fileName = '已替换.pdf';

    expect(Object.isFrozen(snapshot.contextRefs)).toBe(true);
    expect(Object.isFrozen(snapshot.attachmentRefs[0])).toBe(true);
    expect(snapshot.contextRefs[0].title).toBe('原笔记');
    expect(snapshot.attachmentRefs[0].fileName).toBe('原文件.pdf');

    const store = useAiAssistantStore();
    const subjectA = identity('root-user', 'user-a');
    const subjectB = identity('root-user', 'user-b');
    store.switchConversation(subjectA, '你好');
    store.messages.push({
      id: 'snapshot-message',
      role: 'user',
      content: '按原材料回答',
      timestamp: new Date(),
      contexts: snapshot.contextRefs,
      contextRefs: snapshot.contextRefs,
      attachmentRefs: snapshot.attachmentRefs,
    });
    store.switchConversation(subjectB, '你好');
    store.switchConversation(subjectA, '你好');

    const restored = store.messages.find((item) => item.id === 'snapshot-message');
    expect(restored?.contextRefs?.[0].title).toBe('原笔记');
    expect(restored?.attachmentRefs?.[0].fileName).toBe('原文件.pdf');
  });

  it('持久化草稿和安全材料，但不落确认 token 与运行中状态', () => {
    const store = useAiAssistantStore();
    const subjectA = identity('root-user', 'user-a');
    store.switchConversation(subjectA, '你好');
    store.draft = '待发送';
    store.messages.push({
      id: 'settled-assistant',
      role: 'assistant',
      content: '操作完成',
      timestamp: new Date(),
      confirmations: [{ token: 'TOP_SECRET_TOKEN' } as any],
    });
    store.isLoading = true;
    store.persistCurrentConversation();

    const raw = localStorage.getItem(buildAiAssistantDomainKey(subjectA)) || '';
    expect(raw).toContain('待发送');
    expect(raw).not.toContain('TOP_SECRET_TOKEN');
    expect(raw).not.toContain('isLoading');
  });

  it('保留由权威终态快照恢复的标记与终态元数据', () => {
    const store = useAiAssistantStore();
    const subjectA = identity('root-user', 'user-a');
    const subjectB = identity('root-user', 'user-b');
    store.switchConversation(subjectA, '你好');
    store.messages.push({
      id: 'recovered-assistant',
      role: 'assistant',
      content: '恢复后的完整回答',
      timestamp: new Date(),
      recovered: true,
      stage: 'completed',
      terminal: {
        status: 'completed',
        eventId: 8,
        error: null,
        message: null,
        at: '2026-07-19T00:00:01.000Z',
      },
    });

    store.switchConversation(subjectB, '你好');
    store.switchConversation(subjectA, '你好');

    expect(store.messages.find((item) => item.id === 'recovered-assistant')).toMatchObject({
      recovered: true,
      stage: 'completed',
      terminal: { status: 'completed', eventId: 8 },
    });
  });

  it('Pinia 状态变化会在节流窗口后自动写入当前会话域', async () => {
    vi.useFakeTimers();
    const store = useAiAssistantStore();
    const subjectA = identity('root-user', 'user-a');
    store.switchConversation(subjectA, '你好');
    store.initializePersistence();

    store.draft = '自动保存草稿';
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(410);

    const raw = localStorage.getItem(buildAiAssistantDomainKey(subjectA)) || '';
    expect(raw).toContain('自动保存草稿');
  });

  it('localStorage 不可写时仍以页面内缓存完成 A→B→A 恢复', () => {
    const store = useAiAssistantStore();
    const subjectA = identity('root-user', 'user-a');
    const subjectB = identity('root-user', 'user-b');
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    store.switchConversation(subjectA, '你好');
    store.draft = '仅内存保存的 A 草稿';
    store.switchConversation(subjectB, '你好');
    store.switchConversation(subjectA, '你好');

    expect(store.draft).toBe('仅内存保存的 A 草稿');
    setItem.mockRestore();
  });

  it('请求生命周期只写入有限边缘状态，并在刷新后恢复可靠终态', () => {
    const subjectA = identity('root-user', 'user-a');
    const store = useAiAssistantStore();
    store.switchConversation(subjectA, '你好');

    const lease = store.beginRequest('assistant-edge-status');
    expect(store.edgeStatus).toBe('generating');
    expect(store.isLoading).toBe(true);
    expect(JSON.parse(localStorage.getItem(buildAiAssistantDomainKey(subjectA)) || '{}').edgeStatus).toBe('generating');

    expect(store.finishRequest(lease, resolveAiAssistantRequestEdgeStatus('completed', false))).toBe(true);
    expect(store.edgeStatus).toBe('completed');
    expect(store.isLoading).toBe(false);

    setActivePinia(createPinia());
    const restored = useAiAssistantStore();
    restored.switchConversation(subjectA, '你好');
    expect(restored.edgeStatus).toBe('completed');
    expect(restored.acknowledgeEdgeStatus()).toBe(true);
    expect(restored.edgeStatus).toBe('idle');
  });

  it('需要处理与失败状态随 owner 四维域隔离，旧 lease 不能污染新身份', () => {
    const store = useAiAssistantStore();
    const firstContext = identity('root-user', 'user-a', 'maintain', 'context-1');
    const secondContext = identity('root-user', 'user-a', 'maintain', 'context-2');

    store.switchConversation(firstContext, '你好');
    const staleLease = store.beginRequest('assistant-a');
    store.switchConversation(secondContext, '你好');
    expect(store.edgeStatus).toBe('idle');
    expect(store.finishRequest(staleLease, 'failed')).toBe(false);
    expect(store.edgeStatus).toBe('idle');

    store.markEdgeNeedsAttention();
    expect(store.edgeStatus).toBe('needs_attention');
    store.switchConversation(firstContext, '你好');
    expect(store.edgeStatus).toBe('idle');
    store.switchConversation(secondContext, '你好');
    expect(store.edgeStatus).toBe('needs_attention');
  });

  it('主动停止回到空闲态且不会误报失败，生成态也不能被提前确认', () => {
    const store = useAiAssistantStore();
    store.switchConversation(identity('root-user', 'user-a'), '你好');
    store.beginRequest('assistant-stop');

    expect(store.acknowledgeEdgeStatus()).toBe(false);
    expect(store.edgeStatus).toBe('generating');
    store.abortActiveRequest();
    expect(store.edgeStatus).toBe('idle');
    expect(store.edgeStatus).not.toBe('failed');
  });

  it('刷新导致控制器丢失时把遗留生成态恢复为失败，不永久伪装后台仍在运行', () => {
    const subjectA = identity('root-user', 'user-a');
    const store = useAiAssistantStore();
    store.switchConversation(subjectA, '你好');
    store.beginRequest('assistant-interrupted');

    setActivePinia(createPinia());
    const restored = useAiAssistantStore();
    restored.switchConversation(subjectA, '你好');
    expect(restored.edgeStatus).toBe('failed');
    expect(restored.isLoading).toBe(false);
  });

  it('可靠终态按失败和待确认分流，停止永远不映射成失败', () => {
    expect(resolveAiAssistantRequestEdgeStatus('completed', false)).toBe('completed');
    expect(resolveAiAssistantRequestEdgeStatus('completed', true)).toBe('needs_attention');
    expect(resolveAiAssistantRequestEdgeStatus('failed', true)).toBe('failed');
    expect(resolveAiAssistantRequestEdgeStatus('stopped', true)).toBe('idle');
  });
});
