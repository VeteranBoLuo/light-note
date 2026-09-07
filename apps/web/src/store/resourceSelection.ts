import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { MAX_EXPLICIT_RESOURCE_SELECTION } from '@lightnote/shared/resource-selection';
import type { BatchResourceItem, BatchSelection, BatchSelectionQuery, BatchSelectionSummary } from '@/api/search';

export type SelectionModule = 'bookmarks' | 'notes' | 'files' | 'search';
export interface SelectedResource extends BatchResourceItem {
  title: string;
  name?: string;
  url?: string;
  description?: string;
  tagList?: Array<{ id: string; name: string }>;
  fileName?: string;
  fileType?: string;
  category?: string;
  ext?: string;
  size?: number;
  folderId?: string | null;
  parentId?: string | null;
  noteType?: string;
}
export interface SelectionOperation {
  session: number;
  revision: number;
  identity: string;
  request: number;
  items: SelectedResource[];
  selection: BatchSelection;
}
export const resourceSelectionKey = (item: BatchResourceItem) => `${item.type}:${String(item.id)}`;
export function selectionResource(item: any, type = item.type): SelectedResource {
  const result: SelectedResource = {
    type,
    id: String(item.id),
    title: String(item.title || item.name || item.fileName || ''),
  };
  for (const field of [
    'name',
    'url',
    'description',
    'fileName',
    'fileType',
    'category',
    'ext',
    'size',
    'folderId',
    'parentId',
    'noteType',
  ] as const) {
    if (item[field] !== undefined) (result as any)[field] = item[field];
  }
  if (type === 'note' && item.type !== 'note') result.noteType = String(item.type || '');
  if (Array.isArray(item.tagList))
    result.tagList = item.tagList.map((t: any) => ({ id: String(t.id), name: String(t.name || '') }));
  return result;
}
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
export function selectionModuleForPath(path: string): SelectionModule | null {
  if (path === '/home' || path.startsWith('/home/') || path === '/manage/bookmarkMg') return 'bookmarks';
  if (path === '/noteLibrary') return 'notes';
  if (path === '/cloudSpace') return 'files';
  if (path === '/search') return 'search';
  return null;
}

export const useResourceSelectionStore = defineStore('resourceSelection', () => {
  const module = ref<SelectionModule | null>(null);
  const identity = ref('');
  const session = ref(0);
  const revision = ref(0);
  const items = ref<SelectedResource[]>([]);
  const busy = ref(false);
  const reviewOpen = ref(false);
  const pendingReconcile = ref<SelectionOperation | null>(null);
  const query = ref<{
    query: BatchSelectionQuery;
    summary: BatchSelectionSummary;
    excludedItems: BatchResourceItem[];
  } | null>(null);
  const handoff = ref<{
    token: string;
    from: string;
    operation: SelectionOperation;
    transient: boolean;
    drawer?: boolean;
    mode?: 'add' | 'remove';
  } | null>(null);
  const tagUpdate = ref(0);
  function completeTags(token: string) {
    if (handoff.value?.token === token && isCurrent(handoff.value.operation)) tagUpdate.value++;
  }
  function closeTags(token: string) {
    const current = handoff.value;
    if (!current || current.token !== token) return;
    handoff.value = null;
    if (!isCurrent(current.operation)) return;
    if (current.transient) end();
    else finish(current.operation);
  }
  let request = 0;
  const keys = computed(() => new Set(items.value.map(resourceSelectionKey)));
  const count = computed(() =>
    query.value ? Math.max(0, query.value.summary.total - query.value.excludedItems.length) : items.value.length,
  );
  function end() {
    module.value = null;
    items.value = [];
    query.value = null;
    busy.value = false;
    pendingReconcile.value = null;
    handoff.value = null;
    reviewOpen.value = false;
    session.value++;
    revision.value++;
  }
  function start(owner: SelectionModule, scope: string) {
    if (module.value === owner && identity.value === scope) return;
    end();
    module.value = owner;
    identity.value = scope;
  }
  function setItems(next: readonly SelectedResource[]) {
    if (busy.value || !module.value || query.value) return false;
    const unique = [
      ...new Map(
        next
          .filter((x) => ['bookmark', 'note', 'file'].includes(x.type) && x.id)
          .map((x) => [resourceSelectionKey(x), selectionResource(x)]),
      ).values(),
    ];
    if (unique.length > MAX_EXPLICIT_RESOURCE_SELECTION) return false;
    items.value = unique;
    revision.value++;
    return true;
  }
  function setVisible(visible: readonly SelectedResource[], selected: boolean) {
    const visibleKeys = new Set(visible.map(resourceSelectionKey));
    return setItems(
      selected ? [...items.value, ...visible] : items.value.filter((x) => !visibleKeys.has(resourceSelectionKey(x))),
    );
  }
  function refreshItems(next: readonly SelectedResource[]) {
    const updates = new Map(next.map((x) => [resourceSelectionKey(x), selectionResource(x)]));
    items.value = items.value.map((x) =>
      updates.has(resourceSelectionKey(x)) ? { ...x, ...updates.get(resourceSelectionKey(x))! } : x,
    );
  }
  function clear() {
    if (busy.value) return;
    items.value = [];
    query.value = null;
    pendingReconcile.value = null;
    revision.value++;
  }
  function selection(): BatchSelection {
    return query.value
      ? { mode: 'allMatching', query: clone(query.value.query), excludedItems: clone(query.value.excludedItems) }
      : { mode: 'explicit', items: items.value.map(({ type, id }) => ({ type, id })) };
  }
  function beginOperation(explicitItems?: readonly SelectedResource[]): SelectionOperation | null {
    if (busy.value || !module.value) return null;
    busy.value = true;
    return {
      session: session.value,
      revision: revision.value,
      identity: identity.value,
      request: ++request,
      items: clone([...(explicitItems || items.value)]),
      selection: explicitItems
        ? { mode: 'explicit', items: explicitItems.map(({ type, id }) => ({ type, id })) }
        : selection(),
    };
  }
  function isCurrent(operation: SelectionOperation) {
    return (
      operation.session === session.value &&
      operation.identity === identity.value &&
      operation.revision === revision.value &&
      operation.request === request
    );
  }
  function finish(operation: SelectionOperation) {
    if (isCurrent(operation)) busy.value = false;
  }
  function removeConfirmed(operation: SelectionOperation, removed: readonly BatchResourceItem[]) {
    if (!isCurrent(operation)) return;
    const gone = new Set(removed.map(resourceSelectionKey));
    items.value = items.value.filter((x) => !gone.has(resourceSelectionKey(x)));
  }
  function handoffTags(operation: SelectionOperation, from: string, transient = false) {
    const token = `${operation.session}-${operation.request}`;
    if (isCurrent(operation)) handoff.value = { token, from, operation: clone(operation), transient };
    return token;
  }
  function navigate(route: { path: string; query: Record<string, unknown> }) {
    if (!module.value) return;
    if (route.path === '/search/batch-tags' && handoff.value?.token === route.query.selectionSession) return;
    if (selectionModuleForPath(route.path) !== module.value) {
      end();
      return;
    }
    if (handoff.value?.drawer) return;
    if (handoff.value?.transient) {
      end();
      return;
    }
    if (handoff.value) {
      finish(handoff.value.operation);
      handoff.value = null;
    }
  }
  return {
    module,
    identity,
    session,
    revision,
    items,
    busy,
    reviewOpen,
    pendingReconcile,
    query,
    handoff,
    tagUpdate,
    completeTags,
    closeTags,
    keys,
    count,
    start,
    end,
    setItems,
    setVisible,
    refreshItems,
    clear,
    selection,
    beginOperation,
    isCurrent,
    finish,
    removeConfirmed,
    handoffTags,
    navigate,
  };
});
