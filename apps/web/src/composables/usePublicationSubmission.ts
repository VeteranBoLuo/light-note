import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { PUBLIC_RESOURCE_LIMITS, type PublicationCandidate } from '@lightnote/shared/public-resources';
import { preparePublications } from '@/api/publicResources';
import { usePublicResourceScope } from '@/store/publicResourceScope';
import { usePublicResourceBatch, type PublicBatchEntry, type PublicBatchRow } from './usePublicResourceBatch';
import { publicationKey } from './usePublicationSelection';

export interface PublicationSubmissionEntry extends PublicationCandidate {
  code: string;
}

/** Prepare immutable material fingerprints before consent; writes never refresh that frozen material. */
export function usePublicationSubmission(onComplete: (rows: PublicBatchRow[]) => Promise<unknown>) {
  const scope = usePublicResourceScope(),
    batch = usePublicResourceBatch();
  const step = ref<'confirm' | 'checking' | 'result'>('confirm'),
    entries = ref<PublicationSubmissionEntry[]>([]),
    running = ref(false);
  const preparing = computed(() => running.value && step.value === 'checking');
  const locked = computed(() => running.value || batch.busy.value);
  const rows = computed<PublicBatchRow[]>(() => [
    ...entries.value
      .filter((item) => item.code)
      .map((item) => ({
        key: publicationKey(item),
        kind: item.kind,
        title: item.title,
        state: 'failed' as const,
        code: item.code,
        checkedNotFound: false,
      })),
    ...batch.rows.value,
  ]);
  const unknown = computed(() => batch.rows.value.filter((row) => row.state === 'unknown'));
  const retryableUnknown = computed(() => unknown.value.filter((row) => row.checkedNotFound).length);
  const failed = computed(() => rows.value.filter((row) => row.state === 'failed'));
  const preparedCount = ref(0);
  let generation = 0,
    controller = new AbortController(),
    targets: PublicBatchEntry[] = [];
  let expectedMaterials = new Map<string, string>();
  function reset() {
    generation++;
    controller.abort();
    controller = new AbortController();
    targets = [];
    entries.value = [];
    step.value = 'confirm';
    running.value = false;
    preparedCount.value = 0;
    expectedMaterials.clear();
    batch.reset();
  }
  async function complete(current: number) {
    if (current !== generation) return;
    try {
      await onComplete(rows.value);
    } catch {
      /* Refresh failures must never downgrade committed item receipts. */
    }
  }
  function start(sources: PublicationCandidate[], seenMaterials: ReadonlyMap<string, string> = new Map()) {
    if (
      locked.value ||
      unknown.value.length ||
      !scope.eligible ||
      !scope.caps.submissionsEnabled ||
      !sources.length ||
      sources.length > PUBLIC_RESOURCE_LIMITS.selection ||
      new Set(sources.map(publicationKey)).size !== sources.length
    )
      return;
    reset();
    expectedMaterials = new Map(seenMaterials);
    entries.value = sources.map((item) => ({ kind: item.kind, sourceId: item.sourceId, title: item.title, code: '' }));
    return true;
  }
  async function prepare() {
    if (
      locked.value ||
      step.value !== 'confirm' ||
      !entries.value.length ||
      !scope.eligible ||
      !scope.caps.submissionsEnabled
    )
      return false;
    const current = generation;
    running.value = true;
    step.value = 'checking';
    targets = [];
    preparedCount.value = 0;
    try {
      const response = await preparePublications(
        entries.value.map(({ kind, sourceId }) => ({ kind, sourceId })),
        controller.signal,
      );
      if (current !== generation) return false;
      if (!scope.eligible || !scope.caps.submissionsEnabled) {
        entries.value.forEach((entry) => {
          entry.code = 'PUBLIC_RESOURCE_CLOSED';
        });
        step.value = 'result';
        return false;
      }
      const byKey = new Map(response.items.map((item) => [publicationKey(item), item]));
      for (const entry of entries.value) {
        const item = byKey.get(publicationKey(entry));
        if (!item || item.code || !item.fingerprint || item.expectedVersion === undefined) {
          entry.code = item?.code || 'PUBLIC_RESOURCE_UNAVAILABLE';
          continue;
        }
        const seen = expectedMaterials.get(publicationKey(entry));
        if (seen && seen !== item.fingerprint) {
          entry.code = 'PUBLIC_RESOURCE_MATERIAL_CHANGED';
          continue;
        }
        entry.title = item.title || entry.title;
        targets.push({
          key: publicationKey(entry),
          kind: entry.kind,
          title: entry.title,
          path: 'submit',
          body: {
            kind: entry.kind,
            sourceId: entry.sourceId,
            fingerprint: item.fingerprint,
            expectedVersion: item.expectedVersion,
            confirmed: true,
          },
        });
      }
      preparedCount.value = targets.length;
      step.value = targets.length ? 'confirm' : 'result';
      return targets.length > 0;
    } catch (error) {
      if (current === generation) {
        entries.value.forEach((entry) => {
          entry.code = (error as { code?: string }).code || 'PUBLIC_RESOURCE_UNAVAILABLE';
        });
        step.value = 'result';
      }
      return false;
    } finally {
      if (current === generation) running.value = false;
    }
  }
  async function submit() {
    if (
      step.value !== 'confirm' ||
      locked.value ||
      unknown.value.length ||
      !targets.length ||
      !scope.eligible ||
      !scope.caps.submissionsEnabled
    )
      return;
    const current = generation;
    running.value = true;
    step.value = 'result';
    try {
      // Only the explicit confirmation after prepare() authorizes these exact fingerprints and versions.
      await batch.start(targets);
      if (current === generation && batch.rows.value.some((row) => row.state === 'unknown')) await batch.reconcile();
      if (current === generation) await complete(current);
    } finally {
      if (current === generation) running.value = false;
    }
  }
  async function retryFailed() {
    if (locked.value || unknown.value.length) return;
    const keys = new Set(failed.value.map((row) => row.key));
    start(entries.value.filter((entry) => keys.has(publicationKey(entry))));
  }
  async function reconcile() {
    const current = generation;
    await batch.reconcile();
    await complete(current);
  }
  async function retryUnconfirmed() {
    const current = generation;
    await batch.retryUnconfirmed();
    await complete(current);
  }
  watch(() => scope.identity, reset, { flush: 'sync' });
  onBeforeUnmount(reset);
  return {
    step,
    entries,
    rows,
    preparing,
    preparedCount,
    locked,
    unknown,
    retryableUnknown,
    failed,
    batch,
    start,
    prepare,
    submit,
    retryFailed,
    reconcile,
    retryUnconfirmed,
    reset,
  };
}
export type PublicationSubmission = ReturnType<typeof usePublicationSubmission>;
