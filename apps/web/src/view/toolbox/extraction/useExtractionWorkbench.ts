import { takeExtraction } from '@/utils/extractionHandoff';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter, onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useUserStore } from '@/store';
import { buildNoteDetailRequestScope } from '@/api/noteDetailPrefetch';
import {
  EXTRACTION_ACTIVE_STATUSES,
  type ExtractionFilter,
  type ExtractionPlan,
  type ExtractionRecord,
} from '@lightnote/shared/extraction';
import * as api from '@/api/extraction';
import { fetchToolboxCatalog } from '@/api/toolbox';
import Alert from '@/components/base/BasicComponents/BModal/Alert';
import type { ToolboxSelectedResource } from '@/utils/toolboxResourceSelection';
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
export function useExtractionWorkbench() {
  const { t, te } = useI18n(),
    route = useRoute(),
    router = useRouter(),
    user = useUserStore();
  const table = ref<api.ExtractionTable | null>(null),
    history = ref<api.ExtractionTable[]>([]),
    records = ref<ExtractionRecord[]>([]),
    total = ref(0),
    page = ref(1),
    busy = ref(false),
    loading = ref(false),
    error = ref('');
  const creationReady = ref(false),
    availabilityLoading = ref(false),
    availabilityError = ref('');
  const title = ref(''),
    goal = ref(''),
    resources = ref<ToolboxSelectedResource[]>([]),
    plan = ref<ExtractionPlan | null>(null),
    settingsOpen = ref(true),
    acceptPartial = ref(false);
  const filter = ref<ExtractionFilter>({}),
    selected = ref<ExtractionRecord | null>(null),
    fieldId = ref(''),
    draft = ref(''),
    reviewError = ref(''),
    saving = ref(false);
  const owner = computed(() => buildNoteDetailRequestScope(user)),
    editable = computed(() => !user.adminContext && ['user', 'test', 'root'].includes(user.role));
  const active = computed(() => table.value && EXTRACTION_ACTIVE_STATUSES.includes(table.value.status));
  const locked = computed(() => table.value?.phase === 'extract' || table.value?.status === 'ended');
  const serializedPlan = computed(() => JSON.stringify(plan.value));
  const dirtyPlan = computed(() => Boolean(plan.value) && serializedPlan.value !== JSON.stringify(table.value?.plan));
  const selectedCell = computed(() => selected.value?.cells.find((c) => c.fieldId === fieldId.value));
  const current = (r: ExtractionRecord, id: string) =>
    r.reviews[id]?.overridden ? r.reviews[id].value : r.cells.find((c) => c.fieldId === id)?.originalValue || '';
  const dirtyReview = computed(() => selected.value && draft.value !== current(selected.value, fieldId.value));
  let generation = 0,
    metadataRequest = 0,
    rowRequest = 0,
    availabilityRequest = 0,
    timer: ReturnType<typeof setTimeout> | undefined,
    filterTimer: ReturnType<typeof setTimeout> | undefined,
    disposed = false;
  const pendingRequests = new Map<string, string>();
  function requestFor(body: unknown) {
    const key = JSON.stringify(body);
    if (!pendingRequests.has(key)) pendingRequests.set(key, crypto.randomUUID());
    return pendingRequests.get(key)!;
  }
  function explain(cause: unknown) {
    const e = cause as { code?: string; response?: { data?: { data?: { code?: string } } } };
    const code = e.response?.data?.data?.code || e.code || '';
    return te(`extraction.errors.${code}`) ? t(`extraction.errors.${code}`) : t('extraction.error');
  }
  async function loadRows() {
    if (!table.value) return;
    const id = table.value.id,
      g = generation;
    const request = ++rowRequest;
    const response = await api.getExtractionRecords(id, filter.value, page.value);
    if (g !== generation || id !== table.value?.id || request !== rowRequest) return;
    records.value = response.records;
    total.value = response.total;
  }
  function schedule() {
    clearTimeout(timer);
    if (!disposed && !document.hidden && (active.value || table.value?.inFlight))
      timer = setTimeout(
        () =>
          void refresh().catch((cause) => {
            error.value = explain(cause);
            schedule();
          }),
        1800,
      );
  }
  async function refresh() {
    if (!table.value) return;
    const id = table.value.id,
      g = generation;
    const request = ++metadataRequest;
    const next = await api.getExtraction(id);
    if (g !== generation || id !== table.value?.id || request !== metadataRequest) return;
    const previousVersion = table.value.dataVersion,
      hadPlan = !!table.value.plan,
      wasDirty = dirtyPlan.value;
    table.value = next;
    if (!wasDirty || !hadPlan) {
      plan.value = next.plan ? clone(next.plan) : null;
    }
    if (previousVersion !== next.dataVersion || !records.value.length) await loadRows();
    schedule();
  }
  async function open(id: string) {
    generation++;
    busy.value = false;
    loading.value = false;
    saving.value = false;
    const g = generation;
    clearTimeout(timer);
    selected.value = null;
    records.value = [];
    total.value = 0;
    table.value = null;
    plan.value = null;
    error.value = '';
    creationReady.value = false;
    availabilityError.value = '';
    page.value = 1;
    filter.value = {};
    if (!id) {
      title.value = '';
      goal.value = '';
      resources.value = takeExtraction() || [];
      settingsOpen.value = true;
      try {
        const draft = JSON.parse(sessionStorage.getItem(`ln-extraction-draft:${owner.value}`) || 'null');
        if (draft && !resources.value.length) {
          title.value = draft.title || '';
          goal.value = draft.goal || '';
          resources.value = draft.resources || [];
        }
      } catch {}
      return;
    }
    loading.value = true;
    try {
      const data = await api.getExtraction(id);
      if (g !== generation) return;
      table.value = data;
      title.value = data.title;
      goal.value = data.goal;
      plan.value = data.plan ? clone(data.plan) : null;
      try {
        const saved = JSON.parse(sessionStorage.getItem(`ln-extraction-plan:${owner.value}:${id}`) || 'null');
        if (data.phase !== 'extract' && data.status !== 'ended' && saved?.base === JSON.stringify(data.plan))
          plan.value = saved.plan;
      } catch {}
      acceptPartial.value = data.acceptPartial;
      settingsOpen.value = data.phase !== 'extract';
      await loadRows();
      schedule();
    } catch (cause) {
      if (g === generation) error.value = explain(cause);
    } finally {
      if (g === generation) loading.value = false;
    }
  }
  async function perform(action: string, extra: Record<string, unknown> = {}) {
    if (!table.value || busy.value) return;
    const g = generation,
      id = table.value.id;
    busy.value = true;
    error.value = '';
    const body = { action, version: table.value.version, ...extra };
    try {
      await api.extractionAction(id, { ...body, requestId: requestFor(body) });
      if (g !== generation) return;
      pendingRequests.delete(JSON.stringify(body));
      if (['plan', 'sample', 'extract', 'analyze'].includes(action)) {
        sessionStorage.removeItem(`ln-extraction-plan:${owner.value}:${id}`);
        plan.value = null;
      }
      await refresh();
      await loadRows();
      if (action === 'extract') settingsOpen.value = false;
    } catch (cause) {
      if (g === generation) error.value = explain(cause);
    } finally {
      if (g === generation) busy.value = false;
    }
  }
  async function prepare() {
    if (busy.value || !editable.value || !creationReady.value) return;
    const g = generation;
    busy.value = true;
    error.value = '';
    const input = {
      title: title.value.trim() || t('extraction.untitled'),
      goal: goal.value,
      autoAnalyze: true,
      resourceRefs: resources.value.map(({ type, id }) => ({ type, id })),
    };
    try {
      const data = await api.createExtraction({ ...input, requestId: requestFor(input) });
      if (g !== generation) return;
      pendingRequests.delete(JSON.stringify(input));
      sessionStorage.removeItem(`ln-extraction-draft:${owner.value}`);
      await router.replace({ path: '/toolbox/extraction', query: { id: data.id } });
    } catch (cause) {
      if (g === generation) error.value = explain(cause);
    } finally {
      if (g === generation) busy.value = false;
    }
  }
  async function start() {
    if (!plan.value || !table.value) return;
    const proposed = clone(plan.value);
    if (!table.value.plan) {
      await perform('plan', { plan: proposed });
      if (error.value) return;
    }
    await perform('extract', { plan: proposed, acceptPartial: acceptPartial.value });
  }
  function applySelection(record: ExtractionRecord, id: string) {
    selected.value = clone(record);
    fieldId.value = id;
    draft.value = current(record, id);
    reviewError.value = '';
  }
  function inspect(record: ExtractionRecord, id: string) {
    if (!saving.value) confirmDiscard(() => applySelection(record, id));
  }
  function confirmDiscard(work: () => void) {
    if (dirtyReview.value) {
      Alert.alert({
        content: '',
        title: t('extraction.discard'),
        okText: t('extraction.confirm'),
        cancelText: t('extraction.cancel'),
        onOk: work,
      });
    } else work();
  }
  function closeReview() {
    if (!saving.value)
      confirmDiscard(() => {
        selected.value = null;
      });
  }
  function switchField(id: string) {
    confirmDiscard(() => {
      fieldId.value = id;
      draft.value = selected.value ? current(selected.value, id) : '';
      reviewError.value = '';
    });
  }
  async function saveReview(action: 'review' | 'restore' | 'exclude', excluded?: boolean) {
    if (!table.value || !selected.value || saving.value || !editable.value) return;
    const g = generation,
      record = selected.value,
      id = table.value.id;
    const body = {
      version: record.version,
      action,
      fieldId: fieldId.value,
      ...(action === 'review' ? { value: draft.value, checked: true } : {}),
      ...(action === 'exclude' ? { excluded } : {}),
    };
    saving.value = true;
    reviewError.value = '';
    try {
      const result = await api.reviewExtraction(id, record.id, {
        ...body,
        requestId: requestFor({ ...body, recordId: record.id }),
      });
      if (g !== generation) return;
      selected.value = result;
      draft.value = current(result, fieldId.value);
      await loadRows();
      await refresh();
    } catch (cause) {
      if (g === generation) reviewError.value = explain(cause);
    } finally {
      if (g === generation) saving.value = false;
    }
  }
  function nextPending(direction = 1) {
    confirmDiscard(() => {
      if (!table.value || !selected.value) return;
      const id = table.value.id,
        g = generation;
      saving.value = true;
      void api
        .getNextPendingCell(id, filter.value, selected.value.id, fieldId.value, direction)
        .then((item) => {
          if (g !== generation) return;
          if (item) applySelection(item.record, item.fieldId);
          else reviewError.value = t('extraction.noPending');
        })
        .catch((cause) => {
          if (g === generation) reviewError.value = explain(cause);
        })
        .finally(() => {
          if (g === generation) saving.value = false;
        });
    });
  }
  async function resume() {
    if (table.value?.errorCode === 'EXTRACTION_OUTCOME_UNKNOWN') {
      Alert.alert({
        content: '',
        title: t('extraction.uncertain'),
        okText: t('extraction.retry'),
        cancelText: t('extraction.cancel'),
        onOk: () => perform('resume', { confirmUncertain: true }),
      });
    } else if (table.value?.phase === 'sample' && table.value.errorCode && dirtyPlan.value)
      await perform('sample', { plan: clone(plan.value), acceptPartial: acceptPartial.value });
    else await perform('resume');
  }
  async function loadHistory() {
    const g = generation;
    const request = ++availabilityRequest;
    creationReady.value = false;
    availabilityLoading.value = true;
    availabilityError.value = '';
    const [items, catalog] = await Promise.allSettled([api.listExtractions(), fetchToolboxCatalog()]);
    if (disposed || g !== generation || request !== availabilityRequest) return;
    availabilityLoading.value = false;
    if (items.status === 'fulfilled') history.value = items.value;
    else availabilityError.value = explain(items.reason);
    if (catalog.status === 'rejected') availabilityError.value ||= explain(catalog.reason);
    else if (!catalog.value.tools.some((tool) => tool.id === 'extraction' && tool.availability.enabled))
      availabilityError.value ||= t('extraction.disabled');
    else creationReady.value = items.status === 'fulfilled';
  }
  function discardCurrentDraft() {
    if (table.value) sessionStorage.removeItem(`ln-extraction-plan:${owner.value}:${table.value.id}`);
    selected.value = null;
    plan.value = table.value?.plan ? clone(table.value.plan) : null;
  }
  function navigate(id = '') {
    if (dirtyReview.value || dirtyPlan.value) {
      Alert.alert({
        content: '',
        title: t('extraction.discard'),
        okText: t('extraction.confirm'),
        cancelText: t('extraction.cancel'),
        onOk: () => {
          discardCurrentDraft();
          void router.push({ path: '/toolbox/extraction', query: id ? { id } : {} });
        },
      });
    } else void router.push({ path: '/toolbox/extraction', query: id ? { id } : {} });
  }
  watch(
    () => String(route.query.id || ''),
    (id) => {
      void open(id).then(loadHistory);
    },
    { immediate: true },
  );
  watch(owner, (_next, previous) => {
    try {
      sessionStorage.removeItem(`ln-extraction-draft:${previous}`);
      for (const key of Object.keys(sessionStorage))
        if (key.startsWith(`ln-extraction-plan:${previous}:`)) sessionStorage.removeItem(key);
    } catch {}
    generation++;
    clearTimeout(timer);
    table.value = null;
    records.value = [];
    resources.value = [];
    plan.value = null;
    title.value = '';
    goal.value = '';
    selected.value = null;
    history.value = [];
    creationReady.value = false;
    availabilityError.value = '';
    availabilityLoading.value = false;
    pendingRequests.clear();
    void router.replace('/toolbox/extraction');
    void open('').then(loadHistory);
  });
  watch(
    [title, goal, resources],
    () => {
      if (!table.value && !loading.value && editable.value) {
        try {
          sessionStorage.setItem(
            `ln-extraction-draft:${owner.value}`,
            JSON.stringify({ title: title.value, goal: goal.value, resources: resources.value }),
          );
        } catch {}
      }
    },
    { deep: true },
  );
  watch(
    plan,
    () => {
      if (!table.value || loading.value || locked.value || !editable.value) return;
      const key = `ln-extraction-plan:${owner.value}:${table.value.id}`;
      try {
        if (dirtyPlan.value)
          sessionStorage.setItem(key, JSON.stringify({ base: JSON.stringify(table.value.plan), plan: plan.value }));
        else sessionStorage.removeItem(key);
      } catch {}
    },
    { deep: true },
  );
  watch(
    filter,
    () => {
      clearTimeout(filterTimer);
      page.value = 1;
      filterTimer = setTimeout(
        () =>
          void loadRows().catch((cause) => {
            error.value = explain(cause);
          }),
        250,
      );
    },
    { deep: true },
  );
  watch(
    page,
    () =>
      void loadRows().catch((cause) => {
        error.value = explain(cause);
      }),
  );
  function visibility() {
    if (document.hidden) clearTimeout(timer);
    else if (active.value || table.value?.inFlight)
      void refresh().catch((cause) => {
        error.value = explain(cause);
        schedule();
      });
  }
  document.addEventListener('visibilitychange', visibility);
  const guardUnsaved = () => {
    if (!dirtyReview.value && !dirtyPlan.value) return true;
    return new Promise<boolean>((resolve) =>
      Alert.alert({
        content: '',
        title: t('extraction.discard'),
        okText: t('extraction.confirm'),
        cancelText: t('extraction.cancel'),
        onOk: () => {
          discardCurrentDraft();
          resolve(true);
        },
        onCancel: () => resolve(false),
      }),
    );
  };
  onBeforeRouteLeave(guardUnsaved);
  onBeforeRouteUpdate(guardUnsaved);
  onBeforeUnmount(() => {
    disposed = true;
    generation++;
    clearTimeout(timer);
    clearTimeout(filterTimer);
    document.removeEventListener('visibilitychange', visibility);
  });
  return {
    owner,
    table,
    history,
    records,
    total,
    page,
    busy,
    loading,
    error,
    creationReady,
    availabilityLoading,
    availabilityError,
    reloadAvailability: loadHistory,
    title,
    goal,
    resources,
    plan,
    settingsOpen,
    acceptPartial,
    filter,
    selected,
    fieldId,
    draft,
    reviewError,
    saving,
    editable,
    active,
    locked,
    dirtyPlan,
    selectedCell,
    current,
    explain,
    open,
    navigate,
    perform,
    prepare,
    start,
    inspect,
    closeReview,
    switchField,
    saveReview,
    nextPending,
    resume,
    refresh,
  };
}
