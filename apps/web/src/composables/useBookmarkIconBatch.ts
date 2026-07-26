import { ref, type Ref } from 'vue';
import { setBookmarkIconBatchLoading } from '@/composables/bookmarkIconRuntime.ts';

export type IconBatchCursor = {
  finishedAt: string;
  jobId: number;
};

export type IconBatchUpdate = {
  jobId: number;
  bookmarkId: string;
  status: 'success' | 'not_found' | 'failed' | 'cancelled';
  iconUrl?: string;
  finishedAt: string;
};

export type IconBatchState = {
  batchId: string;
  total: number;
  completed: number;
  success: number;
  notFound: number;
  failed: number;
  cancelled: number;
  queued: number;
  processing: number;
  retryWaiting: number;
  status: 'queued' | 'processing' | 'completed' | 'no_tasks';
  activeBookmarkIds?: string[];
  updates?: IconBatchUpdate[];
  nextCursor?: IconBatchCursor | null;
};

type IconBookmarkItem = {
  id: string | number;
  iconUrl?: string;
};

type ReloadBookmarks = (options: { refreshIcons: boolean }) => Promise<unknown>;
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type TimerHandle = ReturnType<typeof setTimeout>;

type BatchStatusResponse = {
  status?: number;
  data?: Partial<IconBatchState> | null;
};

type BatchRetryResponse = {
  status?: number;
  data?: { retried?: number; cancelled?: number } | null;
};

type UseBookmarkIconBatchOptions<T extends IconBookmarkItem> = {
  bookmarks: Ref<T[]>;
  reloadBookmarks: ReloadBookmarks;
  storageKey: Readonly<Ref<string>>;
  requestStatus: (batchId: string, cursor: IconBatchCursor | null) => Promise<BatchStatusResponse>;
  requestRetry?: (batchId: string) => Promise<BatchRetryResponse>;
  notifyFallback?: () => void;
  notifyRetryQueued?: (count: number) => void;
  notifyRetryFailed?: () => void;
  storage?: StorageLike;
  isDocumentHidden?: () => boolean;
  schedule?: (callback: () => void, delayMs: number) => TimerHandle;
  cancelSchedule?: (handle: TimerHandle) => void;
  now?: () => number;
  stallFallbackMs?: number;
};

const POLL_FAILURE_LIMIT = 3;
const POLL_WITH_UPDATES_MS = 800;
const POLL_IDLE_MS = 1500;
const POLL_HIDDEN_MS = 5000;
const POLL_RETRY_WAIT_MS = 15_000;
const DEFAULT_STALL_FALLBACK_MS = 30_000;

function toCount(value: unknown) {
  const count = Number(value || 0);
  return Number.isFinite(count) && count >= 0 ? count : 0;
}

function normalizeState(batchId: string, value: Partial<IconBatchState>): IconBatchState {
  const rawStatus = String(value.status || 'processing');
  const status: IconBatchState['status'] = (
    ['queued', 'processing', 'completed', 'no_tasks'].includes(rawStatus) ? rawStatus : 'processing'
  ) as IconBatchState['status'];
  return {
    batchId: String(value.batchId || batchId),
    total: toCount(value.total),
    completed: toCount(value.completed),
    success: toCount(value.success),
    notFound: toCount(value.notFound),
    failed: toCount(value.failed),
    cancelled: toCount(value.cancelled),
    queued: toCount(value.queued),
    processing: toCount(value.processing),
    retryWaiting: toCount(value.retryWaiting),
    status,
    activeBookmarkIds: Array.isArray(value.activeBookmarkIds)
      ? Array.from(new Set(value.activeBookmarkIds.map((id) => String(id || '').trim()).filter(Boolean)))
      : [],
    updates: Array.isArray(value.updates) ? value.updates : [],
    nextCursor: value.nextCursor || null,
  };
}

export function applyIconBatchUpdates<T extends IconBookmarkItem>(bookmarks: T[], updates: IconBatchUpdate[] = []) {
  const byId = new Map(bookmarks.map((bookmark) => [String(bookmark.id), bookmark]));
  let applied = 0;
  for (const update of updates) {
    if (update.status !== 'success' || !update.iconUrl) continue;
    const bookmark = byId.get(String(update.bookmarkId));
    if (!bookmark) continue;
    bookmark.iconUrl = update.iconUrl;
    applied += 1;
  }
  return applied;
}

export function useBookmarkIconBatchTracking<T extends IconBookmarkItem>({
  bookmarks,
  reloadBookmarks,
  storageKey,
  requestStatus,
  requestRetry,
  notifyFallback = () => {},
  notifyRetryQueued = () => {},
  notifyRetryFailed = () => {},
  storage = window.localStorage,
  isDocumentHidden = () => document.hidden,
  schedule = (callback, delayMs) => setTimeout(callback, delayMs),
  cancelSchedule = (handle) => clearTimeout(handle),
  now = () => Date.now(),
  stallFallbackMs = DEFAULT_STALL_FALLBACK_MS,
}: UseBookmarkIconBatchOptions<T>) {
  const state = ref<IconBatchState | null>(null);
  const cursor = ref<IconBatchCursor | null>(null);
  let timer: TimerHandle | null = null;
  let activeBatchId = '';
  let consecutiveFailures = 0;
  let lastCompleted = 0;
  let lastProgressAt = now();
  let wasWaitingForRetry = false;
  let generation = 0;
  let loadingBookmarkIds = new Set<string>();

  function replaceLoadingBookmarkIds(nextIds: string[] = []) {
    const next = new Set(nextIds.map((id) => String(id || '').trim()).filter(Boolean));
    loadingBookmarkIds.forEach((id) => {
      if (!next.has(id)) setBookmarkIconBatchLoading(id, false);
    });
    next.forEach((id) => {
      if (!loadingBookmarkIds.has(id)) setBookmarkIconBatchLoading(id, true);
    });
    loadingBookmarkIds = next;
  }

  function clearTimer() {
    if (timer === null) return;
    cancelSchedule(timer);
    timer = null;
  }

  function clearPending() {
    try {
      storage.removeItem(storageKey.value);
    } catch {
      // localStorage 不可用不影响当前页面状态。
    }
  }

  function savePending(batchId: string) {
    try {
      storage.setItem(storageKey.value, batchId);
    } catch {
      // localStorage 不可用时仍继续当前页面轮询。
    }
  }

  function scheduleNext(delayMs: number, requestGeneration: number) {
    clearTimer();
    if (!activeBatchId || requestGeneration !== generation) return;
    const actualDelay = isDocumentHidden() ? Math.max(POLL_HIDDEN_MS, delayMs) : delayMs;
    timer = schedule(() => {
      timer = null;
      void pollNow();
    }, actualDelay);
  }

  async function fallbackToProgressiveIcons(requestGeneration: number) {
    if (requestGeneration !== generation) return;
    clearTimer();
    activeBatchId = '';
    cursor.value = null;
    state.value = null;
    replaceLoadingBookmarkIds();
    clearPending();
    notifyFallback();
    await reloadBookmarks({ refreshIcons: true });
  }

  async function pollNow() {
    const batchId = activeBatchId;
    const requestGeneration = generation;
    if (!batchId) return;

    clearTimer();
    try {
      const response = await requestStatus(batchId, cursor.value);
      if (requestGeneration !== generation || batchId !== activeBatchId) {
        return;
      }
      if (Number(response?.status) !== 200 || !response?.data) {
        throw new Error('BOOKMARK_ICON_BATCH_STATUS_UNAVAILABLE');
      }

      consecutiveFailures = 0;
      const nextState = normalizeState(batchId, response.data);
      state.value = nextState;
      replaceLoadingBookmarkIds(nextState.activeBookmarkIds);
      applyIconBatchUpdates(bookmarks.value, nextState.updates);
      if (nextState.nextCursor) cursor.value = nextState.nextCursor;

      if (nextState.completed > lastCompleted) {
        lastCompleted = nextState.completed;
        lastProgressAt = now();
      }

      if (nextState.status === 'completed' || nextState.status === 'no_tasks' || nextState.total === 0) {
        activeBatchId = '';
        clearPending();
        await reloadBookmarks({ refreshIcons: false });
        return;
      }

      const activeOutstanding = nextState.queued + nextState.processing;
      const isWaitingForRetry = activeOutstanding === 0 && nextState.retryWaiting > 0;

      // 仅剩延时重试时任务仍会由 Worker 继续，但不再跨页面恢复成“正在补全”。
      // 一旦任务重新进入 queued/processing，则重新保存 pending，保证真正处理中的批次可恢复。
      if (isWaitingForRetry) {
        wasWaitingForRetry = true;
        clearPending();
      } else if (activeOutstanding > 0) {
        if (wasWaitingForRetry) lastProgressAt = now();
        wasWaitingForRetry = false;
        savePending(batchId);
      }

      if (activeOutstanding > 0 && now() - lastProgressAt >= stallFallbackMs) {
        await fallbackToProgressiveIcons(requestGeneration);
        return;
      }

      scheduleNext(
        isWaitingForRetry ? POLL_RETRY_WAIT_MS : nextState.updates?.length ? POLL_WITH_UPDATES_MS : POLL_IDLE_MS,
        requestGeneration,
      );
    } catch {
      if (requestGeneration !== generation || batchId !== activeBatchId) {
        return;
      }
      consecutiveFailures += 1;
      if (consecutiveFailures >= POLL_FAILURE_LIMIT) {
        await fallbackToProgressiveIcons(requestGeneration);
        return;
      }
      scheduleNext(POLL_IDLE_MS, requestGeneration);
    }
  }

  async function start(batchId: string, total = 0, initialBookmarkIds: string[] = []) {
    const normalizedBatchId = String(batchId || '').trim();
    if (!normalizedBatchId) return;
    generation += 1;
    clearTimer();
    replaceLoadingBookmarkIds(initialBookmarkIds);
    activeBatchId = normalizedBatchId;
    consecutiveFailures = 0;
    lastCompleted = 0;
    lastProgressAt = now();
    wasWaitingForRetry = false;
    cursor.value = null;
    state.value = normalizeState(normalizedBatchId, {
      batchId: normalizedBatchId,
      total,
      queued: total,
      status: 'queued',
      activeBookmarkIds: initialBookmarkIds,
    });
    savePending(normalizedBatchId);
    await pollNow();
  }

  function dismiss() {
    generation += 1;
    clearTimer();
    activeBatchId = '';
    cursor.value = null;
    state.value = null;
    replaceLoadingBookmarkIds();
    clearPending();
  }

  function stopForUnmount() {
    generation += 1;
    clearTimer();
    activeBatchId = '';
    cursor.value = null;
    replaceLoadingBookmarkIds();
  }

  function readPendingBatch() {
    try {
      return String(storage.getItem(storageKey.value) || '').trim();
    } catch {
      return '';
    }
  }

  async function retryFailures(batchId: string) {
    if (!requestRetry) return false;
    try {
      const response = await requestRetry(batchId);
      if (Number(response?.status) !== 200) {
        notifyRetryFailed();
        return false;
      }
      const retried = toCount(response?.data?.retried);
      notifyRetryQueued(retried);
      await start(batchId, state.value?.total || 0);
      return true;
    } catch {
      notifyRetryFailed();
      return false;
    }
  }

  return {
    state,
    cursor,
    start,
    pollNow,
    dismiss,
    stopForUnmount,
    readPendingBatch,
    retryFailures,
  };
}

export async function refreshAfterBookmarkImport(
  iconBatch: { batchId?: string; total?: number; bookmarkIds?: string[] } | undefined,
  startTracking: (batchId: string, total: number, initialBookmarkIds?: string[]) => Promise<unknown>,
  reloadBookmarks: ReloadBookmarks,
) {
  const batchId = String(iconBatch?.batchId || '').trim();
  const total = toCount(iconBatch?.total);
  if (batchId && total > 0) {
    // 导入响应直接携带新建书签 ID，start 的同步阶段会先写入全局加载态；
    // 状态轮询继续异步运行，不额外拖慢导入后的列表展示。
    void startTracking(batchId, total, Array.isArray(iconBatch?.bookmarkIds) ? iconBatch.bookmarkIds : []);
    await reloadBookmarks({ refreshIcons: false });
    return true;
  }
  await reloadBookmarks({ refreshIcons: true });
  return false;
}
