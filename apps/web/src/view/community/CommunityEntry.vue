<template>
  <div class="community-entry"><BLoading inline loading :title="t('community.entryLoading')" /></div>
</template>
<script setup lang="ts">
  import { onMounted, onBeforeUnmount } from 'vue';
  import { useRouter } from 'vue-router';
  import { useI18n } from 'vue-i18n';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  const { t } = useI18n();
  const router = useRouter();
  let left = false;
  onBeforeUnmount(() => {
    left = true;
  });
  onMounted(async () => {
    if (!left && router.currentRoute.value.path === '/community') {
      await router.replace({
        path: '/community/chat',
        query: router.currentRoute.value.query,
        hash: router.currentRoute.value.hash,
      });
    }
  });
</script>
<style scoped>
  .community-entry {
    display: grid;
    place-items: center;
    height: 100%;
  }
</style>
