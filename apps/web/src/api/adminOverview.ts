import { apiBasePost } from '@/http/request';

const SNAPSHOT_REUSE_WINDOW_MS = 1000;

type SnapshotResponse = Awaited<ReturnType<typeof apiBasePost>>;

interface SnapshotCacheEntry {
  response: SnapshotResponse;
  resolvedAt: number;
}

const inFlight = new Map<string, Promise<SnapshotResponse>>();
const recent = new Map<string, SnapshotCacheEntry>();

function snapshotKey(hideInternal: boolean) {
  return hideInternal ? 'hide-internal' : 'include-internal';
}

/**
 * 管理壳和总览子页会同时挂载；同口径快照在途时只发一个 HTTP 请求，并短暂复用刚完成的结果。
 * force 只跳过已完成缓存，不制造并发重复请求，手动刷新仍能拿到新快照。
 */
export function getAdminOverviewSnapshot(hideInternal: boolean, { force = false } = {}) {
  const key = snapshotKey(hideInternal);
  const running = inFlight.get(key);
  if (running) return running;

  const cached = recent.get(key);
  if (!force && cached && Date.now() - cached.resolvedAt <= SNAPSHOT_REUSE_WINDOW_MS) {
    return Promise.resolve(cached.response);
  }

  const request = apiBasePost(
    '/api/common/getAdminOverviewSnapshot',
    { hideInternal },
    { silent: true },
  )
    .then((response) => {
      if (response.status === 200) recent.set(key, { response, resolvedAt: Date.now() });
      return response;
    })
    .finally(() => {
      if (inFlight.get(key) === request) inFlight.delete(key);
    });
  inFlight.set(key, request);
  return request;
}

export const adminOverviewRequestInternals = {
  reset() {
    inFlight.clear();
    recent.clear();
  },
};
