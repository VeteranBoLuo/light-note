<template>
  <ResourceProjectDialog v-if="handoff" :key="handoff.token" :handoff="handoff" @close="close" />
</template>
<script setup lang="ts">
  import { defineAsyncComponent, watch } from 'vue';
  import { projectResourceHandoff as handoff } from '@/composables/useProjectResourceAction';
  import { useUserStore } from '@/store';
  import { toolboxRecentUseIdentityKey } from '@/utils/toolboxRecentUse';
  const ResourceProjectDialog = defineAsyncComponent(() => import('./ResourceProjectDialog.vue'));
  const user = useUserStore();
  function close(token: number) {
    if (handoff.value?.token === token) handoff.value = null;
  }
  watch(
    () => toolboxRecentUseIdentityKey(user),
    () => {
      handoff.value = null;
    },
  );
</script>
