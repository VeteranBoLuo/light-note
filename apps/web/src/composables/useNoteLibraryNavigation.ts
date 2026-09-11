import { computed, watch, type Ref } from 'vue';
import type { Router } from 'vue-router';
import { noteLibraryPreviewId, noteLibraryPreviewLocation } from '@/utils/noteDetailNavigation';

export function useNoteLibraryNavigation(router: Router, isMobile: Ref<boolean>) {
  const active = computed(() => router.currentRoute.value.path === '/noteLibrary');
  const previewNoteId = computed(() => active.value
    ? noteLibraryPreviewId(router.currentRoute.value.query.preview) : null);

  function openPreview(noteId: string) {
    const id = noteLibraryPreviewId(noteId);
    if (!active.value || !id || id === previewNoteId.value) return;
    return router.push(noteLibraryPreviewLocation(router.currentRoute.value.query, id));
  }

  function closePreview(replace = false) {
    if (!active.value || !previewNoteId.value) return;
    const target = noteLibraryPreviewLocation(router.currentRoute.value.query, null);
    return replace ? router.replace(target) : router.push(target);
  }

  watch([() => router.currentRoute.value.fullPath, isMobile], () => {
    if (!active.value) return;
    const route = router.currentRoute.value;
    const id = previewNoteId.value;
    if (id && isMobile.value) {
      const from = router.resolve(noteLibraryPreviewLocation(route.query, null)).fullPath;
      void router.replace({ name: 'noteDetail', params: { id }, query: { from } });
    } else if ('preview' in route.query && (!id || route.query.preview !== id)) {
      void router.replace(noteLibraryPreviewLocation(route.query, id));
    }
  }, { immediate: true });

  return { previewNoteId, openPreview, closePreview };
}
