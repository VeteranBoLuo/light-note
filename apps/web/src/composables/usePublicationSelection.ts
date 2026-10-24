import { computed, onBeforeUnmount, ref, watch } from 'vue';
import {
  PUBLIC_RESOURCE_LIMITS,
  canWithdrawPublication,
  type PublicationWorkspaceItem,
} from '@lightnote/shared/public-resources';
import { usePublicResourceScope } from '@/store/publicResourceScope';

export const publicationKey = (item: Pick<PublicationWorkspaceItem, 'kind' | 'sourceId'>) =>
  `${item.kind}:${item.sourceId}`;
export const canSelectPublication = (item: PublicationWorkspaceItem) =>
  !item.sourceUnavailable && item.publication?.status !== 'removed';

/** One explicit selection shared by submit and withdraw; filters never expand its scope. */
export function usePublicationSelection() {
  const scope = usePublicResourceScope();
  const items = ref(new Map<string, PublicationWorkspaceItem>()),
    error = ref(''),
    active = ref<PublicationWorkspaceItem | null>(null);
  const withdrawalTargets = computed(() =>
    [...items.value.values()].flatMap((i) =>
      i.publication && canWithdrawPublication(i.publication) ? [i.publication] : [],
    ),
  );
  // Preview is independent of the explicit batch selection.
  function focus(item: PublicationWorkspaceItem) {
    active.value = item;
  }
  function toggle(item: PublicationWorkspaceItem) {
    error.value = '';
    const key = publicationKey(item);
    if (items.value.has(key)) items.value.delete(key);
    else if (canSelectPublication(item)) {
      if (items.value.size >= PUBLIC_RESOURCE_LIMITS.selection) {
        error.value = 'PUBLIC_RESOURCE_BATCH_LIMIT';
        return;
      }
      items.value.set(key, { ...item });
    }
    active.value = item;
  }
  function togglePage(page: PublicationWorkspaceItem[]) {
    error.value = '';
    const eligible = page.filter(canSelectPublication);
    if (eligible.length && eligible.every((i) => items.value.has(publicationKey(i)))) {
      eligible.forEach((i) => items.value.delete(publicationKey(i)));
      return true;
    }
    return add(eligible);
  }
  function add(eligible: PublicationWorkspaceItem[]) {
    error.value = '';
    const next = new Map(items.value);
    eligible.filter(canSelectPublication).forEach((i) => next.set(publicationKey(i), { ...i }));
    if (next.size > PUBLIC_RESOURCE_LIMITS.selection) error.value = 'PUBLIC_RESOURCE_BATCH_LIMIT';
    else items.value = next;
    return next.size <= PUBLIC_RESOURCE_LIMITS.selection;
  }
  function clear() {
    items.value.clear();
    error.value = '';
  }
  function reset() {
    clear();
    active.value = null;
  }
  watch(() => scope.identity, reset, { flush: 'sync' });
  onBeforeUnmount(reset);
  return { items, active, focus, error, withdrawalTargets, toggle, togglePage, add, clear };
}
