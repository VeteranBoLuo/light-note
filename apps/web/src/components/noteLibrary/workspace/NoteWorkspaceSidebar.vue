<template>
  <NoteLibrarySidebar v-bind="$attrs">
    <template #outline>
      <slot name="outline" />
    </template>
  </NoteLibrarySidebar>
</template>

<script setup lang="ts">
  import NoteLibrarySidebar from '@/components/noteLibrary/tree/NoteLibrarySidebar.vue';

  defineOptions({ inheritAttrs: false });
</script>
