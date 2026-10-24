import type { Router } from 'vue-router';
import { resolveNoteDetailReturnPath } from './noteDetailNavigation';
import { scrollIntoContainer } from './scrolling';

const STORAGE_KEY = 'light-note:search-note-return:v1';
const MAX_AGE_MS = 12 * 60 * 60_000;
const trackingRouters = new WeakSet<Router>();
let memory: SearchReturnSnapshot | null = null;
let sequence = 0;

/** Only navigation metadata, never resource contents or a second list cache. */
export interface SearchReturnSnapshot {
  id: string;
  scope: string;
  path: string;
  view: string;
  loadedCount: number;
  top: number;
  anchorKey: string;
  anchorOffset: number;
  inspectedKey: string;
  createdAt: number;
  returning: boolean;
}

export function resolveSearchReturnPath(value: unknown): string {
  const source = resolveNoteDetailReturnPath(value);
  return /^\/search(?:[?#]|$)/u.test(source) ? source : '';
}

function write(snapshot: SearchReturnSnapshot | null) {
  memory = snapshot;
  try {
    if (snapshot) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage restrictions must not prevent opening a note or returning to results.
  }
}

function read(): SearchReturnSnapshot | null {
  let snapshot = memory;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) snapshot = JSON.parse(raw);
  } catch {
    // In-memory navigation still works when tab storage is unavailable.
  }
  if (!snapshot) return null;
  if (
    typeof snapshot.id !== 'string' ||
    !snapshot.id ||
    typeof snapshot.scope !== 'string' ||
    !snapshot.scope ||
    typeof snapshot.view !== 'string' ||
    !snapshot.view ||
    typeof snapshot.returning !== 'boolean' ||
    resolveSearchReturnPath(snapshot.path) !== snapshot.path ||
    !Number.isSafeInteger(snapshot.loadedCount) ||
    snapshot.loadedCount < 0 ||
    !Number.isFinite(snapshot.top) ||
    snapshot.top < 0 ||
    !Number.isFinite(snapshot.anchorOffset) ||
    typeof snapshot.anchorKey !== 'string' ||
    typeof snapshot.inspectedKey !== 'string' ||
    !Number.isFinite(snapshot.createdAt) ||
    snapshot.createdAt > Date.now() ||
    Date.now() - snapshot.createdAt > MAX_AGE_MS
  ) {
    write(null);
    return null;
  }
  return snapshot;
}

/** Track the actual note → original search transition, including browser/system back.
 * Other navigation invalidates the snapshot, so later manual visits do not jump.
 * Install in both pages to support refreshing a note before returning.
 */
export function trackSearchReturnNavigation(router: Router) {
  if (trackingRouters.has(router)) return;
  trackingRouters.add(router);
  router.afterEach((to, from, failure) => {
    if (failure || to.fullPath === from.fullPath) return;
    const snapshot = read();
    if (!snapshot) return;
    const isSourceNote = (path: string, source: unknown) =>
      (path.startsWith('/noteLibrary/') || path.startsWith('/public-resources/')) &&
      resolveSearchReturnPath(source) === snapshot.path;
    if (to.fullPath === snapshot.path && isSourceNote(from.path, from.query.from)) {
      write({ ...snapshot, returning: true });
    } else if (isSourceNote(to.path, to.query.from)) {
      write({ ...snapshot, returning: false });
    } else {
      write(null);
    }
  });
}

export function rememberSearchReturn(
  input: Pick<SearchReturnSnapshot, 'scope' | 'path' | 'view' | 'loadedCount' | 'inspectedKey'>,
  container: HTMLElement | null,
) {
  if (!resolveSearchReturnPath(input.path)) return;
  const top = container?.getBoundingClientRect().top || 0;
  const anchor =
    container &&
    [...container.querySelectorAll<HTMLElement>('[data-search-resource-key]')].find(
      (element) => element.getBoundingClientRect().bottom > top,
    );
  write({
    ...input,
    id: `${Date.now()}-${++sequence}`,
    top: Math.max(0, container?.scrollTop || 0),
    anchorKey: anchor?.dataset.searchResourceKey || '',
    anchorOffset: anchor ? anchor.getBoundingClientRect().top - top : 0,
    createdAt: Date.now(),
    returning: false,
  });
}

export function readSearchReturn(scope: string, path: string, view: string): SearchReturnSnapshot | null {
  const snapshot = read();
  if (!snapshot) return null;
  if (snapshot.scope !== scope) {
    write(null);
    return null;
  }
  return snapshot.returning && snapshot.path === path && snapshot.view === view ? snapshot : null;
}

export function restoreSearchReturnPosition(container: HTMLElement, snapshot: SearchReturnSnapshot) {
  const anchor = [...container.querySelectorAll<HTMLElement>('[data-search-resource-key]')].find(
    (element) => element.dataset.searchResourceKey === snapshot.anchorKey,
  );
  if (anchor) scrollIntoContainer(container, anchor, snapshot.anchorOffset, 'auto');
  else container.scrollTo({ top: snapshot.top, behavior: 'auto' });
}

export function consumeSearchReturn(snapshot: SearchReturnSnapshot) {
  if (read()?.id === snapshot.id) write(null);
}
