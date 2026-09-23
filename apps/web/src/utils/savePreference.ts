import { applyUiDensity } from '@/composables/useUiDensity';
import { useUserStore } from '@/store';
import { setLocale } from '@/i18n';
import { effectScope, reactive, readonly, watch } from 'vue';

/**
 * 本地应用并持久化用户偏好(主题/语言/视图模式等),不触发后端。
 * 游客换主题/语言/视图时用:偏好本地生效并存 localStorage(本浏览器留存),
 * 但不保存账号专属的默认首页，也不调 saveUserInfo
 * (游客写接口会被 ensureNotVisitor 拦成 'preview' 而误弹注册墙)。
 */
export function applyPreferenceLocally(patch: Record<string, any>): void {
  const user = useUserStore();
  const nextPreferences = { ...user.preferences, ...patch };
  if (!user.id || user.role === 'visitor') {
    delete nextPreferences.homePage;
  }
  user.preferences = nextPreferences;
  try {
    localStorage.setItem('preferences', JSON.stringify(user.preferences));
  } catch {
    /* 隐私模式下 localStorage 不可用,忽略 */
  }
}

/** 是否游客(未登录或 visitor 角色)。用于决定偏好是否同步到服务器。 */
export function isGuestUser(): boolean {
  const user = useUserStore();
  return !user.id || user.role === 'visitor';
}

/** Apply display density without transforming page coordinates. Persisted uiScale remains compatible. */
export function applyDisplaySettings(options: { forceStandard?: boolean } = {}): void {
  const user = useUserStore();
  applyUiDensity(user.preferences.uiScale, options.forceStandard);
}

export type PreferenceSavePhase = 'queued' | 'saving' | 'saved' | 'failed';
export type PreferencePersistence = 'account' | 'local' | 'session';
export interface PreferenceSaveState {
  phase: PreferenceSavePhase;
  persistence?: PreferencePersistence;
  sequence: number;
}
export class PreferenceSaveCancelled extends Error {
  constructor() {
    super('PREFERENCE_OWNER_CHANGED');
  }
}
export const isPreferenceSaveCancelled = (error: unknown) => error instanceof PreferenceSaveCancelled;

type Patch = Record<string, any>;
type User = ReturnType<typeof useUserStore>;
type SaveJob = {
  patch: Patch;
  owner: string;
  generation: number;
  sequence: number;
  resolve: () => void;
  reject: (error: unknown) => void;
};
const owners = new WeakMap<object, ReturnType<typeof createCoordinator>>();
const identity = (user: User) =>
  [
    user.id,
    user.role,
    user.visitorWorkspace,
    user.adminContext?.id,
    user.adminContext?.subjectUserId,
    user.adminContext?.mode,
  ].join('|');

function persist(user: User): boolean {
  try {
    localStorage.setItem('preferences', JSON.stringify(user.preferences));
    return true;
  } catch {
    return false;
  }
}
function createCoordinator(user: User) {
  const states = reactive<Record<string, PreferenceSaveState>>({});
  const retries = new Map<number, SaveJob>();
  let owner = identity(user),
    generation = 0,
    sequence = 0,
    running = false;
  const queue: SaveJob[] = [];
  function syncOwner() {
    if (owner === identity(user)) return;
    owner = identity(user);
    generation++;
    for (const key of Object.keys(states)) delete states[key];
    retries.clear();
    for (const job of queue.splice(0)) job.reject(new PreferenceSaveCancelled());
  }
  // The coordinator outlives individual settings cards and observes A → B → A transitions.
  effectScope(true).run(() => watch(() => identity(user), syncOwner, { flush: 'sync' }));
  function current(job: SaveJob) {
    syncOwner();
    return owner === job.owner && generation === job.generation;
  }
  function mark(job: SaveJob, phase: PreferenceSavePhase, persistence?: PreferencePersistence) {
    for (const key of Object.keys(job.patch)) {
      if (states[key]?.sequence === job.sequence) states[key] = { phase, persistence, sequence: job.sequence };
    }
  }
  async function drain() {
    if (running) return;
    running = true;
    try {
      while (queue.length) {
        const job = queue.shift()!;
        if (!current(job)) {
          job.reject(new PreferenceSaveCancelled());
          continue;
        }
        const previous = { ...user.preferences };
        const guest = !user.id || user.role === 'visitor';
        const userId = user.id;
        mark(job, 'saving');
        try {
          const next = { ...previous, ...job.patch };
          if (guest) delete next.homePage;
          user.preferences = next;
          let local = persist(user);
          if (job.patch.lang) await setLocale(job.patch.lang, { shouldApply: () => current(job) });
          if (!current(job)) throw new PreferenceSaveCancelled();
          if (!guest) {
            const { default: userApi } = await import('@/api/userApi.ts');
            if (!current(job)) throw new PreferenceSaveCancelled();
            const response = await userApi.updateUserInfo({ id: userId, preferences: JSON.stringify(next) });
            if (response?.status !== 200) throw new Error('PREFERENCE_SAVE_FAILED');
          }
          if (!current(job)) throw new PreferenceSaveCancelled();
          local = persist(user) && local;
          mark(job, 'saved', guest ? (local ? 'local' : 'session') : 'account');
          job.resolve();
        } catch (error) {
          if (!current(job)) {
            job.reject(new PreferenceSaveCancelled());
            continue;
          }
          // Replace, rather than merge: a failed newly introduced field must disappear too.
          user.preferences = previous;
          persist(user);
          if (job.patch.lang) {
            try {
              await setLocale(previous.lang || 'zh-CN', { shouldApply: () => current(job) });
            } catch {
              /* retain error */
            }
          }
          if (!current(job)) {
            job.reject(new PreferenceSaveCancelled());
            continue;
          }
          mark(job, 'failed');
          if (Object.keys(job.patch).every((key) => states[key]?.sequence === job.sequence))
            retries.set(job.sequence, job);
          job.reject(error);
        }
      }
    } finally {
      running = false;
    }
  }
  function enqueue(patch: Patch): Promise<void> {
    syncOwner();
    const copied = { ...patch };
    for (const [id, failed] of retries) {
      if (Object.keys(copied).some((key) => key in failed.patch)) {
        retries.delete(id);
        for (const key of Object.keys(failed.patch)) if (states[key]?.sequence === id) delete states[key];
      }
    }
    return new Promise((resolve, reject) => {
      const job = { patch: copied, owner, generation, sequence: ++sequence, resolve, reject };
      for (const key of Object.keys(copied)) states[key] = { phase: 'queued', sequence: job.sequence };
      queue.push(job);
      void drain();
    });
  }
  function retry(key: string) {
    syncOwner();
    const job = retries.get(states[key]?.sequence);
    if (!job || !current(job)) return Promise.resolve();
    return enqueue(job.patch);
  }
  return { states: readonly(states), enqueue, retry };
}
function coordinator() {
  const user = useUserStore();
  let result = owners.get(user);
  if (!result) {
    result = createCoordinator(user);
    owners.set(user, result);
  }
  return result;
}
/** Shared by settings, menus and view switches; no component-local write queues. */
export function updatePreference(patch: Patch): Promise<void> {
  return coordinator().enqueue(patch);
}
export function usePreferenceSaveState() {
  const service = coordinator();
  return {
    states: service.states,
    retry: service.retry,
    pending: (key: string) => ['queued', 'saving'].includes(service.states[key]?.phase),
  };
}
