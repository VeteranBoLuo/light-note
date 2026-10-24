import { computed, onBeforeUnmount, ref, watch } from 'vue';
import {
  PUBLIC_RESOURCE_LIMITS,
  canWithdrawPublication,
  type PublicationOwnState,
} from '@lightnote/shared/public-resources';
import { resolvePublications } from '@/api/publicResources';
import { usePublicResourceScope } from '@/store/publicResourceScope';
import { usePublicResourceBatch, type PublicBatchRow } from './usePublicResourceBatch';

/** Per-action withdrawal snapshot. The workspace owns the shared original-resource selection. */
export function usePublicationWithdrawal(
  onComplete: (rows: PublicBatchRow[]) => Promise<unknown>,
  onChecked: (ids: string[], states: PublicationOwnState[]) => void = () => {},
) {
  const scope = usePublicResourceScope(),
    batch = usePublicResourceBatch();
  const targets = ref<PublicationOwnState[]>([]),
    preparing = ref(false),
    confirming = ref(false),
    needsRefresh = ref(false),
    error = ref('');
  let generation = 0;
  let controller = new AbortController();
  const locked = computed(() => preparing.value || confirming.value || batch.busy.value);
  const unknown = computed(() => batch.rows.value.filter((r) => r.state === 'unknown'));
  const successful = computed(() => batch.rows.value.filter((r) => ['success', 'reused'].includes(r.state)));
  const failed = computed(() => batch.rows.value.filter((r) => r.state === 'failed'));
  async function resolveTargets() {
    const chosen = targets.value;
    if (!chosen.length) return null;
    const current = generation;
    const result = await resolvePublications(
      chosen.map((i) => i.publicId),
      controller.signal,
    );
    if (current !== generation) return null;
    onChecked(
      chosen.map((i) => i.publicId),
      result.items,
    );
    const valid = result.items.filter(canWithdrawPublication);
    const changed =
      result.unavailableIds.length > 0 ||
      valid.length !== chosen.length ||
      valid.some((i) => i.version !== chosen.find((old) => old.publicId === i.publicId)?.version);
    targets.value = valid;
    return { items: valid, changed };
  }
  async function finish(current: number) {
    if (current !== generation) return;
    const done = new Set(successful.value.map((r) => r.key));
    targets.value = targets.value.filter((i) => !done.has(i.publicId));
    needsRefresh.value = failed.value.length > 0;
    await onComplete(batch.rows.value);
  }
  async function prepare(items: PublicationOwnState[] = targets.value) {
    if (
      locked.value ||
      !items.length ||
      items.length > PUBLIC_RESOURCE_LIMITS.selection ||
      new Set(items.map((i) => i.publicId)).size !== items.length
    )
      return null;
    if (unknown.value.length) {
      error.value = 'PUBLIC_RESOURCE_BATCH_UNCONFIRMED';
      return null;
    }
    targets.value = items.map((i) => ({ ...i }));
    const current = generation;
    error.value = '';
    preparing.value = true;
    try {
      const result = await resolveTargets();
      if (!result || current !== generation) return null;
      needsRefresh.value = false;
      if (result.changed || !result.items.length) {
        error.value = 'PUBLIC_RESOURCE_BATCH_SELECTION_CHANGED';
        await onComplete([]);
        return null;
      }
      confirming.value = true;
      const snapshot = result.items.map((i) => ({ ...i }));
      let pending = true;
      return {
        items: snapshot,
        count: snapshot.length,
        cancel: () => {
          pending = false;
          if (current === generation) confirming.value = false;
        },
        run: async () => {
          if (!pending || current !== generation || !scope.eligible) return;
          pending = false;
          const running = batch.start(
            snapshot.map((i) => ({
              key: i.publicId,
              kind: i.kind,
              title: i.title,
              path: `own/${i.publicId}/withdraw`,
              body: { expectedVersion: i.version },
            })),
          );
          confirming.value = false;
          await running;
          await finish(current);
        },
      };
    } catch (e) {
      if (current === generation) error.value = (e as { code?: string }).code || 'PUBLIC_RESOURCE_UNAVAILABLE';
      return null;
    } finally {
      if (current === generation) preparing.value = false;
    }
  }
  async function refresh() {
    if (locked.value || unknown.value.length) return;
    const current = generation;
    preparing.value = true;
    error.value = '';
    try {
      await resolveTargets();
      if (current !== generation) return;
      needsRefresh.value = false;
      await onComplete([]);
    } catch (e) {
      if (current === generation) error.value = (e as { code?: string }).code || 'PUBLIC_RESOURCE_UNAVAILABLE';
    } finally {
      if (current === generation) preparing.value = false;
    }
  }
  async function reconcile() {
    const current = generation;
    await batch.reconcile();
    await finish(current);
  }
  async function retryUnconfirmed() {
    const current = generation;
    await batch.retryUnconfirmed();
    await finish(current);
  }
  function reset() {
    generation++;
    controller.abort();
    controller = new AbortController();
    targets.value = [];
    preparing.value = false;
    confirming.value = false;
    needsRefresh.value = false;
    error.value = '';
    batch.reset();
  }
  watch(() => scope.identity, reset, { flush: 'sync' });
  onBeforeUnmount(reset);
  return {
    targets,
    locked,
    preparing,
    needsRefresh,
    error,
    batch,
    unknown,
    successful,
    failed,
    prepare,
    refresh,
    reconcile,
    retryUnconfirmed,
  };
}
