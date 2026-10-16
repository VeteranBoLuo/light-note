import { computed, ref, watch, type Ref } from 'vue';
import { parseCommunityPostDocument } from '@lightnote/shared/community-feed';

type Document = { body: string; attachmentIds: string[] };
/** Both editor engines use the same history, including attachment membership. Upload metadata stays in the pool. */
export function useCommunityDocumentHistory(
  draft: Document,
  restore: (value: Document) => void,
  enabled: Ref<boolean>,
) {
  const entries = ref<Document[]>([]),
    index = ref(-1);
  let restoring = false,
    lastTyped = 0;
  const snapshot = () => ({ body: draft.body, attachmentIds: [...draft.attachmentIds] });
  const fingerprint = (value: Document) => JSON.stringify(value);
  function reset() {
    entries.value = [snapshot()];
    index.value = 0;
    lastTyped = 0;
  }
  function record(boundary = false) {
    if (restoring || !enabled.value || index.value < 0) return;
    const next = snapshot(),
      previous = entries.value[index.value];
    if (fingerprint(next) === fingerprint(previous)) return;
    const imageChange =
      JSON.stringify(parseCommunityPostDocument(next.body).imageIds) !==
        JSON.stringify(parseCommunityPostDocument(previous.body).imageIds) ||
      JSON.stringify(next.attachmentIds) !== JSON.stringify(previous.attachmentIds);
    const now = Date.now();
    entries.value.splice(index.value + 1);
    if (!boundary && !imageChange && lastTyped && now - lastTyped < 600 && index.value > 0)
      entries.value[index.value] = next;
    else {
      entries.value.push(next);
      index.value++;
    }
    lastTyped = boundary || imageChange ? 0 : now;
  }
  function travel(direction: number) {
    record();
    const target = index.value + direction;
    if (target < 0 || target >= entries.value.length) return;
    restoring = true;
    index.value = target;
    restore({ ...entries.value[target], attachmentIds: [...entries.value[target].attachmentIds] });
    restoring = false;
    lastTyped = 0;
  }
  watch(
    () => fingerprint(snapshot()),
    () => record(),
    { flush: 'post' },
  );
  return {
    reset,
    record,
    undo: () => travel(-1),
    redo: () => travel(1),
    canUndo: computed(() => index.value > 0),
    canRedo: computed(() => index.value < entries.value.length - 1),
  };
}
