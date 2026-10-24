import { onBeforeUnmount, ref, watch, type Ref } from 'vue';
import type { PublicationPreview, PublicationWorkspaceItem } from '@lightnote/shared/public-resources';
import { previewPublication } from '@/api/publicResources';
import { usePublicResourceScope } from '@/store/publicResourceScope';
import { publicationKey } from './usePublicationSelection';

/** Read one original only. This has no access to submission consent, queues or operation receipts. */
export function usePublicationPreview(item: Readonly<Ref<PublicationWorkspaceItem | null>>) {
  const scope = usePublicResourceScope();
  const material = ref<PublicationPreview | null>(null),
    loading = ref(false),
    error = ref('');
  let generation = 0,
    controller: AbortController | undefined;
  async function load() {
    const current = ++generation,
      identity = scope.identity,
      source = item.value;
    controller?.abort();
    const request = new AbortController();
    controller = request;
    material.value = null;
    error.value = '';
    loading.value = false;
    if (!source || !scope.eligible) return;
    if (source.sourceUnavailable) {
      error.value = 'PUBLIC_RESOURCE_SOURCE_UNAVAILABLE';
      return;
    }
    if (!scope.caps.submissionsEnabled) {
      error.value = 'PUBLIC_RESOURCE_READ_ONLY';
      return;
    }
    loading.value = true;
    try {
      const preview = await previewPublication(source.kind, source.sourceId, request.signal);
      if (current === generation && identity === scope.identity && !request.signal.aborted) material.value = preview;
    } catch (e) {
      if (current === generation && identity === scope.identity && !request.signal.aborted)
        error.value = (e as { code?: string }).code || 'PUBLIC_RESOURCE_UNAVAILABLE';
    } finally {
      if (current === generation) loading.value = false;
    }
  }
  watch(
    () => [
      item.value && publicationKey(item.value),
      item.value?.updatedAt,
      item.value?.sourceUnavailable,
      item.value?.publication?.version,
      scope.identity,
      scope.eligible,
      scope.caps.submissionsEnabled,
    ],
    load,
    { immediate: true, flush: 'sync' },
  );
  onBeforeUnmount(() => {
    generation++;
    controller?.abort();
    material.value = null;
  });
  return { material, loading, error, retry: load };
}
