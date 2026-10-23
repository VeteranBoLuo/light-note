import type { Router } from 'vue-router';
import type { OrganizeResourceType } from '@/api/organizeApi';
import type { ResourceListScrollAnchor } from './resourceListScroll';
import { resolveNoteDetailReturnPath } from './noteDetailNavigation';

const STORAGE_KEY = 'light-note:untagged-note-return:v1';
const MAX_AGE_MS = 12 * 60 * 60_000;
const trackingRouters = new WeakSet<Router>();
let memory: UntaggedNoteReturn | null = null;
let sequence = 0;

/** Tab-local navigation metadata; resource contents always come from a fresh query. */
export interface UntaggedNoteReturn {
  id: string;
  scope: string;
  path: string;
  keyword: string;
  resourceType: 'all' | OrganizeResourceType;
  appliedKeyword: string;
  appliedResourceType: 'all' | OrganizeResourceType;
  loadedCount: number;
  anchor: ResourceListScrollAnchor | null;
  top: number;
  createdAt: number;
  returning: boolean;
}

export function resolveUntaggedReturnPath(value: unknown): string {
  const source = resolveNoteDetailReturnPath(value);
  if (!source) return '';
  const parsed = new URL(source, 'https://light-note.local');
  return parsed.pathname === '/organize' && parsed.searchParams.get('issue') === 'untagged' ? source : '';
}

function write(snapshot: UntaggedNoteReturn | null) {
  memory = snapshot;
  try {
    if (snapshot) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage restrictions must not prevent navigation.
  }
}

function read(): UntaggedNoteReturn | null {
  let snapshot = memory;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) snapshot = JSON.parse(raw);
  } catch {
    // Retain in-memory navigation when session storage is unavailable.
  }
  if (!snapshot) return null;
  const validType = (type: unknown) => typeof type === 'string' && ['all', 'bookmark', 'note', 'file'].includes(type);
  const anchor = snapshot.anchor;
  if (
    typeof snapshot.id !== 'string' ||
    !snapshot.id ||
    typeof snapshot.scope !== 'string' ||
    !snapshot.scope ||
    !snapshot.path ||
    resolveUntaggedReturnPath(snapshot.path) !== snapshot.path ||
    typeof snapshot.keyword !== 'string' ||
    typeof snapshot.appliedKeyword !== 'string' ||
    !validType(snapshot.resourceType) ||
    !validType(snapshot.appliedResourceType) ||
    !Number.isSafeInteger(snapshot.loadedCount) ||
    snapshot.loadedCount < 0 ||
    !Number.isFinite(snapshot.top) ||
    snapshot.top < 0 ||
    typeof snapshot.returning !== 'boolean' ||
    !Number.isFinite(snapshot.createdAt) ||
    snapshot.createdAt > Date.now() ||
    Date.now() - snapshot.createdAt > MAX_AGE_MS ||
    (anchor !== null &&
      (!anchor ||
        typeof anchor.key !== 'string' ||
        !Number.isSafeInteger(anchor.index) ||
        anchor.index < 0 ||
        !Number.isFinite(anchor.offset)))
  ) {
    write(null);
    return null;
  }
  return snapshot;
}

// Install in both pages so refreshing a note still supports browser/system back.
export function trackUntaggedNoteReturn(router: Router) {
  if (trackingRouters.has(router)) return;
  trackingRouters.add(router);
  router.afterEach((to, from, failure) => {
    if (failure || to.fullPath === from.fullPath) return;
    const snapshot = read();
    if (!snapshot) return;
    const isSourceNote = (path: string, source: unknown) =>
      path.startsWith('/noteLibrary/') && resolveUntaggedReturnPath(source) === snapshot.path;
    if (to.fullPath === snapshot.path && isSourceNote(from.path, from.query.from)) {
      write({ ...snapshot, returning: true });
    } else if (isSourceNote(to.path, to.query.from)) {
      write({ ...snapshot, returning: false });
    } else {
      write(null);
    }
  });
}

export function rememberUntaggedNoteReturn(input: Omit<UntaggedNoteReturn, 'id' | 'createdAt' | 'returning'>) {
  if (!resolveUntaggedReturnPath(input.path)) return;
  write({ ...input, id: `${Date.now()}-${++sequence}`, createdAt: Date.now(), returning: false });
}

export function readUntaggedNoteReturn(scope: string, path: string): UntaggedNoteReturn | null {
  const snapshot = read();
  if (!snapshot) return null;
  if (snapshot.scope !== scope) {
    write(null);
    return null;
  }
  return snapshot.returning && snapshot.path === path ? snapshot : null;
}

export function clearUntaggedNoteReturn(snapshot?: UntaggedNoteReturn) {
  if (!snapshot || read()?.id === snapshot.id) write(null);
}
