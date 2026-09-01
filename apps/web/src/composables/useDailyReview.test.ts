import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DailyReviewSnapshot } from '@/api/dailyReviewApi.ts';

const mocks = vi.hoisted(() => ({
  user: {
    id: 'user-a',
    role: 'user',
    adminContext: null as null | { id: string; subjectUserId: string; mode: 'readonly' | 'maintain' },
  },
  getTodayDailyReview: vi.fn(),
  ensureTodayDailyReview: vi.fn(),
  updateDailyReviewItem: vi.fn(),
  updateDailyReviewToday: vi.fn(),
}));

vi.mock('@/store', () => ({ useUserStore: () => mocks.user }));
vi.mock('@/api/dailyReviewApi.ts', () => ({
  default: {
    getTodayDailyReview: mocks.getTodayDailyReview,
    ensureTodayDailyReview: mocks.ensureTodayDailyReview,
    updateDailyReviewItem: mocks.updateDailyReviewItem,
    updateDailyReviewToday: mocks.updateDailyReviewToday,
  },
}));

import { resetDailyReview, useDailyReview } from './useDailyReview';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function snapshot(overrides: Partial<DailyReviewSnapshot> = {}): DailyReviewSnapshot {
  return {
    generated: true,
    date: '2026-09-01',
    timezone: 'Asia/Singapore',
    session: { id: 'session-1', status: 'active', itemCount: 1 },
    progress: { done: 0, total: 1, pending: 1 },
    items: [
      {
        id: 'item-1',
        slot: 1,
        resourceType: 'note',
        resourceId: 'note-1',
        title: '第一条笔记',
        url: null,
        time: '2025-09-01 09:00:00',
        resourceDate: '2025-09-01',
        reasonCode: 'on_this_day',
        reasonTag: null,
        action: 'pending',
      },
    ],
    ...overrides,
  };
}

describe('useDailyReview', () => {
  beforeEach(() => {
    resetDailyReview();
    mocks.user.id = 'user-a';
    mocks.user.role = 'user';
    mocks.user.adminContext = null;
    mocks.getTodayDailyReview.mockReset();
    mocks.ensureTodayDailyReview.mockReset();
    mocks.updateDailyReviewItem.mockReset();
    mocks.updateDailyReviewToday.mockReset();
  });

  it('合并同账号、同读取模式的并发请求', async () => {
    const response = deferred<{ status: number; data: DailyReviewSnapshot }>();
    mocks.ensureTodayDailyReview.mockReturnValue(response.promise);

    const first = useDailyReview().loadDailyReview({ ensure: true });
    const second = useDailyReview().loadDailyReview({ ensure: true });
    await Promise.resolve();

    expect(mocks.ensureTodayDailyReview).toHaveBeenCalledTimes(1);
    const data = snapshot();
    response.resolve({ status: 200, data });

    await expect(first).resolves.toEqual(data);
    await expect(second).resolves.toEqual(data);
    expect(useDailyReview().review.value).toEqual(data);
    expect(useDailyReview().loading.value).toBe(false);
  });

  it('只读查询不会复用需要生成会话的在途请求', async () => {
    const ensureResponse = deferred<{ status: number; data: DailyReviewSnapshot }>();
    const readResponse = deferred<{ status: number; data: DailyReviewSnapshot }>();
    mocks.ensureTodayDailyReview.mockReturnValue(ensureResponse.promise);
    mocks.getTodayDailyReview.mockReturnValue(readResponse.promise);

    const ensureRequest = useDailyReview().loadDailyReview({ ensure: true });
    const readRequest = useDailyReview().loadDailyReview();
    await Promise.resolve();

    expect(mocks.ensureTodayDailyReview).toHaveBeenCalledTimes(1);
    expect(mocks.getTodayDailyReview).toHaveBeenCalledTimes(1);
    const readData = snapshot({
      generated: false,
      session: null,
      progress: { done: 0, total: 0, pending: 0 },
      items: [],
    });
    readResponse.resolve({ status: 200, data: readData });
    await expect(readRequest).resolves.toEqual(readData);

    ensureResponse.resolve({ status: 200, data: snapshot() });
    await expect(ensureRequest).resolves.toBeNull();
    expect(useDailyReview().review.value).toEqual(readData);
  });

  it('代管上下文和访客即使请求 ensure 也只执行 GET，root 本人仍可生成', async () => {
    const empty = snapshot({ generated: false, session: null, progress: { done: 0, total: 0, pending: 0 }, items: [] });
    mocks.getTodayDailyReview.mockResolvedValue({ status: 200, data: empty });

    mocks.user.adminContext = { id: 'context-1', subjectUserId: 'user-b', mode: 'readonly' };
    await useDailyReview().loadDailyReview({ ensure: true });
    expect(mocks.getTodayDailyReview).toHaveBeenCalledTimes(1);
    expect(mocks.ensureTodayDailyReview).not.toHaveBeenCalled();

    mocks.user.adminContext = null;
    mocks.user.role = 'visitor';
    await useDailyReview().loadDailyReview({ ensure: true });
    expect(mocks.getTodayDailyReview).toHaveBeenCalledTimes(2);
    expect(mocks.ensureTodayDailyReview).not.toHaveBeenCalled();

    mocks.user.role = 'root';
    mocks.ensureTodayDailyReview.mockResolvedValue({ status: 200, data: snapshot() });
    await useDailyReview().loadDailyReview({ ensure: true });
    expect(mocks.ensureTodayDailyReview).toHaveBeenCalledTimes(1);
  });

  it('账号或管理员目标切换后忽略旧响应并清空旧快照', async () => {
    const oldResponse = deferred<{ status: number; data: DailyReviewSnapshot }>();
    const newResponse = deferred<{ status: number; data: DailyReviewSnapshot }>();
    mocks.getTodayDailyReview.mockReturnValueOnce(oldResponse.promise).mockReturnValueOnce(newResponse.promise);

    const oldRequest = useDailyReview().loadDailyReview();
    mocks.user.adminContext = { id: 'context-2', subjectUserId: 'user-b', mode: 'readonly' };
    const newRequest = useDailyReview().loadDailyReview();

    const newData = snapshot({
      date: '2026-09-02',
      session: null,
      progress: { done: 0, total: 0, pending: 0 },
      items: [],
    });
    newResponse.resolve({ status: 200, data: newData });
    await expect(newRequest).resolves.toEqual(newData);

    oldResponse.resolve({ status: 200, data: snapshot() });
    await expect(oldRequest).resolves.toBeNull();
    expect(useDailyReview().review.value).toEqual(newData);
  });

  it('写入会作废旧读取，并用服务端完整快照原子推进', async () => {
    mocks.ensureTodayDailyReview.mockResolvedValueOnce({ status: 200, data: snapshot() });
    await useDailyReview().loadDailyReview({ ensure: true });

    const staleResponse = deferred<{ status: number; data: DailyReviewSnapshot }>();
    const writeResponse = deferred<{ status: number; data: { ok: true; review: DailyReviewSnapshot } }>();
    mocks.ensureTodayDailyReview.mockReturnValueOnce(staleResponse.promise);
    mocks.updateDailyReviewItem.mockReturnValueOnce(writeResponse.promise);

    const staleRequest = useDailyReview().loadDailyReview({ ensure: true, force: true });
    const mutation = useDailyReview().actOnItem('item-1', 'open');
    const completed = snapshot({
      session: { id: 'session-1', status: 'completed', itemCount: 1, completedAt: '2026-09-01 10:00:00' },
      progress: { done: 1, total: 1, pending: 0 },
      items: [{ ...snapshot().items[0], action: 'opened' }],
    });
    writeResponse.resolve({ status: 200, data: { ok: true, review: completed } });
    await expect(mutation).resolves.toMatchObject({ status: 200 });

    staleResponse.resolve({ status: 200, data: snapshot() });
    await expect(staleRequest).resolves.toBeNull();
    expect(useDailyReview().review.value).toEqual(completed);
  });

  it('写入期间新发起的读取晚到时也不能覆盖写回执快照', async () => {
    mocks.ensureTodayDailyReview.mockResolvedValueOnce({ status: 200, data: snapshot() });
    await useDailyReview().loadDailyReview({ ensure: true });

    const writeResponse = deferred<{ status: number; data: { ok: true; review: DailyReviewSnapshot } }>();
    const staleReadResponse = deferred<{ status: number; data: DailyReviewSnapshot }>();
    mocks.updateDailyReviewItem.mockReturnValueOnce(writeResponse.promise);
    mocks.ensureTodayDailyReview.mockReturnValueOnce(staleReadResponse.promise);

    const mutation = useDailyReview().actOnItem('item-1', 'open');
    const readDuringWrite = useDailyReview().loadDailyReview({ ensure: true, force: true });
    const completed = snapshot({
      session: { id: 'session-1', status: 'completed', itemCount: 1, completedAt: '2026-09-01 10:00:00' },
      progress: { done: 1, total: 1, pending: 0 },
      items: [{ ...snapshot().items[0], action: 'opened' }],
    });

    writeResponse.resolve({ status: 200, data: { ok: true, review: completed } });
    await mutation;
    staleReadResponse.resolve({ status: 200, data: snapshot() });

    await expect(readDuringWrite).resolves.toBeNull();
    expect(useDailyReview().review.value).toEqual(completed);
  });

  it('跨午夜读取先进入次日会话后，昨日写回执晚到也不能回滚', async () => {
    mocks.ensureTodayDailyReview.mockResolvedValueOnce({ status: 200, data: snapshot() });
    await useDailyReview().loadDailyReview({ ensure: true });

    const writeResponse = deferred<{ status: number; data: { ok: true; review: DailyReviewSnapshot } }>();
    const nextDayResponse = deferred<{ status: number; data: DailyReviewSnapshot }>();
    mocks.updateDailyReviewItem.mockReturnValueOnce(writeResponse.promise);
    mocks.ensureTodayDailyReview.mockReturnValueOnce(nextDayResponse.promise);

    const mutation = useDailyReview().actOnItem('item-1', 'open');
    const nextDayRequest = useDailyReview().loadDailyReview({ ensure: true, force: true });
    const nextDay = snapshot({
      date: '2026-09-02',
      session: { id: 'session-2', status: 'active', itemCount: 1 },
      items: [{ ...snapshot().items[0], id: 'item-2', resourceId: 'note-2', title: '次日笔记' }],
    });
    nextDayResponse.resolve({ status: 200, data: nextDay });
    await expect(nextDayRequest).resolves.toEqual(nextDay);

    const yesterdayCompleted = snapshot({
      session: { id: 'session-1', status: 'completed', itemCount: 1 },
      progress: { done: 1, total: 1, pending: 0 },
      items: [{ ...snapshot().items[0], action: 'opened' }],
    });
    writeResponse.resolve({ status: 200, data: { ok: true, review: yesterdayCompleted } });
    await mutation;

    expect(useDailyReview().review.value).toEqual(nextDay);
    expect(useDailyReview().actionError.value).toBe(false);
  });

  it('昨日写回执先完成时，晚到的次日读取仍可接管当前快照', async () => {
    mocks.ensureTodayDailyReview.mockResolvedValueOnce({ status: 200, data: snapshot() });
    await useDailyReview().loadDailyReview({ ensure: true });

    const writeResponse = deferred<{ status: number; data: { ok: true; review: DailyReviewSnapshot } }>();
    const nextDayResponse = deferred<{ status: number; data: DailyReviewSnapshot }>();
    mocks.updateDailyReviewItem.mockReturnValueOnce(writeResponse.promise);
    mocks.ensureTodayDailyReview.mockReturnValueOnce(nextDayResponse.promise);

    const mutation = useDailyReview().actOnItem('item-1', 'open');
    const nextDayRequest = useDailyReview().loadDailyReview({ ensure: true, force: true });
    const yesterdayCompleted = snapshot({
      session: { id: 'session-1', status: 'completed', itemCount: 1 },
      progress: { done: 1, total: 1, pending: 0 },
      items: [{ ...snapshot().items[0], action: 'opened' }],
    });
    writeResponse.resolve({ status: 200, data: { ok: true, review: yesterdayCompleted } });
    await mutation;

    const nextDay = snapshot({
      date: '2026-09-02',
      session: { id: 'session-2', status: 'active', itemCount: 1 },
      items: [{ ...snapshot().items[0], id: 'item-2' }],
    });
    nextDayResponse.resolve({ status: 200, data: nextDay });
    await expect(nextDayRequest).resolves.toEqual(nextDay);
    expect(useDailyReview().review.value).toEqual(nextDay);
  });

  it('昨日收起失败态在次日快照到达后清除，不会重试到新会话', async () => {
    mocks.ensureTodayDailyReview.mockResolvedValueOnce({ status: 200, data: snapshot() });
    await useDailyReview().loadDailyReview({ ensure: true });
    mocks.updateDailyReviewToday.mockRejectedValueOnce(new Error('offline'));

    await expect(useDailyReview().actOnToday('skip_today')).rejects.toThrow('offline');
    expect(useDailyReview().failedAction.value).toMatchObject({
      kind: 'today',
      action: 'skip_today',
      reviewDate: '2026-09-01',
      sessionId: 'session-1',
    });

    const nextDay = snapshot({
      date: '2026-09-02',
      session: { id: 'session-2', status: 'active', itemCount: 1 },
      items: [{ ...snapshot().items[0], id: 'item-2' }],
    });
    mocks.ensureTodayDailyReview.mockResolvedValueOnce({ status: 200, data: nextDay });
    await useDailyReview().loadDailyReview({ ensure: true, force: true });

    expect(useDailyReview().failedAction.value).toBeNull();
    expect(useDailyReview().actionError.value).toBe(false);
    await expect(useDailyReview().retryFailedAction()).resolves.toBeNull();
    expect(mocks.updateDailyReviewToday).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['理由已不再是活动标签', { reasonCode: 'buried' as const, reasonTag: null }],
    ['活动标签信息已缺失', { reasonCode: 'active_tag' as const, reasonTag: null }],
  ])('刷新后%s时清除失败的标签空间动作', async (_label, itemChanges) => {
    const tagged = snapshot({
      items: [
        {
          ...snapshot().items[0],
          reasonCode: 'active_tag',
          reasonTag: { id: 'tag-1', name: '产品' },
        },
      ],
    });
    mocks.ensureTodayDailyReview.mockResolvedValueOnce({ status: 200, data: tagged });
    await useDailyReview().loadDailyReview({ ensure: true });
    mocks.updateDailyReviewItem.mockRejectedValueOnce(new Error('offline'));

    await expect(useDailyReview().actOnItem('item-1', 'open_tag_space')).rejects.toThrow('offline');
    expect(useDailyReview().failedAction.value).toMatchObject({ action: 'open_tag_space' });

    const refreshed = snapshot({ items: [{ ...tagged.items[0], ...itemChanges }] });
    mocks.ensureTodayDailyReview.mockResolvedValueOnce({ status: 200, data: refreshed });
    await useDailyReview().loadDailyReview({ ensure: true, force: true });

    expect(useDailyReview().failedAction.value).toBeNull();
    expect(useDailyReview().actionError.value).toBe(false);
    await expect(useDailyReview().retryFailedAction()).resolves.toBeNull();
    expect(mocks.updateDailyReviewItem).toHaveBeenCalledTimes(1);
  });

  it.each(['completed', 'empty', 'skipped'] as const)('收起失败后刷新为 %s 会话时清除无效重试', async (status) => {
    mocks.ensureTodayDailyReview.mockResolvedValueOnce({ status: 200, data: snapshot() });
    await useDailyReview().loadDailyReview({ ensure: true });
    mocks.updateDailyReviewToday.mockRejectedValueOnce(new Error('offline'));

    await expect(useDailyReview().actOnToday('skip_today')).rejects.toThrow('offline');
    expect(useDailyReview().failedAction.value).toMatchObject({ action: 'skip_today' });

    const refreshed =
      status === 'empty'
        ? snapshot({
            session: { id: 'session-1', status, itemCount: 0 },
            progress: { done: 0, total: 0, pending: 0 },
            items: [],
          })
        : snapshot({ session: { id: 'session-1', status, itemCount: 1 } });
    mocks.ensureTodayDailyReview.mockResolvedValueOnce({ status: 200, data: refreshed });
    await useDailyReview().loadDailyReview({ ensure: true, force: true });

    expect(useDailyReview().failedAction.value).toBeNull();
    expect(useDailyReview().actionError.value).toBe(false);
    await expect(useDailyReview().retryFailedAction()).resolves.toBeNull();
    expect(mocks.updateDailyReviewToday).toHaveBeenCalledTimes(1);
  });

  it('写失败保留当前条并保存可重试动作，重试成功后清除失败态', async () => {
    mocks.ensureTodayDailyReview.mockResolvedValueOnce({ status: 200, data: snapshot() });
    await useDailyReview().loadDailyReview({ ensure: true });
    mocks.updateDailyReviewItem.mockRejectedValueOnce(new Error('offline'));

    await expect(useDailyReview().actOnItem('item-1', 'open')).rejects.toThrow('offline');
    expect(useDailyReview().review.value?.items[0]?.action).toBe('pending');
    expect(useDailyReview().actionError.value).toBe(true);
    expect(useDailyReview().failedAction.value).toEqual({
      kind: 'item',
      itemId: 'item-1',
      action: 'open',
      reviewDate: '2026-09-01',
      sessionId: 'session-1',
    });

    const completed = snapshot({
      session: { id: 'session-1', status: 'completed', itemCount: 1 },
      progress: { done: 1, total: 1, pending: 0 },
      items: [{ ...snapshot().items[0], action: 'opened' }],
    });
    mocks.updateDailyReviewItem.mockResolvedValueOnce({ status: 200, data: { ok: true, review: completed } });

    await useDailyReview().retryFailedAction();
    expect(mocks.updateDailyReviewItem).toHaveBeenLastCalledWith('item-1', 'open');
    expect(useDailyReview().actionError.value).toBe(false);
    expect(useDailyReview().failedAction.value).toBeNull();
    expect(useDailyReview().review.value).toEqual(completed);
  });
});
