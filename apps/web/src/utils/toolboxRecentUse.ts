const STORAGE_PREFIX = 'lightnote.toolbox.recent-use.v1';
const DAY_MS = 24 * 60 * 60 * 1000;

export const TOOLBOX_RECENT_USE_LIMIT = 8;
export const TOOLBOX_RECENT_USE_TTL_MS = 90 * DAY_MS;

export type ToolboxRecentUse = {
  toolId: string;
  usedAt: number;
};

export type ToolboxRecentUseIdentity = {
  id?: string | null;
  role?: string | null;
  visitorWorkspace?: boolean;
  adminContext?: {
    subjectUserId?: string | null;
    mode?: string | null;
  } | null;
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function toolboxRecentUseIdentityKey(identity: ToolboxRecentUseIdentity): string {
  const owner = String(identity.adminContext?.subjectUserId || identity.id || 'visitor').trim() || 'visitor';
  const context = identity.adminContext?.subjectUserId
    ? `subject:${identity.adminContext.mode || 'readonly'}`
    : identity.visitorWorkspace
      ? 'visitor-workspace'
      : String(identity.role || 'visitor');
  return `${encodeURIComponent(owner)}:${encodeURIComponent(context)}`;
}

function storageKey(identity: ToolboxRecentUseIdentity): string {
  return `${STORAGE_PREFIX}:${toolboxRecentUseIdentityKey(identity)}`;
}

function browserStorage(): StorageLike | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function normalizeEntries(value: unknown, now: number, allowedToolIds?: ReadonlySet<string>): ToolboxRecentUse[] {
  if (!Array.isArray(value)) return [];
  const lowerBound = now - TOOLBOX_RECENT_USE_TTL_MS;
  const upperBound = now + DAY_MS;
  const seen = new Set<string>();
  return value
    .map((entry) => ({
      toolId: String(entry?.toolId || '').trim(),
      usedAt: Number(entry?.usedAt),
    }))
    .filter(
      (entry) =>
        Boolean(entry.toolId) &&
        Number.isFinite(entry.usedAt) &&
        entry.usedAt >= lowerBound &&
        entry.usedAt <= upperBound &&
        (!allowedToolIds || allowedToolIds.has(entry.toolId)),
    )
    .sort((left, right) => right.usedAt - left.usedAt)
    .filter((entry) => {
      if (seen.has(entry.toolId)) return false;
      seen.add(entry.toolId);
      return true;
    })
    .slice(0, TOOLBOX_RECENT_USE_LIMIT);
}

export function readToolboxRecentUses(
  identity: ToolboxRecentUseIdentity,
  options: {
    allowedToolIds?: ReadonlySet<string>;
    now?: number;
    storage?: StorageLike | null;
  } = {},
): ToolboxRecentUse[] {
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(storageKey(identity)) || '[]');
    return normalizeEntries(parsed, options.now ?? Date.now(), options.allowedToolIds);
  } catch {
    return [];
  }
}

export function recordToolboxRecentUse(
  identity: ToolboxRecentUseIdentity,
  toolId: string,
  options: { usedAt?: number; storage?: StorageLike | null } = {},
): void {
  const normalizedToolId = String(toolId || '').trim();
  const usedAt = Number(options.usedAt ?? Date.now());
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  if (!storage || !normalizedToolId || !Number.isFinite(usedAt)) return;
  try {
    const current = readToolboxRecentUses(identity, { now: usedAt, storage });
    const next = normalizeEntries([{ toolId: normalizedToolId, usedAt }, ...current], usedAt);
    storage.setItem(storageKey(identity), JSON.stringify(next));
  } catch {
    // 隐私模式或存储配额异常不应阻断本地工具使用。
  }
}
