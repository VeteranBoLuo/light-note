import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiBasePost = vi.fn();

vi.mock('@/http/request', () => ({ apiBasePost }));

const { buildNoteDetailRequestScope, clearNoteDetailPrefetch, consumeNoteDetail, prefetchNoteDetail } = await import(
  './noteDetailPrefetch'
);

describe('noteDetailPrefetch', () => {
  beforeEach(() => {
    clearNoteDetailPrefetch();
    apiBasePost.mockReset();
  });

  it('点击预取与详情消费复用同一个在途请求', async () => {
    const response = { status: 200, msg: '', data: { id: 'note-1' } };
    apiBasePost.mockResolvedValue(response);
    const identity = { id: 'user-1', role: 'user' };

    const prefetched = prefetchNoteDetail(identity, 'note-1');
    const consumed = consumeNoteDetail(identity, 'note-1');

    await expect(prefetched).resolves.toBe(response);
    await expect(consumed).resolves.toBe(response);
    expect(apiBasePost).toHaveBeenCalledTimes(1);
    expect(apiBasePost).toHaveBeenCalledWith(
      '/api/note/getNoteDetail',
      { id: 'note-1' },
      { silent: true, timeout: 15_000 },
    );
  });

  it('不同账号与管理员上下文不会复用正文缓存', async () => {
    apiBasePost.mockResolvedValue({ status: 200, msg: '', data: {} });
    const first = { id: 'admin', role: 'root', adminContext: { id: 'ctx-a', subjectUserId: 'user-a', mode: 'readonly' } };
    const second = { id: 'admin', role: 'root', adminContext: { id: 'ctx-b', subjectUserId: 'user-b', mode: 'readonly' } };

    prefetchNoteDetail(first, 'note-1');
    prefetchNoteDetail(second, 'note-1');
    await Promise.all([consumeNoteDetail(first, 'note-1'), consumeNoteDetail(second, 'note-1')]);

    expect(apiBasePost).toHaveBeenCalledTimes(2);
    expect(buildNoteDetailRequestScope(first)).not.toBe(buildNoteDetailRequestScope(second));
  });

  it('同一时刻的多个详情消费者不会重复请求', async () => {
    let resolveRequest!: (value: unknown) => void;
    apiBasePost.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );
    const identity = { id: 'user-1', role: 'user' };

    const prefetched = prefetchNoteDetail(identity, 'note-1');
    const first = consumeNoteDetail(identity, 'note-1');
    const second = consumeNoteDetail(identity, 'note-1');
    resolveRequest({ status: 200, msg: '', data: { id: 'note-1' } });
    await Promise.all([prefetched, first, second]);

    expect(apiBasePost).toHaveBeenCalledTimes(1);
  });

  it('预取失败会清理缓存，重试会创建新请求', async () => {
    apiBasePost.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ status: 200, msg: '', data: {} });
    const identity = { id: 'user-1', role: 'user' };

    const first = prefetchNoteDetail(identity, 'note-1');
    await expect(first).rejects.toThrow('offline');
    await Promise.resolve();
    await expect(consumeNoteDetail(identity, 'note-1')).resolves.toMatchObject({ status: 200 });

    expect(apiBasePost).toHaveBeenCalledTimes(2);
  });
});
