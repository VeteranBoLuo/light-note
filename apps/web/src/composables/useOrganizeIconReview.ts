import { computed, onBeforeUnmount, reactive, ref, watch, type Ref } from 'vue';
import {
  actOnRunSuggestion,
  type SuggestionRun,
  type WorkspaceItem,
  type WorkspaceSuggestion,
  type TagIconChoice,
} from '@/api/organizeSuggestionApi';
import { generateUUID } from '@/utils/common';

export function iconChoice(suggestion: WorkspaceSuggestion): TagIconChoice | undefined {
  const value = suggestion.after;
  return value && typeof value === 'object' && !Array.isArray(value) && 'iconName' in value ? value : undefined;
}
export function useOrganizeIconReview(
  run: Ref<SuggestionRun | null>,
  items: Ref<WorkspaceItem[]>,
  changed: () => void,
) {
  const selected = reactive(new Set<string>());
  const drafts = reactive(new Map<string, TagIconChoice>());
  const busy = reactive(new Set<string>());
  const errors = reactive(new Map<string, string>());
  const batchBusy = ref(false);
  const outcome = ref<{ success: number; failed: number } | null>(null);
  const requests = new Map<string, { signature: string; id: string }>();
  let generation = 0;
  const known = reactive(new Map<string, WorkspaceSuggestion>());
  watch(
    items,
    (rows) => {
      for (const item of rows) for (const s of item.suggestions) if (s.kind === 'tag_icon') known.set(s.id, s);
    },
    { immediate: true },
  );
  const suggestions = computed(() => [...known.values()]);
  const canReview = (s: WorkspaceSuggestion) =>
    ['pending', 'no_suggestion', 'failed', 'insufficient'].includes(s.status);
  const choice = (s: WorkspaceSuggestion) => drafts.get(s.id) || iconChoice(s);
  const applicable = computed(() => suggestions.value.filter((s) => canReview(s) && choice(s)));
  function reset() {
    generation++;
    selected.clear();
    drafts.clear();
    errors.clear();
    busy.clear();
    requests.clear();
    outcome.value = null;
    batchBusy.value = false;
    known.clear();
  }
  watch(() => run.value?.id, reset, { flush: 'sync' });
  onBeforeUnmount(() => {
    generation++;
  });
  watch(suggestions, (rows) => {
    for (const s of rows)
      if (!canReview(s)) {
        selected.delete(s.id);
        drafts.delete(s.id);
      }
  });
  async function act(s: WorkspaceSuggestion, action: 'apply' | 'ignore', notify = true) {
    if (!run.value || busy.has(s.id)) return false;
    const current = generation;
    const value = action === 'apply' ? choice(s) : undefined;
    if (action === 'apply' && !value) return false;
    const signature = JSON.stringify([action, value?.iconName, value?.color]);
    if (requests.get(s.id)?.signature !== signature) requests.set(s.id, { signature, id: generateUUID() });
    busy.add(s.id);
    errors.delete(s.id);
    try {
      const response = await actOnRunSuggestion(
        run.value.id,
        s.id,
        action,
        value ? { iconName: value.iconName, color: value.color } : undefined,
        requests.get(s.id)!.id,
      );
      if (current !== generation) return false;
      if (response.status !== 200) throw new Error(response.msg);
      s.status = response.data.status;
      if (response.data.applied) s.after = response.data.applied;
      selected.delete(s.id);
      drafts.delete(s.id);
      if (notify) changed();
      return true;
    } catch (error: any) {
      if (current === generation) {
        const message = error?.response?.data?.msg || error?.msg || error?.message || '';
        errors.set(s.id, message);
        if (
          ['ORGANIZE_RESOURCE_TRASHED', 'ORGANIZE_RESOURCE_UNAVAILABLE', 'ORGANIZE_RESOURCE_CHANGED'].includes(
            error?.response?.data?.data?.code,
          )
        ) {
          s.status = 'expired';
          s.reason = message;
          selected.delete(s.id);
          drafts.delete(s.id);
          if (notify) changed();
        }
      }
      return false;
    } finally {
      if (current === generation) busy.delete(s.id);
    }
  }
  async function applySelected() {
    if (batchBusy.value) return;
    const pending = applicable.value.filter((s) => selected.has(s.id));
    if (!pending.length) return;
    const current = generation;
    batchBusy.value = true;
    outcome.value = null;
    let success = 0,
      failed = 0,
      index = 0;
    await Promise.all(
      Array.from({ length: Math.min(3, pending.length) }, async () => {
        while (current === generation && index < pending.length) {
          const s = pending[index++];
          if (await act(s, 'apply', false)) success++;
          else failed++;
        }
      }),
    );
    if (current === generation) {
      batchBusy.value = false;
      outcome.value = { success, failed };
      changed();
    }
  }
  return {
    reset,
    selected,
    drafts,
    busy,
    errors,
    batchBusy,
    outcome,
    canReview,
    choice,
    act,
    applySelected,
    selectedCount: computed(() => applicable.value.filter((s) => selected.has(s.id)).length),
    selectAvailable: () => {
      for (const s of applicable.value) selected.add(s.id);
    },
  };
}
export type OrganizeIconReview = ReturnType<typeof useOrganizeIconReview>;
