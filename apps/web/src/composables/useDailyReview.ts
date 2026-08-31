import { ref } from 'vue';
import dailyReviewApi, {
  type DailyReviewItemWriteAction,
  type DailyReviewMutationResponse,
  type DailyReviewSnapshot,
  type DailyReviewTodayAction,
} from '@/api/dailyReviewApi.ts';
import { useUserStore } from '@/store';

type DailyReviewLoadMode = 'read' | 'ensure';

interface DailyReviewActionContext {
  reviewDate: string | null;
  sessionId: string | null;
}

export type DailyReviewFailedAction =
  | ({ kind: 'item'; itemId: string; action: DailyReviewItemWriteAction } & DailyReviewActionContext)
  | ({ kind: 'today'; action: DailyReviewTodayAction } & DailyReviewActionContext);

const review = ref<DailyReviewSnapshot | null>(null);
const loading = ref(false);
const error = ref(false);
const actionError = ref(false);
const failedAction = ref<DailyReviewFailedAction | null>(null);

let ownerKey: string | null = null;
let ownerGeneration = 0;
let requestVersion = 0;
let writeVersion = 0;
let activeRequest: Promise<DailyReviewSnapshot | null> | null = null;
let activeRequestOwnerKey: string | null = null;
let activeRequestMode: DailyReviewLoadMode | null = null;

function currentOwnerKey() {
  const user = useUserStore();
  return [
    user.id || 'visitor',
    user.role || 'visitor',
    user.adminContext?.id || '',
    user.adminContext?.subjectUserId || '',
    user.adminContext?.mode || '',
  ].join('|');
}

function isCurrentOwner(targetOwnerKey: string, generation: number) {
  return ownerKey === targetOwnerKey && ownerGeneration === generation && currentOwnerKey() === targetOwnerKey;
}

function resetOwnerState(nextOwnerKey: string | null) {
  ownerGeneration += 1;
  requestVersion += 1;
  writeVersion += 1;
  ownerKey = nextOwnerKey;
  activeRequest = null;
  activeRequestOwnerKey = null;
  activeRequestMode = null;
  review.value = null;
  loading.value = false;
  error.value = false;
  actionError.value = false;
  failedAction.value = null;
}

function ensureOwner(targetOwnerKey: string) {
  if (ownerKey !== targetOwnerKey) resetOwnerState(targetOwnerKey);
}

function actionContext(): DailyReviewActionContext {
  return {
    reviewDate: review.value?.date ?? null,
    sessionId: review.value?.session?.id ?? null,
  };
}

function snapshotMatchesAction(snapshot: DailyReviewSnapshot, action: DailyReviewActionContext) {
  return snapshot.date === action.reviewDate && (snapshot.session?.id ?? null) === action.sessionId;
}

function isNewerSnapshot(candidate: DailyReviewSnapshot, current: DailyReviewSnapshot | null) {
  if (!current) return true;
  if (candidate.date && current.date && candidate.date !== current.date) return candidate.date > current.date;
  if (candidate.date && !current.date) return true;
  return candidate.date === current.date && !current.session && Boolean(candidate.session);
}

function failedActionResolved(snapshot: DailyReviewSnapshot, failed: DailyReviewFailedAction) {
  if (failed.kind === 'today') {
    return failed.action === 'skip_today'
      ? snapshot.session?.status !== 'active'
      : snapshot.session?.status !== 'skipped';
  }
  const item = snapshot.items.find((candidate) => candidate.id === failed.itemId);
  if (!item || item.action !== 'pending') return true;
  return failed.action === 'open_tag_space' && (item.reasonCode !== 'active_tag' || !item.reasonTag?.id);
}

function applySnapshot(snapshot: DailyReviewSnapshot) {
  review.value = snapshot;
  error.value = false;
  if (
    failedAction.value &&
    (!snapshotMatchesAction(snapshot, failedAction.value) || failedActionResolved(snapshot, failedAction.value))
  ) {
    failedAction.value = null;
    actionError.value = false;
  }
}

function invalidateActiveRead() {
  requestVersion += 1;
  activeRequest = null;
  activeRequestOwnerKey = null;
  activeRequestMode = null;
  loading.value = false;
}

export function resetDailyReview() {
  resetOwnerState(null);
}

export function useDailyReview() {
  async function loadDailyReview(options: { force?: boolean; ensure?: boolean } = {}) {
    const user = useUserStore();
    const targetOwnerKey = currentOwnerKey();
    ensureOwner(targetOwnerKey);
    const canEnsure = user.role !== 'visitor' && !user.adminContext;
    const mode: DailyReviewLoadMode = options.ensure && canEnsure ? 'ensure' : 'read';

    if (!options.force && activeRequest && activeRequestOwnerKey === targetOwnerKey && activeRequestMode === mode) {
      return activeRequest;
    }

    const generation = ownerGeneration;
    const version = ++requestVersion;
    const writeVersionAtStart = writeVersion;
    loading.value = true;
    error.value = false;

    let request!: Promise<DailyReviewSnapshot | null>;
    request = Promise.resolve().then(async () => {
      let applied = false;
      try {
        const response =
          mode === 'ensure'
            ? await dailyReviewApi.ensureTodayDailyReview()
            : await dailyReviewApi.getTodayDailyReview();
        if (!isCurrentOwner(targetOwnerKey, generation) || version !== requestVersion) return null;
        if (response?.status === 200 && response.data) {
          // 写期间的同会话读取可能是旧快照；但跨午夜的新日期必须获准接管，不能被昨日写入挡住。
          if (writeVersionAtStart !== writeVersion && !isNewerSnapshot(response.data, review.value)) return null;
          applySnapshot(response.data);
          applied = true;
        } else if (writeVersionAtStart === writeVersion) {
          error.value = true;
        }
      } catch (loadError) {
        console.warn('加载每日回顾失败:', loadError);
        if (
          isCurrentOwner(targetOwnerKey, generation) &&
          version === requestVersion &&
          writeVersionAtStart === writeVersion
        ) {
          error.value = true;
        }
      } finally {
        if (isCurrentOwner(targetOwnerKey, generation) && version === requestVersion) {
          loading.value = false;
        }
        if (activeRequest === request) {
          activeRequest = null;
          activeRequestOwnerKey = null;
          activeRequestMode = null;
        }
      }
      return applied && isCurrentOwner(targetOwnerKey, generation) && version === requestVersion ? review.value : null;
    });

    activeRequest = request;
    activeRequestOwnerKey = targetOwnerKey;
    activeRequestMode = mode;
    return request;
  }

  async function commitAction(
    pendingFailure: DailyReviewFailedAction,
    send: () => Promise<DailyReviewMutationResponse>,
  ) {
    const targetOwnerKey = currentOwnerKey();
    ensureOwner(targetOwnerKey);
    const generation = ownerGeneration;
    const version = ++writeVersion;

    // 先作废写入前的读取。即使旧 GET 晚到，也不能把刚完成/延后的条目重新放回当前卡片。
    invalidateActiveRead();
    actionError.value = false;

    try {
      const response = await send();
      if (!isCurrentOwner(targetOwnerKey, generation) || version !== writeVersion) return response;
      // 前台刷新可能已切到次日会话；昨日回执不得覆盖新的日期/会话。
      if (review.value && !snapshotMatchesAction(review.value, pendingFailure)) return response;
      // 推进 mutation epoch，使写期间发起的同会话 GET 即使晚到也不能复活旧 pending；
      // loadDailyReview 仍会放行日期更晚的跨午夜快照。
      writeVersion += 1;
      loading.value = false;
      if (response?.status === 200 && response.data?.ok && response.data.review) {
        failedAction.value = null;
        actionError.value = false;
        applySnapshot(response.data.review);
      } else {
        failedAction.value = pendingFailure;
        actionError.value = true;
      }
      return response;
    } catch (writeError) {
      if (isCurrentOwner(targetOwnerKey, generation) && version === writeVersion) {
        if (!review.value || snapshotMatchesAction(review.value, pendingFailure)) {
          writeVersion += 1;
          loading.value = false;
          failedAction.value = pendingFailure;
          actionError.value = true;
        }
      }
      throw writeError;
    }
  }

  function actOnItem(itemId: string, action: DailyReviewItemWriteAction, options: { keepalive?: boolean } = {}) {
    const failed: DailyReviewFailedAction = { kind: 'item', itemId, action, ...actionContext() };
    return commitAction(failed, () => dailyReviewApi.updateDailyReviewItem(itemId, action, options));
  }

  function actOnToday(action: DailyReviewTodayAction) {
    const failed: DailyReviewFailedAction = { kind: 'today', action, ...actionContext() };
    return commitAction(failed, () => dailyReviewApi.updateDailyReviewToday(action));
  }

  function retryFailedAction() {
    const failed = failedAction.value;
    if (!failed) return Promise.resolve(null);
    if (review.value && !snapshotMatchesAction(review.value, failed)) {
      failedAction.value = null;
      actionError.value = false;
      return Promise.resolve(null);
    }
    return failed.kind === 'item'
      ? commitAction(failed, () => dailyReviewApi.updateDailyReviewItem(failed.itemId, failed.action))
      : commitAction(failed, () => dailyReviewApi.updateDailyReviewToday(failed.action));
  }

  return {
    review,
    loading,
    error,
    actionError,
    failedAction,
    loadDailyReview,
    actOnItem,
    actOnToday,
    retryFailedAction,
  };
}
