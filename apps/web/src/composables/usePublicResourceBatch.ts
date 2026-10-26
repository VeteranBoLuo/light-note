import { onBeforeUnmount, ref, watch } from 'vue';
import { PUBLIC_RESOURCE_LIMITS, type PublicResourceKind } from '@lightnote/shared/public-resources';
import { publicOperation, sendPublicResourceBatch, type PublicOperation } from '@/api/publicResources';
import { usePublicResourceScope } from '@/store/publicResourceScope';
import { logPublicResourceOperation, publicResourceWriteLabel } from '@/utils/publicResourceOperationLog';

export interface PublicBatchEntry {
  key: string;
  kind: PublicResourceKind;
  title: string;
  path: string;
  body: Record<string, unknown>;
}
export interface PublicBatchResult {
  publicId: string;
  version: number;
  reused?: boolean;
  revision?: number;
}
export interface PublicBatchRow {
  key: string;
  kind: PublicResourceKind;
  title: string;
  state: 'queued' | 'running' | 'success' | 'reused' | 'failed' | 'unknown';
  code: string;
  result?: PublicBatchResult;
  checkedNotFound: boolean;
}

/** A single HTTP batch, with an independent operation receipt for each explicitly selected item. */
export function usePublicResourceBatch() {
  const scope = usePublicResourceScope(),
    rows = ref<PublicBatchRow[]>([]),
    busy = ref(false);
  const operations = new Map<string, PublicOperation<PublicBatchResult>>();
  const inputs = new Map<string, PublicBatchEntry & { requestId: string }>();
  let generation = 0,
    logged = false;
  function reset() {
    generation++;
    operations.clear();
    inputs.clear();
    logged = false;
    rows.value = [];
    busy.value = false;
  }
  function success(row: PublicBatchRow, result: PublicBatchResult) {
    row.result = result;
    row.state = result.reused ? 'reused' : 'success';
    row.code = '';
    row.checkedNotFound = false;
  }
  function logCompleted() {
    if (logged || !rows.value.length || rows.value.some((row) => !['success', 'reused', 'failed'].includes(row.state)))
      return;
    logged = true;
    const succeeded = rows.value.filter((row) => row.state === 'success').length;
    const reused = rows.value.filter((row) => row.state === 'reused').length;
    if (!succeeded && !reused) return;
    const entry = inputs.get(rows.value[0].key)!;
    const label = publicResourceWriteLabel(entry.path, entry.body);
    if (label)
      logPublicResourceOperation(
        `批量${label}【共${rows.value.length}项，成功${succeeded}项，无须重复操作${reused}项，失败${rows.value.length - succeeded - reused}项】`,
      );
  }
  async function perform(targets: PublicBatchRow[]) {
    if (busy.value || !scope.eligible || !targets.length) return;
    const current = generation;
    busy.value = true;
    targets.forEach((row) => {
      row.state = 'running';
      row.checkedNotFound = false;
    });
    try {
      const response = await sendPublicResourceBatch(targets.map((row) => inputs.get(row.key)!));
      if (current !== generation) return;
      const results = new Map(response.items.map((item) => [item.requestId, item]));
      for (const row of targets) {
        const item = results.get(inputs.get(row.key)!.requestId);
        if (item && ['success', 'reused'].includes(item.state) && item.result) success(row, item.result);
        else {
          row.state = item?.state === 'failed' ? 'failed' : 'unknown';
          row.code = item?.code || 'PUBLIC_RESOURCE_UNAVAILABLE';
        }
      }
    } catch (error) {
      if (current !== generation) return;
      // A request can fail after some item transactions committed. Never infer that they all failed.
      for (const row of targets) {
        row.state = 'unknown';
        row.code = (error as { code?: string }).code || 'PUBLIC_RESOURCE_UNAVAILABLE';
      }
    } finally {
      if (current === generation) {
        busy.value = false;
        logCompleted();
      }
    }
  }
  async function start(entries: PublicBatchEntry[]) {
    if (busy.value) return;
    if (
      !entries.length ||
      entries.length > PUBLIC_RESOURCE_LIMITS.selection ||
      new Set(entries.map((entry) => entry.key)).size !== entries.length
    )
      throw new Error('PUBLIC_RESOURCE_INVALID_BATCH');
    reset();
    for (const entry of entries) {
      const requestId = crypto.randomUUID();
      const body = structuredClone(entry.body);
      inputs.set(entry.key, { ...entry, body, requestId });
      operations.set(entry.key, publicOperation(entry.path, body, requestId));
    }
    rows.value = entries.map((entry) => ({
      key: entry.key,
      kind: entry.kind,
      title: entry.title,
      state: 'queued',
      code: '',
      checkedNotFound: false,
    }));
    await perform(rows.value);
  }
  async function reconcile() {
    if (busy.value || !scope.eligible) return;
    const current = generation;
    busy.value = true;
    const pending = rows.value.filter((row) => row.state === 'unknown');
    try {
      // Bounded read concurrency, no resubmission while checking receipts.
      for (let offset = 0; offset < pending.length; offset += 4) {
        if (current !== generation) return;
        await Promise.all(
          pending.slice(offset, offset + 4).map(async (row) => {
            try {
              const receipt = await operations.get(row.key)!.resolve();
              if (current !== generation) return;
              if (receipt.found && receipt.result) success(row, receipt.result);
              else row.checkedNotFound = true;
            } catch {
              if (current === generation) row.checkedNotFound = false;
            }
          }),
        );
      }
    } finally {
      if (current === generation) {
        busy.value = false;
        logCompleted();
      }
    }
  }
  async function retryUnconfirmed() {
    // Only this explicit action can resend missing receipts, with their ORIGINAL item request IDs.
    await perform(rows.value.filter((row) => row.state === 'unknown' && row.checkedNotFound));
  }
  watch(() => scope.identity, reset, { flush: 'sync' });
  onBeforeUnmount(reset);
  return { rows, busy, start, reconcile, retryUnconfirmed, reset };
}
