import { computed, onBeforeUnmount, onDeactivated, reactive, ref, watch, type Ref } from 'vue';
import { applyRunSuggestionBatch, type WorkspaceItem, type WorkspaceSuggestion } from '@/api/organizeSuggestionApi';
import { generateUUID } from '@/utils/common';

export function canBatchApply(s: WorkspaceSuggestion) {
  return (
    s.status === 'pending' &&
    (s.kind === 'archive'
      ? Boolean(s.archivePreview)
      : s.kind === 'tags'
        ? Array.isArray(s.after) && s.after.length > 0
        : s.kind === 'title' && typeof s.after === 'string' && Boolean(s.after.trim()))
  );
}
export function useOrganizeBatchApply(
  scope: Ref<string>,
  runId: Ref<string>,
  rows: Ref<WorkspaceItem[]>,
  allowed: Ref<boolean>,
  changed: () => void,
) {
  const selecting = ref(false),
    busy = ref(false),
    progress = ref(0),
    total = ref(0);
  const selected = reactive(new Set<string>()),
    errors = reactive(new Map<string, string>());
  const outcome = ref<{ success: number; failed: number } | null>(null);
  const requests = new Map<string, string>();
  let generation = 0;
  const applicable = computed(() =>
    allowed.value
      ? rows.value.flatMap((item) =>
          ['queued', 'running', 'waiting_content', 'preparing_content'].includes(item.aiStatus)
            ? []
            : item.suggestions.filter(canBatchApply),
        )
      : [],
  );
  const selectedCount = computed(() => applicable.value.filter((s) => selected.has(s.id)).length);
  function reset() {
    generation++;
    selecting.value = false;
    busy.value = false;
    selected.clear();
    errors.clear();
    requests.clear();
    outcome.value = null;
  }
  watch(scope, reset, { flush: 'sync' });
  watch(
    allowed,
    (value) => {
      if (!value) reset();
    },
    { flush: 'sync' },
  );
  onBeforeUnmount(reset);
  onDeactivated(reset);
  function selectAll(value: boolean) {
    selected.clear();
    if (value) applicable.value.forEach((s) => selected.add(s.id));
  }
  function start() {
    selecting.value = true;
    outcome.value = null;
    selectAll(true);
  }
  async function apply() {
    if (busy.value || !allowed.value) return;
    const pending = applicable.value.filter((s) => selected.has(s.id));
    if (!pending.length) return;
    const current = generation,
      id = runId.value;
    busy.value = true;
    progress.value = 0;
    total.value = pending.length;
    outcome.value = null;
    let success = 0,
      failed = 0;
    for (let index = 0; index < pending.length && current === generation; index += 20) {
      const batch = pending.slice(index, index + 20);
      batch.forEach((s) => {
        errors.delete(s.id);
        if (!requests.has(s.id)) requests.set(s.id, generateUUID());
      });
      try {
        const response = await applyRunSuggestionBatch(
          id,
          batch.map((s) => ({ suggestionId: s.id, requestId: requests.get(s.id)! })),
        );
        if (current !== generation) return;
        if (response.status !== 200) throw new Error(response.msg);
        for (const s of batch) {
          const result = response.data.results.find((r: { suggestionId: string }) => r.suggestionId === s.id);
          if (result?.status === 'applied') {
            s.status = 'applied';
            s.applied = result.applied;
            selected.delete(s.id);
            success++;
          } else {
            errors.set(s.id, result?.message || '');
            failed++;
          }
        }
      } catch (error: any) {
        if (current !== generation) return;
        // 不自动重试不确定的写入；保留幂等标识供用户重试，并停止后续批次。
        batch.forEach((s) => errors.set(s.id, error?.message || ''));
        failed += batch.length;
        progress.value += batch.length;
        break;
      }
      progress.value += batch.length;
    }
    if (current === generation) {
      busy.value = false;
      outcome.value = { success, failed };
      changed();
    }
  }
  return {
    selecting,
    busy,
    selected,
    errors,
    outcome,
    applicable,
    selectedCount,
    progress,
    total,
    start,
    selectAll,
    apply,
    reset,
  };
}
