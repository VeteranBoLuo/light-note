<template>
  <ResourceBatchTagsDrawer
    v-if="handoff?.drawer"
    :key="handoff.token"
    :operation-key="handoff.token"
    :selection="handoff.operation.selection"
    :initial-items="handoff.operation.items"
    :count="handoff.operation.selection.mode === 'allMatching' ? store.count : handoff.operation.items.length"
    :initial-mode="handoff.mode"
    :is-current="currentOperation(handoff)"
    @updated="store.completeTags"
    @close="store.closeTags"
  />
</template>
<script setup lang="ts">
  import { computed, defineAsyncComponent } from 'vue';
  import { useResourceSelectionStore } from '@/store/resourceSelection';
  const ResourceBatchTagsDrawer = defineAsyncComponent(() => import('./ResourceBatchTagsDrawer.vue'));
  const store = useResourceSelectionStore();
  const handoff = computed(() => store.handoff);
  function currentOperation(snapshot: NonNullable<typeof store.handoff>) {
    return () => store.handoff?.token === snapshot.token && store.busy && store.isCurrent(snapshot.operation);
  }
</script>
