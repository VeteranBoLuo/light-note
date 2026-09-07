import { createOrganizeHandoff, clearOrganizeHandoff } from '@/utils/organizeHandoff';
import { computed, onScopeDispose, watch, type Ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useUserStore } from '@/store';
import { buildNoteDetailRequestScope } from '@/api/noteDetailPrefetch';
import { previewSearchBatchSelection, type BatchSelection, type BatchSelectionSummary } from '@/api/search';
import { MAX_EXPLICIT_RESOURCE_SELECTION } from '@lightnote/shared/resource-selection';
import {
  useResourceSelectionStore,
  resourceSelectionKey,
  selectionResource,
  type SelectedResource,
  type SelectionModule,
  type SelectionOperation,
} from '@/store/resourceSelection';
import message from '@/components/base/BasicComponents/BMessage/BMessage';

export function useResourceSelectionRuntime() {
  const store = useResourceSelectionStore();
  const user = useUserStore();
  const router = useRouter();
  watch(
    () => buildNoteDetailRequestScope(user),
    (scope) => {
      clearOrganizeHandoff();
      if (store.module && store.identity !== scope) store.end();
    },
    { flush: 'sync' },
  );
  const remove = router.afterEach((to, _from, failure) => {
    if (!failure) store.navigate(to);
  });
  onScopeDispose(remove);
}

export function useResourceSelection(
  owner: SelectionModule,
  visible: Ref<any[]>,
  type?: SelectedResource['type'],
  loading: Ref<boolean> = computed(() => false),
) {
  const store = useResourceSelectionStore();
  const user = useUserStore();
  const router = useRouter();
  const { t } = useI18n();
  const active = computed(() => store.module === owner && store.identity === buildNoteDetailRequestScope(user));
  const candidates = computed(() =>
    loading.value
      ? []
      : [
          ...new Map(
            visible.value.map((x) => {
              const item = selectionResource(x, type || x.type);
              return [resourceSelectionKey(item), item];
            }),
          ).values(),
        ],
  );
  const items = computed(() => (active.value ? store.items : []));
  const busy = computed(() => active.value && store.busy);
  const mode = computed({
    get: () => active.value,
    set: (on: boolean) => (on ? store.start(owner, buildNoteDetailRequestScope(user)) : active.value && store.end()),
  });
  function notifyLimit(ok: boolean) {
    if (!ok && !store.busy) message.info(t('resourceSelection.limit', { count: MAX_EXPLICIT_RESOURCE_SELECTION }));
  }
  const ids = computed({
    get: () => items.value.map((x) => (type ? x.id : resourceSelectionKey(x))),
    set: (next: string[]) => {
      if (!active.value || loading.value || store.busy) return;
      const available = new Map(
        [...items.value, ...candidates.value].map((x) => [type ? x.id : resourceSelectionKey(x), x]),
      );
      notifyLimit(
        store.setItems(
          next
            .map(String)
            .map((id) => available.get(id))
            .filter((x): x is SelectedResource => !!x),
        ),
      );
    },
  });
  const visibleSelected = computed(
    () => candidates.value.filter((x) => ids.value.includes(type ? x.id : resourceSelectionKey(x))).length,
  );
  const allVisible = computed(() => candidates.value.length > 0 && visibleSelected.value === candidates.value.length);
  const someVisible = computed(() => visibleSelected.value > 0 && !allVisible.value);
  const detail = computed(() =>
    t('resourceSelection.scope', { visible: visibleSelected.value, other: items.value.length - visibleSelected.value }),
  );
  watch(candidates, (value) => {
    if (active.value && !loading.value) store.refreshItems(value);
  });
  function toggle(item: any, checked?: boolean) {
    if (!active.value || store.busy || loading.value) return;
    const resource = selectionResource(item, type || item.type);
    notifyLimit(store.setVisible([resource], checked ?? !store.keys.has(resourceSelectionKey(resource))));
  }
  function selectVisible(checked: boolean) {
    if (active.value && !loading.value) notifyLimit(store.setVisible(candidates.value, checked));
  }
  function clear() {
    if (active.value) store.clear();
  }
  let operation: SelectionOperation | null = null;
  function current(op = operation) {
    return !!op && active.value && store.isCurrent(op);
  }
  function finish(op = operation) {
    if (op) store.finish(op);
    if (op === operation) operation = null;
  }
  async function prepare(
    explicitItems?: SelectedResource[],
    limit = MAX_EXPLICIT_RESOURCE_SELECTION,
  ): Promise<SelectionOperation | null> {
    if (!active.value || (loading.value && !explicitItems?.length) || !(explicitItems?.length || store.count))
      return null;
    if ((explicitItems || !store.query) && (explicitItems?.length || store.count) > limit) {
      message.info(t('resourceSelection.actionLimit', { count: limit }));
      return null;
    }
    if (store.pendingReconcile) {
      store.reviewOpen = true;
      message.info(t('resourceSelection.pending'));
      return null;
    }
    const op = store.beginOperation(explicitItems);
    if (!op) return null;
    operation = op;
    if (op.selection.mode === 'allMatching') return op;
    try {
      const response = await previewSearchBatchSelection(op.selection, true);
      if (!current(op)) return null;
      if (
        response.status !== 200 ||
        !Array.isArray(response.data?.resolvedItems) ||
        !Array.isArray(response.data?.unavailableItems)
      ) {
        message.error(t('resourceSelection.prepareFailed'));
        finish(op);
        return null;
      }
      store.removeConfirmed(op, response.data.unavailableItems);
      store.refreshItems(response.data.resolvedItems);
      if (response.data.unavailableItems.length) {
        message.info(t('resourceSelection.unavailable', { count: response.data.unavailableItems.length }));
        finish(op);
        return null;
      }
      op.items = response.data.resolvedItems.map((x: SelectedResource) => selectionResource(x));
      return op;
    } catch {
      finish(op);
      return null;
    }
  }
  async function reconcile(op: SelectionOperation) {
    if (!current(op)) return;
    if (op.selection.mode === 'allMatching') {
      store.query = null;
      finish(op);
      return;
    }
    try {
      const response = await previewSearchBatchSelection(op.selection, true);
      if (!current(op)) return;
      if (response.status !== 200 || !Array.isArray(response.data?.unavailableItems)) throw new Error('unavailable');
      store.removeConfirmed(op, response.data.unavailableItems);
      store.refreshItems(response.data.resolvedItems || []);
      store.pendingReconcile = null;
    } catch {
      if (current(op)) {
        store.pendingReconcile = op;
        message.warning(t('resourceSelection.pending'));
      }
    } finally {
      finish(op);
    }
  }
  async function replaceWithQuery(
    querySelection: Extract<BatchSelection, { mode: 'allMatching' }>,
    op: SelectionOperation | null = null,
    stillMatches = () => true,
  ) {
    if (!active.value) return false;
    op ||= store.beginOperation();
    if (!op || !current(op)) return false;
    const snapshot = JSON.parse(JSON.stringify(querySelection));
    try {
      const response = await previewSearchBatchSelection(snapshot);
      if (!current(op) || !stillMatches() || response.status !== 200 || !response.data) return false;
      store.items = [];
      store.query = { query: snapshot.query, summary: response.data as BatchSelectionSummary, excludedItems: [] };
      return true;
    } catch {
      return false;
    } finally {
      finish(op);
    }
  }

  async function openOrganize() {
    const op = await prepare(undefined, 1000);
    if (!op || !current(op)) return;
    let token: string | undefined;
    try {
      token = createOrganizeHandoff(op);
      const failure = await router.push({
        path: '/organize',
        query: { issue: 'ai_suggestions', organizeSelection: token },
      });
      if (!failure) return;
    } catch {
      message.error(t('organizeWizard.handoffFailed'));
    }
    if (token) clearOrganizeHandoff(token);
    finish(op);
  }

  async function openTags(action: 'add' | 'remove', explicitItems?: SelectedResource[]) {
    const transient = !active.value;
    if (transient && explicitItems?.length) mode.value = true;
    const startedSession = store.session;
    const op = await prepare(explicitItems);
    if (!op || !current(op)) {
      if (transient && active.value && store.session === startedSession) store.end();
      return;
    }
    const token = store.handoffTags(op, router.currentRoute.value.fullPath, transient);
    try {
      const failure = await router.push({
        path: '/search/batch-tags',
        query: { mode: action, selectionSession: token, from: router.currentRoute.value.fullPath },
      });
      if (!failure) return;
    } catch {
      // 路由加载失败仍保留选择，只结束本次子操作。
    }
    if (store.isCurrent(op)) {
      store.handoff = null;
      finish(op);
      if (transient) store.end();
    }
  }
  onScopeDispose(() => {
    if (operation && store.handoff?.operation.request !== operation.request) finish(operation);
  });
  return {
    store,
    active,
    mode,
    items,
    ids,
    busy,
    allVisible,
    someVisible,
    visibleSelected,
    detail,
    candidates,
    operation: () => operation,
    toggle,
    selectVisible,
    clear,
    prepare,
    current,
    finish,
    reconcile,
    openTags,
    openOrganize,
    replaceWithQuery,
  };
}
