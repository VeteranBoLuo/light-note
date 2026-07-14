<template>
  <main class="inbox-page">
    <header class="inbox-hero">
      <div>
        <h1>{{ t('inbox.title') }}</h1>
        <p>{{ t('inbox.subtitle') }}</p>
      </div>
      <BButton type="primary" @click="openCapture">{{ t('inbox.quickCapture') }}</BButton>
    </header>

    <section class="inbox-toolbar">
      <BTabs v-model:active-tab="inbox.filterType" :options="filterOptions" @change="changeFilter" />
      <div class="inbox-toolbar__right">
        <BInput v-model:value="inbox.keyword" :placeholder="t('inbox.searchPlaceholder')" clearable @enter="search" />
        <BSelect v-model:value="inbox.sort" :options="sortOptions" @change="search" />
      </div>
    </section>

    <section v-if="inbox.selectedKeys.length" class="inbox-batch">
      <span>{{ t('inbox.selectedCount', { count: inbox.selectedKeys.length }) }}</span>
      <BButton size="small" type="primary" :loading="batchCompleting" @click="completeSelected">
        {{ t('inbox.completeSelected') }}
      </BButton>
    </section>

    <BLoading :loading="inbox.loading" class="inbox-loading">
      <div v-if="!inbox.loading && inbox.items.length === 0" class="inbox-empty">
        <div class="inbox-empty__icon">✓</div>
        <h2>{{ t('inbox.emptyTitle') }}</h2>
        <p>{{ t('inbox.emptyDesc') }}</p>
        <BButton type="primary" @click="openCapture">{{ t('inbox.collectFirst') }}</BButton>
      </div>
      <div v-else class="inbox-list">
        <InboxItem
          v-for="item in inbox.items"
          :key="inbox.resourceKey(item)"
          :item="item"
          :selected="inbox.selectedKeys.includes(inbox.resourceKey(item))"
          :completing="completingKey === inbox.resourceKey(item)"
          @select="toggleSelected(item, $event)"
          @open="openResource(item)"
          @complete="completeOne(item)"
        />
      </div>
    </BLoading>

    <BPagination
      v-if="inbox.total > 0"
      :current="inbox.currentPage"
      :page-size="inbox.pageSize"
      :total="inbox.total"
      @page-change="changePage"
      @size-change="changeSize"
    />

    <QuickCaptureModal v-model:visible="inbox.quickCaptureVisible" @captured="inbox.refreshList()" />
  </main>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import BPagination from '@/components/base/BasicComponents/BPagination.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import InboxItem from '@/components/inbox/InboxItem.vue';
  import QuickCaptureModal from '@/components/inbox/QuickCaptureModal.vue';
  import { inboxStore, useUserStore } from '@/store';
  import type { InboxItem as InboxItemType } from '@/api/inboxApi';
  import { blockGuestWrite } from '@/composables/useGuestGuard';

  const { t } = useI18n();
  const router = useRouter();
  const inbox = inboxStore();
  const user = useUserStore();
  const completingKey = ref('');
  const batchCompleting = ref(false);

  const filterOptions = computed(() => [
    { key: 'all', label: `${t('inbox.all')} ${inbox.pendingTotal}` },
    { key: 'bookmark', label: `${t('inbox.bookmark')} ${inbox.typeTotals.bookmark}` },
    { key: 'note', label: `${t('inbox.note')} ${inbox.typeTotals.note}` },
    { key: 'file', label: `${t('inbox.file')} ${inbox.typeTotals.file}` },
  ]);
  const sortOptions = computed(() => [
    { label: t('inbox.newest'), value: 'newest' },
    { label: t('inbox.oldest'), value: 'oldest' },
  ]);

  watch(
    () => user.id,
    async (id) => {
      inbox.resetForOwner(id || 'visitor');
      await inbox.refreshList();
    },
  );

  onMounted(async () => {
    inbox.resetForOwner(user.id || 'visitor');
    await inbox.refreshList();
  });

  function openCapture() {
    if (blockGuestWrite('inbox-capture', t('inbox.guestPrompt'))) return;
    inbox.quickCaptureVisible = true;
  }
  async function changeFilter() { inbox.currentPage = 1; await inbox.refreshList(); }
  async function search() { inbox.currentPage = 1; await inbox.refreshList(); }
  async function changePage(page: number) { inbox.currentPage = page; await inbox.refreshList(); }
  async function changeSize(size: number) { inbox.pageSize = Math.min(50, size); inbox.currentPage = 1; await inbox.refreshList(); }
  function toggleSelected(item: InboxItemType, selected: boolean) {
    const key = inbox.resourceKey(item);
    inbox.selectedKeys = selected
      ? Array.from(new Set([...inbox.selectedKeys, key]))
      : inbox.selectedKeys.filter((value) => value !== key);
  }
  function openResource(item: InboxItemType) {
    if (item.resourceType === 'bookmark') router.push(`/manage/editBookmark/${item.resourceId}`);
    else if (item.resourceType === 'note') router.push(`/noteLibrary/${item.resourceId}`);
    else router.push({ path: '/cloudSpace', query: { fileName: item.title } });
  }
  async function completeOne(item: InboxItemType) {
    if (blockGuestWrite('inbox-complete', t('inbox.guestPrompt'))) return;
    completingKey.value = inbox.resourceKey(item);
    try {
      const completed = await inbox.complete([item]);
      if (completed) message.success(t('inbox.completedSuccess'));
    } finally { completingKey.value = ''; }
  }
  async function completeSelected() {
    if (blockGuestWrite('inbox-complete', t('inbox.guestPrompt'))) return;
    const selected = inbox.items.filter((item) => inbox.selectedKeys.includes(inbox.resourceKey(item)));
    if (!selected.length) return;
    batchCompleting.value = true;
    try {
      const completed = await inbox.complete(selected);
      if (completed) message.success(t('inbox.completedCount', { count: completed }));
    } finally { batchCompleting.value = false; }
  }
</script>

<style scoped lang="less">
  .inbox-page { min-height: calc(100vh - 60px); padding: 34px 5vw 60px; box-sizing: border-box; color: var(--text-color); }
  .inbox-hero { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; margin-bottom: 24px; }
  h1 { margin: 0 0 6px; font-size: 28px; } .inbox-hero p { margin: 0; color: var(--desc-color); }
  .inbox-toolbar { display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; margin-bottom: 16px; }
  .inbox-toolbar__right { display: grid; grid-template-columns: minmax(180px, 280px) 130px; gap: 8px; }
  .inbox-batch { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding: 10px 14px; border-radius: 8px; background: rgba(97, 92, 237, .1); }
  .inbox-loading { min-height: 280px; }
  .inbox-list { display: flex; flex-direction: column; gap: 12px; }
  .inbox-empty { min-height: 300px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
  .inbox-empty__icon { width: 54px; height: 54px; border-radius: 50%; display: grid; place-items: center; color: #fff; background: #615ced; font-size: 24px; }
  .inbox-empty h2 { margin: 14px 0 6px; } .inbox-empty p { color: var(--desc-color); margin: 0 0 16px; }
  :deep(.bpagination) { margin-top: 20px; }
  @media (max-width: 767px) {
    .inbox-page { padding: 18px 14px 44px; }
    .inbox-hero { align-items: center; } h1 { font-size: 22px; }
    .inbox-toolbar { display: block; overflow: hidden; }
    .inbox-toolbar :deep(.tab-container) { overflow-x: auto; }
    .inbox-toolbar__right { grid-template-columns: 1fr 110px; margin-top: 10px; }
  }
</style>
