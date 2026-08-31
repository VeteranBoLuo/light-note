import { toolboxRecentUseIdentityKey, type ToolboxRecentUseIdentity } from '@/utils/toolboxRecentUse';

const STORAGE_PREFIX = 'lightnote.toolbox.pinned-tools.v1';
export const TOOLBOX_PINNED_TOOL_LIMIT = 6;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function browserStorage(): StorageLike | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function storageKey(identity: ToolboxRecentUseIdentity) {
  return `${STORAGE_PREFIX}:${toolboxRecentUseIdentityKey(identity)}`;
}

function normalizeToolIds(value: unknown, allowedToolIds?: ReadonlySet<string>) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))]
    .filter((toolId) => !allowedToolIds || allowedToolIds.has(toolId))
    .slice(0, TOOLBOX_PINNED_TOOL_LIMIT);
}

export function readToolboxPinnedTools(
  identity: ToolboxRecentUseIdentity,
  options: { allowedToolIds?: ReadonlySet<string>; storage?: StorageLike | null } = {},
): string[] {
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  if (!storage) return [];
  try {
    return normalizeToolIds(JSON.parse(storage.getItem(storageKey(identity)) || '[]'), options.allowedToolIds);
  } catch {
    return [];
  }
}

export function toggleToolboxPinnedTool(
  identity: ToolboxRecentUseIdentity,
  toolId: string,
  options: { allowedToolIds?: ReadonlySet<string>; storage?: StorageLike | null } = {},
): { toolIds: string[]; changed: boolean; limitReached: boolean } {
  const normalizedToolId = String(toolId || '').trim();
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  const current = readToolboxPinnedTools(identity, options);
  if (!storage || !normalizedToolId || (options.allowedToolIds && !options.allowedToolIds.has(normalizedToolId))) {
    return { toolIds: current, changed: false, limitReached: false };
  }
  const existingIndex = current.indexOf(normalizedToolId);
  let next: string[];
  if (existingIndex >= 0) {
    next = current.filter((item) => item !== normalizedToolId);
  } else if (current.length >= TOOLBOX_PINNED_TOOL_LIMIT) {
    return { toolIds: current, changed: false, limitReached: true };
  } else {
    next = [...current, normalizedToolId];
  }
  try {
    storage.setItem(storageKey(identity), JSON.stringify(next));
    return { toolIds: next, changed: true, limitReached: false };
  } catch {
    return { toolIds: current, changed: false, limitReached: false };
  }
}
