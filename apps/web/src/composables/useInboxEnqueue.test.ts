import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enqueue: vi.fn(),
  complete: vi.fn(),
  batchAdd: vi.fn(),
  refresh: vi.fn(),
  record: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  guard: vi.fn(),
}));
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string, params?: { count: number }) => `${key}${params ? `:${params.count}` : ''}` }),
}));
vi.mock('@/api/inboxApi', () => ({ enqueueInbox: mocks.enqueue, completeInbox: mocks.complete }));
vi.mock('@/api/search', () => ({ batchAddSearchResourcesToInbox: mocks.batchAdd }));
vi.mock('@/api/commonApi', () => ({ recordOperation: mocks.record }));
vi.mock('@/store', () => ({ inboxStore: () => ({ refreshCount: mocks.refresh }) }));
vi.mock('@/composables/useGuestGuard', () => ({ blockGuestWrite: mocks.guard }));
vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: { success: mocks.success, error: mocks.error, warning: mocks.warning },
}));
import { useInboxEnqueue } from './useInboxEnqueue';

const files = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ resourceType: 'file' as const, resourceId: String(i + 1) }));
beforeEach(() => {
  vi.resetAllMocks();
  mocks.guard.mockReturnValue(false);
  mocks.refresh.mockResolvedValue(true);
});

describe('待整理批量写入', () => {
  it('超过 50 项加入时使用既有批量入口，不拆请求或截断范围', async () => {
    mocks.batchAdd.mockResolvedValue({ status: 200, data: { added: 20, reopened: 4, ignored: 48 } });
    expect(await useInboxEnqueue().addResourcesToInbox(files(72), '云空间')).toBe(true);
    expect(mocks.batchAdd).toHaveBeenCalledExactlyOnceWith(
      {
        mode: 'explicit',
        items: files(72).map((item) => ({ id: item.resourceId, type: 'file' })),
      },
      { silent: true },
    );
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.success).toHaveBeenCalledWith('inbox.addedCount:24');
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it('小批量沿用直接加入接口', async () => {
    mocks.enqueue.mockResolvedValue({ status: 200, data: { added: 50 } });
    expect(await useInboxEnqueue().addResourcesToInbox(files(50), '云空间')).toBe(true);
    expect(mocks.enqueue).toHaveBeenCalledExactlyOnceWith(files(50), 'manual', { silent: true });
    expect(mocks.batchAdd).not.toHaveBeenCalled();
  });

  it('72 项混合状态完成时只发一次完整请求，并报告实际完成数量', async () => {
    mocks.complete.mockResolvedValue({ status: 200, data: { completed: 48 } });
    expect(await useInboxEnqueue().removeResourcesFromInbox(files(72), '云空间')).toBe(true);
    expect(mocks.complete).toHaveBeenCalledExactlyOnceWith(files(72), { silent: true });
    expect(mocks.success).toHaveBeenCalledWith('inbox.completedCount:48');
    expect(mocks.record).toHaveBeenCalledExactlyOnceWith({ module: '云空间', operation: '取消待整理【48项】' });
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it('无待整理项时明确反馈零变更，不记录成功操作', async () => {
    mocks.complete.mockResolvedValue({ status: 200, data: { completed: 0 } });
    expect(await useInboxEnqueue().removeResourcesFromInbox(files(72), '云空间')).toBe(true);
    expect(mocks.success).toHaveBeenCalledWith('inbox.nothingPending');
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it('写入失败时不报成功、不刷新计数', async () => {
    mocks.complete.mockResolvedValue({ status: 500, msg: '无法完成' });
    expect(await useInboxEnqueue().removeResourcesFromInbox(files(72), '云空间')).toBe(false);
    expect(mocks.error).toHaveBeenCalledWith('无法完成');
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it.each(['add', 'complete'])('会话变化后忽略 %s 的迟到回执及反馈', async (action) => {
    let resolve!: (value: unknown) => void;
    const response = new Promise((done) => {
      resolve = done;
    });
    mocks.batchAdd.mockReturnValue(response);
    mocks.complete.mockReturnValue(response);
    let current = true;
    const helper = useInboxEnqueue();
    const result = (action === 'add' ? helper.addResourcesToInbox : helper.removeResourcesFromInbox)(
      files(72),
      '云空间',
      () => current,
    );
    current = false;
    resolve({ status: 200, data: { added: 72, completed: 48 } });
    expect(await result).toBe(false);
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.record).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('游客写入在发送请求前被阻止', async () => {
    mocks.guard.mockReturnValue(true);
    const helper = useInboxEnqueue();
    expect(await helper.addResourcesToInbox(files(72), '云空间')).toBe(false);
    expect(await helper.removeResourcesFromInbox(files(72), '云空间')).toBe(false);
    expect(mocks.batchAdd).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
  });
});
