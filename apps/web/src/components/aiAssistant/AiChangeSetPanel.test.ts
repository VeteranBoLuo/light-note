import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import zhCN from '@/i18n/locales/zh-CN';

const api = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  apply: vi.fn(),
  revalidate: vi.fn(),
  retry: vi.fn(),
  update: vi.fn(),
  propose: vi.fn(),
  undo: vi.fn(),
  telemetry: vi.fn(),
  alert: vi.fn(),
  destroyAlert: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
}));

vi.mock('@/api/aiWorkspaceApi', () => ({
  listAiChangeSets: api.list,
  getAiChangeSet: api.get,
  applyAiChangeSet: api.apply,
  revalidateAiChangeSetRetry: api.revalidate,
  retryAiChangeSet: api.retry,
  updateAiChangeSet: api.update,
  proposeAiChangeSet: api.propose,
  undoAiChangeSet: api.undo,
}));
vi.mock('@/api/aiTelemetry', () => ({ recordAiProductEvent: api.telemetry }));
vi.mock('@/components/base/BasicComponents/BModal/Alert.ts', () => ({
  default: { alert: api.alert, destroy: api.destroyAlert },
}));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage.ts', () => ({
  default: { success: api.success, warning: api.warning, info: vi.fn() },
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { name: 'SvgIconStub', template: '<span aria-hidden="true"></span>' },
}));

const { default: AiChangeSetPanel } = await import('./AiChangeSetPanel.vue');

const items = [
  {
    id: 'item-1',
    order: 0,
    operation: 'update_note_metadata',
    resourceType: 'note',
    resourceId: 'note-1',
    before: { title: '旧标题一' },
    after: { title: '新标题一' },
    beforeHash: 'hash-1',
    reason: '统一标题',
    status: 'pending',
    receipt: null,
    error: null,
  },
  {
    id: 'item-2',
    order: 1,
    operation: 'update_note_metadata',
    resourceType: 'note',
    resourceId: 'note-2',
    before: { title: '旧标题二' },
    after: { title: '新标题二' },
    beforeHash: 'hash-2',
    reason: '统一标题',
    status: 'failed',
    receipt: null,
    error: { code: 'CHANGE_CONFLICT', message: '' },
  },
] as const;

const failedRetry = {
  version: 1,
  state: 'failed',
  selectedItemIds: ['item-1', 'item-2'],
  selectedCount: 2,
  processedCount: 1,
  failedItemId: 'item-2',
  errorCode: 'CHANGE_CONFLICT',
  phase: 'item_apply',
  failedAt: '2026-07-19T00:00:00.000Z',
  revalidatedAt: null,
  previewRevision: 3,
} as const;

function changeSet(overrides: Record<string, unknown> = {}) {
  return {
    id: 'set-1',
    conversationId: null,
    requestId: 'request-1',
    title: '整理项目资料',
    summary: '统一两个标题',
    status: 'draft',
    riskLevel: 'low',
    selection: null,
    previewRevision: 3,
    retry: failedRetry,
    attemptCount: 1,
    lastAttemptAt: '2026-07-19T00:00:00.000Z',
    expiresAt: '2026-07-20T00:00:00.000Z',
    appliedAt: null,
    undoneAt: null,
    createdAt: '2026-07-19T00:00:00.000Z',
    updatedAt: '2026-07-19T00:00:00.000Z',
    items: items.map((item) => ({ ...item })),
    ...overrides,
  };
}

let cleanup: (() => void) | undefined;

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
}

function findButton(host: HTMLElement, label: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find((item) =>
    item.textContent?.includes(label),
  );
  if (!button) throw new Error(`Button not found: ${label}`);
  return button;
}

function mountPanel() {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(AiChangeSetPanel);
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      messages: { 'zh-CN': zhCN },
    }),
  );
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

beforeEach(() => {
  vi.clearAllMocks();
  api.telemetry.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  document.body.innerHTML = '';
});

describe('AiChangeSetPanel atomic failed-batch retry', () => {
  it('shows zero committed, revalidates authoritative state, and retries only the server-frozen scope', async () => {
    const failed = changeSet();
    const ready = changeSet({
      previewRevision: 4,
      retry: { ...failedRetry, state: 'ready', processedCount: 0, previewRevision: 4 },
      items: items.map((item) => ({ ...item, status: 'pending', error: null })),
    });
    const applied = changeSet({
      status: 'applied',
      previewRevision: 4,
      retry: null,
      selection: ['item-1', 'item-2'],
      attemptCount: 2,
      appliedAt: '2026-07-19T00:02:00.000Z',
      items: items.map((item) => ({
        ...item,
        status: 'applied',
        error: null,
        receipt: { before: item.before, after: item.after, afterHash: `after-${item.id}` },
      })),
    });
    let resolveRetry: (value: ReturnType<typeof changeSet>) => void = () => undefined;
    const retryPromise = new Promise<ReturnType<typeof changeSet>>((resolve) => {
      resolveRetry = resolve;
    });
    api.list.mockResolvedValue({ items: [failed], total: 1 });
    api.get.mockResolvedValue(failed);
    api.revalidate.mockResolvedValue(ready);
    api.retry.mockReturnValue(retryPromise);

    const host = mountPanel();
    await flush();

    expect(host.textContent).toContain('整批事务已回滚');
    expect(host.textContent).toContain('已提交 0/2 项');
    expect(host.textContent).toContain('错误码 CHANGE_CONFLICT');
    expect(host.textContent).toContain('冻结重试范围：2 项');
    expect(findButton(host, '重新校验失败批次')).toBeTruthy();

    findButton(host, '重新校验失败批次').click();
    await flush();
    expect(api.revalidate).toHaveBeenCalledWith('set-1');
    expect(host.textContent).toContain('失败范围已重新校验');
    expect(findButton(host, '确认重试 2 项')).toBeTruthy();

    findButton(host, '确认重试 2 项').click();
    const confirmation = api.alert.mock.calls.at(-1)?.[0];
    expect(confirmation.content).toContain('整批只有全部成功才会提交');
    confirmation.footer.find((item: { type: string }) => item.type === 'primary').function();
    await flush();

    expect(api.retry).toHaveBeenCalledWith('set-1', 4);
    expect(host.textContent).toContain('正在原子执行整批变更');
    expect(host.textContent).toContain('已提交 0/2 项');

    resolveRetry(applied);
    await flush();
    expect(host.textContent).toContain('整批事务已提交');
    expect(host.textContent).toContain('已提交 2/2 项');
  });

  it('refreshes the persisted stable diagnostic after an initial atomic apply failure', async () => {
    const draft = changeSet({
      retry: null,
      attemptCount: 0,
      lastAttemptAt: null,
      items: items.map((item) => ({ ...item, status: 'pending', error: null })),
    });
    const failed = changeSet();
    api.list.mockResolvedValue({ items: [draft], total: 1 });
    api.get.mockResolvedValueOnce(draft).mockResolvedValueOnce(failed);
    api.apply.mockRejectedValue(Object.assign(new Error('CHANGE_CONFLICT'), { code: 'CHANGE_CONFLICT', status: 409 }));

    const host = mountPanel();
    await flush();
    findButton(host, '应用 2 项').click();
    const confirmation = api.alert.mock.calls.at(-1)?.[0];
    confirmation.footer.find((item: { type: string }) => item.type === 'primary').function();
    await flush();

    expect(api.apply).toHaveBeenCalledWith('set-1', ['item-1', 'item-2']);
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain('整批事务已回滚');
    expect(host.textContent).toContain('已提交 0/2 项');
    expect(host.textContent).toContain('错误码 CHANGE_CONFLICT');
    expect(host.textContent).not.toContain('执行回执');
  });
});
