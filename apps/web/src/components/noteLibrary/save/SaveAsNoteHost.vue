<template><SaveAsNoteDialog v-if="session" :session="session" @close="closeSaveAsNote" /></template>
<script setup lang="ts">
  import { defineAsyncComponent, watch, onBeforeUnmount } from 'vue';
  import { useRoute } from 'vue-router';
  import { useUserStore } from '@/store';
  import { buildNoteDetailRequestScope } from '@/api/noteDetailPrefetch';
  import { saveAsNoteSession as session, closeSaveAsNote } from '@/composables/useSaveAsNote';
  const SaveAsNoteDialog = defineAsyncComponent(() => import('./SaveAsNoteDialog.vue'));
  import { clearTranslationHandoff } from '@/utils/translationHandoff';
  import { resetNoteSaveDrafts } from './saveAsNoteState';
  const user = useUserStore();
  const route = useRoute();
  watch(() => buildNoteDetailRequestScope(user), clearTranslationHandoff);
  watch(
    () => [buildNoteDetailRequestScope(user), route.fullPath],
    () => {
      closeSaveAsNote();
      resetNoteSaveDrafts();
    },
  );
  onBeforeUnmount(() => {
    closeSaveAsNote();
    resetNoteSaveDrafts();
  });
</script>
