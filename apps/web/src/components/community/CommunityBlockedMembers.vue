<template>
  <section class="community-blocked-members">
    <h2>{{ t('communityChat.blocks.title') }}</h2>
    <BLoading class="community-section-loading" :loading="loading" :title="t('common.loading')">
      <p v-if="error" role="alert"
        >{{ t('communityChat.blocks.loadFailed') }} <BButton @click="load">{{ t('community.feed.retry') }}</BButton></p
      >
      <p v-else-if="!loading && !items.length">{{ t('communityChat.blocks.empty') }}</p>
      <div v-for="item in items" :key="item.id" class="blocked-member-row"
        ><span>{{ item.displayName }}</span
        ><BButton :disabled="Boolean(busy)" @click="unblock(item.id)">{{
          t('communityChat.blocks.unblock')
        }}</BButton></div
      >
    </BLoading>
  </section>
</template>
<script setup lang="ts">
  import { onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useUserStore } from '@/store';
  import {
    getCommunityChatBlocks,
    unblockCommunityChatUser,
    type CommunityChatBlockItem,
  } from '@/api/communityChatApi';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  const { t } = useI18n(),
    user = useUserStore();
  const items = ref<CommunityChatBlockItem[]>([]),
    loading = ref(false),
    error = ref(false),
    busy = ref('');
  let generation = 0;
  async function load() {
    const current = ++generation;
    loading.value = true;
    error.value = false;
    try {
      const result = await getCommunityChatBlocks();
      if (!Array.isArray(result.data?.items)) throw new Error('invalid blocks response');
      if (current === generation) items.value = result.data.items;
    } catch {
      if (current === generation) error.value = true;
    } finally {
      if (current === generation) loading.value = false;
    }
  }
  async function unblock(id: string) {
    if (busy.value) return;
    const current = generation;
    busy.value = id;
    try {
      await unblockCommunityChatUser(id);
      if (current === generation) items.value = items.value.filter((x) => x.id !== id);
    } catch {
      if (current === generation) error.value = true;
    } finally {
      if (current === generation) busy.value = '';
    }
  }
  watch(
    () => `${user.id}|${user.role}|${user.adminContext?.id || ''}`,
    () => {
      generation++;
      items.value = [];
      busy.value = '';
      if (user.id && user.role !== 'visitor' && !user.adminContext) void load();
    },
    { immediate: true },
  );
  onBeforeUnmount(() => generation++);
</script>
<style scoped>
  .community-blocked-members {
    padding: 20px 0;
    border-top: 1px solid var(--workspace-divider);
  }
  h2 {
    font-size: 16px;
  }
  .blocked-member-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    padding: 10px 0;
  }
  p {
    font-size: 13px;
    color: var(--desc-color);
  }
</style>

<style scoped>
  .community-section-loading {
    height: auto;
    min-height: 100px;
  }
  .community-section-loading[aria-busy='true'] :deep(.b-loading-content) {
    pointer-events: none;
  }
</style>
