import type { Router } from 'vue-router';
import type { OrganizeResourceType } from '@/api/organizeApi';
import type { ResourceListScrollAnchor } from './resourceListScroll';
import { resolveNoteDetailReturnPath } from './noteDetailNavigation';

const STORAGE_KEY = 'light-note:untagged-note-return:v1';
const MAX_AGE_MS = 12 * 60 * 60_000;
const trackingRouters = new WeakSet<Router>();
let memory: UntaggedResourceReturn | null = null;
let sequence = 0;

/** Tab-local navigation metadata; resource contents always come from a fresh query. */
export interface UntaggedResourceReturn {
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

function write(snapshot: UntaggedResourceReturn | null) {
  memory = snapshot;
  try {
    if (snapshot) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage restrictions must not prevent navigation.
  }
}

function read(): UntaggedResourceReturn | null {
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

// Install at each participating entry so refresh still supports browser/system back.
export function trackUntaggedResourceReturn(router: Router) {
  if (trackingRouters.has(router)) return;
  trackingRouters.add(router);
  router.afterEach((to, from, failure) => {
    if (failure || to.fullPath === from.fullPath) return;
    const snapshot = read();
    if (!snapshot) return;
    const isSourceResource = (route: typeof to) =>
      resolveUntaggedReturnPath(route.query.from) === snapshot.path &&
      (route.path.startsWith('/noteLibrary/') ||
        (route.query.organize === 'untagged' &&
          (route.path.startsWith('/manage/editBookmark/') || route.path === '/cloudSpace')));
    if (to.fullPath === snapshot.path && isSourceResource(from)) {
      write({ ...snapshot, returning: true });
    } else if (isSourceResource(to)) {
      write({ ...snapshot, returning: false });
    } else {
      write(null);
    }
  });
}

export function rememberUntaggedResourceReturn(input: Omit<UntaggedResourceReturn, 'id' | 'createdAt' | 'returning'>) {
  if (!resolveUntaggedReturnPath(input.path)) return;
  write({ ...input, id: `${Date.now()}-${++sequence}`, createdAt: Date.now(), returning: false });
}

export function readUntaggedResourceReturn(scope: string, path: string): UntaggedResourceReturn | null {
  const snapshot = read();
  if (!snapshot) return null;
  if (snapshot.scope !== scope) {
    write(null);
    return null;
  }
  return snapshot.returning && snapshot.path === path ? snapshot : null;
}

export function clearUntaggedResourceReturn(snapshot?: UntaggedResourceReturn) {
  if (!snapshot || read()?.id === snapshot.id) write(null);
}
