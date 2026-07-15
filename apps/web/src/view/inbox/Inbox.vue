<template>
  <main class="inbox-page">
    <ResourceCenterSectionNav class="section-switcher" />
    <header class="inbox-hero">
      <div>
        <h1>{{ t('inbox.title') }}</h1>
        <p>{{ t('inbox.subtitle') }}</p>
      </div>
    </header>

    <section class="inbox-toolbar">
      <BTabs v-model:active-tab="inbox.filterType" :options="filterOptions" @change="changeFilter" />
      <div class="inbox-toolbar__right">
        <BInput v-model:value="inbox.keyword" :placeholder="t('inbox.searchPlaceholder')" clearable @enter="search" />
        <BSelect v-model:value="inbox.sort" :options="sortOptions" @change="search" />
      </div>
    </section>

    <section v-if="inbox.items.length" class="inbox-batch">
      <BCheckbox
        :model-value="allItemsSelected"
        :indeterminate="someItemsSelected"
        @update:model-value="toggleSelectAll"
      >
        {{ t('inbox.selectAll', { count: inbox.items.length }) }}
      </BCheckbox>
      <div class="inbox-batch__actions">
        <span>{{ t('inbox.selectedCount', { count: selectedItems.length }) }}</span>
        <BButton
          size="small"
          type="primary"
          :disabled="!selectedItems.length || hasPendingOperation"
          :loading="batchCompleting"
          @click="completeSelected"
        >
          {{ t('inbox.completeSelected') }}
        </BButton>
        <BButton
          size="small"
          type="danger"
          :disabled="!selectedItems.length || hasPendingOperation"
          :loading="batchDeleting"
          @click="confirmDelete(selectedItems, true)"
        >
          {{ t('inbox.deleteSelected') }}
        </BButton>
      </div>
    </section>

    <section v-if="inbox.loadFailed && inbox.items.length" class="inbox-error-banner">
      <span>{{ t('inbox.loadFailedDesc') }}</span>
      <BButton size="small" @click="refreshList">{{ t('inbox.retry') }}</BButton>
    </section>

    <section class="inbox-content" :class="{ 'has-top-fade': showTopFade, 'has-bottom-fade': showBottomFade }">
      <div ref="scrollContainer" class="inbox-scroll" @scroll="updateScrollFade">
        <BLoading :loading="inbox.loading" class="inbox-loading">
          <div v-if="!inbox.loading && inbox.loadFailed && inbox.items.length === 0" class="inbox-empty inbox-error">
            <div class="inbox-empty__icon">!</div>
            <h2>{{ t('inbox.loadFailedTitle') }}</h2>
            <p>{{ t('inbox.loadFailedDesc') }}</p>
            <BButton type="primary" @click="refreshList">{{ t('inbox.retry') }}</BButton>
          </div>
          <div
            v-else-if="!inbox.loading && inbox.items.length === 0"
            class="inbox-empty"
            :class="{ 'inbox-empty--filtered': !isInboxGloballyEmpty }"
          >
            <div class="inbox-empty__icon">{{ isInboxGloballyEmpty ? '✓' : '0' }}</div>
            <h2>{{ emptyStateTitle }}</h2>
            <p>{{ emptyStateDesc }}</p>
            <BButton type="primary" @click="openCapture">{{ emptyStateAction }}</BButton>
          </div>
          <div v-else class="inbox-list">
            <InboxItem
              v-for="item in inbox.items"
              :key="inbox.resourceKey(item)"
              :item="item"
              :selected="inbox.selectedKeys.includes(inbox.resourceKey(item))"
              :completing="completingKey === inbox.resourceKey(item)"
              :deleting="deletingKey === inbox.resourceKey(item)"
              :disabled="hasPendingOperation"
              @select="toggleSelected(item, $event)"
              @open="openResource(item)"
              @complete="completeOne(item)"
              @delete="confirmDelete([item])"
            />
          </div>
        </BLoading>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import InboxItem from '@/components/inbox/InboxItem.vue';
  import { inboxStore, useUserStore } from '@/store';
  import type { InboxItem as InboxItemType } from '@/api/inboxApi';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import { recordOperation } from '@/api/commonApi';
  import { OPERATION_LOG_MAP } from '@/config/logMap';
  import ResourceCenterSectionNav from '@/components/searchCenter/ResourceCenterSectionNav.vue';
  import { batchDeleteSearchResources, clearGlobalSearchCache } from '@/api/search';

  const { t } = useI18n();
  const router = useRouter();
  const inbox = inboxStore();
  const user = useUserStore();
  const completingKey = ref('');
  const deletingKey = ref('');
  const batchCompleting = ref(false);
  const batchDeleting = ref(false);
  const scrollContainer = ref<HTMLElement | null>(null);
  const showTopFade = ref(false);
  const showBottomFade = ref(false);
  let resizeObserver: ResizeObserver | null = null;

  const selectedItems = computed(() =>
    inbox.items.filter((item) => inbox.selectedKeys.includes(inbox.resourceKey(item))),
  );
  const allItemsSelected = computed(() => inbox.items.length > 0 && selectedItems.value.length === inbox.items.length);
  const someItemsSelected = computed(
    () => selectedItems.value.length > 0 && selectedItems.value.length < inbox.items.length,
  );
  const hasPendingOperation = computed(() =>
    Boolean(completingKey.value || deletingKey.value || batchCompleting.value || batchDeleting.value),
  );
  const isInboxGloballyEmpty = computed(() => inbox.pendingTotal === 0);
  const currentTypeLabel = computed(() =>
    inbox.filterType === 'all' ? t('inbox.all') : t(`inbox.${inbox.filterType}`),
  );
  const emptyStateTitle = computed(() => {
    if (isInboxGloballyEmpty.value) return t('inbox.emptyTitle');
    if (inbox.filterType === 'all') return t('inbox.filterEmptyTitle');
    return t('inbox.typeEmptyTitle', { type: currentTypeLabel.value });
  });
  const emptyStateDesc = computed(() => {
    if (isInboxGloballyEmpty.value) return t('inbox.emptyDesc');
    if (inbox.filterType === 'all') return t('inbox.filterEmptyDesc', { count: inbox.pendingTotal });
    return t('inbox.typeEmptyDesc', {
      type: currentTypeLabel.value,
      count: inbox.pendingTotal,
    });
  });
  const emptyStateAction = computed(() =>
    inbox.filterType === 'all' ? t('inbox.collectFirst') : t('inbox.collectType', { type: currentTypeLabel.value }),
  );

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
      await refreshList();
    },
  );

  onMounted(async () => {
    inbox.resetForOwner(user.id || 'visitor');
    await refreshList();
    if (scrollContainer.value) {
      resizeObserver = new ResizeObserver(updateScrollFade);
      resizeObserver.observe(scrollContainer.value);
    }
  });
  onBeforeUnmount(() => resizeObserver?.disconnect());

  watch(
    () => [inbox.items.length, inbox.loading],
    () => nextTick(updateScrollFade),
  );

  function openCapture() {
    if (blockGuestWrite('inbox-capture', t('inbox.guestPrompt'))) return;
    recordOperation(OPERATION_LOG_MAP.inbox.openCapture);
    inbox.openQuickCapture(inbox.filterType === 'all' ? 'note' : inbox.filterType);
  }
  async function changeFilter() {
    await refreshList(true);
  }
  async function search() {
    await refreshList(true);
  }
  async function refreshList(resetScroll = false) {
    const refreshed = await inbox.refreshList();
    await nextTick();
    if (resetScroll && scrollContainer.value) scrollContainer.value.scrollTop = 0;
    updateScrollFade();
    return refreshed;
  }
  function updateScrollFade() {
    const element = scrollContainer.value;
    if (!element) {
      showTopFade.value = false;
      showBottomFade.value = false;
      return;
    }
    showTopFade.value = element.scrollTop > 3;
    showBottomFade.value = element.scrollTop + element.clientHeight < element.scrollHeight - 3;
  }
  function toggleSelected(item: InboxItemType, selected: boolean) {
    const key = inbox.resourceKey(item);
    inbox.selectedKeys = selected
      ? Array.from(new Set([...inbox.selectedKeys, key]))
      : inbox.selectedKeys.filter((value) => value !== key);
  }
  function toggleSelectAll(selected: boolean) {
    inbox.selectedKeys = selected ? inbox.items.map((item) => inbox.resourceKey(item)) : [];
  }
  function openResource(item: InboxItemType) {
    recordOperation(OPERATION_LOG_MAP.inbox.openResource);
    if (item.resourceType === 'bookmark') {
      router.push({ path: `/manage/editBookmark/${item.resourceId}`, query: { organize: 'inbox' } });
    } else if (item.resourceType === 'note') {
      router.push({ path: `/noteLibrary/${item.resourceId}`, query: { organize: 'inbox' } });
    } else {
      router.push({
        path: '/cloudSpace',
        query: { fileId: item.resourceId, fileName: item.title, organize: 'inbox' },
      });
    }
  }
  async function completeOne(item: InboxItemType) {
    if (hasPendingOperation.value || blockGuestWrite('inbox-complete', t('inbox.guestPrompt'))) return;
    completingKey.value = inbox.resourceKey(item);
    try {
      const completed = await inbox.complete([item]);
      if (completed) {
        recordOperation(OPERATION_LOG_MAP.inbox.completeOne);
        message.success(t('inbox.completedSuccess'));
        await nextTick(updateScrollFade);
      }
    } finally {
      completingKey.value = '';
    }
  }
  async function completeSelected() {
    if (hasPendingOperation.value || blockGuestWrite('inbox-complete', t('inbox.guestPrompt'))) return;
    const selected = [...selectedItems.value];
    if (!selected.length) return;
    batchCompleting.value = true;
    try {
      const completed = await inbox.complete(selected);
      if (completed) {
        recordOperation({ ...OPERATION_LOG_MAP.inbox.completeBatch, operation: `批量整理完成【${completed}项】` });
        message.success(t('inbox.completedCount', { count: completed }));
        await nextTick(updateScrollFade);
      }
    } finally {
      batchCompleting.value = false;
    }
  }
  function confirmDelete(items: InboxItemType[], batchAction = false) {
    if (!items.length || hasPendingOperation.value || blockGuestWrite('inbox-delete', t('inbox.guestPrompt'))) return;
    Alert.alert({
      title: t('inbox.deleteConfirmTitle'),
      content:
        items.length === 1
          ? t('inbox.deleteConfirmOne', { name: items[0].title || t('inbox.untitled') })
          : t('inbox.deleteConfirmBatch', { count: items.length }),
      okText: t('inbox.deleteConfirmOk'),
      cancelText: t('common.cancel'),
      onOk: () => deleteResources(items, batchAction),
    });
  }
  async function deleteResources(items: InboxItemType[], isBatch: boolean) {
    if (isBatch) batchDeleting.value = true;
    else deletingKey.value = inbox.resourceKey(items[0]);
    try {
      const res = await batchDeleteSearchResources(
        items.map((item) => ({ id: item.resourceId, type: item.resourceType })),
      );
      if (Number(res?.status) !== 200) {
        message.error(res?.msg || t('inbox.deleteFailed'));
        return;
      }
      const affected = Number(res?.data?.affectedItemCount || 0);
      if (!affected) {
        message.warning(res?.msg || t('inbox.deleteFailed'));
        return;
      }
      recordOperation({
        ...(isBatch ? OPERATION_LOG_MAP.inbox.deleteBatch : OPERATION_LOG_MAP.inbox.deleteOne),
        operation: isBatch
          ? `批量移入回收站【选中${items.length}项，删除${affected}项】`
          : `移入回收站【${items[0].title || '未命名资源'}】`,
      });
      clearGlobalSearchCache();
      message.success(t('inbox.deleteSuccess', { count: affected }));
      await refreshList();
    } catch {
      message.error(t('inbox.deleteFailed'));
    } finally {
      batchDeleting.value = false;
      deletingKey.value = '';
    }
  }
</script>

<style scoped lang="less">
  .inbox-page {
    height: 100%;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    padding: 24px 24px 16px;
    box-sizing: border-box;
    color: var(--text-color);
  }
  .section-switcher {
    margin-bottom: 12px;
    flex-shrink: 0;
  }
  .inbox-hero {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 20px;
    margin: 0 0 18px;
    flex-shrink: 0;
  }
  h1 {
    margin: 0 0 6px;
    font-size: 28px;
  }
  .inbox-hero p {
    margin: 0;
    color: var(--desc-color);
  }
  .inbox-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 20px;
    margin-bottom: 16px;
    flex-shrink: 0;
  }
  .inbox-toolbar__right {
    display: grid;
    grid-template-columns: minmax(180px, 280px) 130px;
    gap: 8px;
  }
  .inbox-batch {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    padding: 10px 14px;
    min-height: 44px;
    box-sizing: border-box;
    border: 1px solid color-mix(in srgb, var(--primary-color) 16%, transparent);
    border-radius: 12px;
    background: color-mix(in srgb, var(--primary-color) 7%, var(--background-color));
    flex-shrink: 0;
  }
  .inbox-batch__actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .inbox-batch__actions > span {
    color: var(--desc-color);
    font-size: 13px;
  }
  .inbox-error-banner {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
    padding: 10px 14px;
    border-radius: 8px;
    color: var(--text-color);
    background: color-mix(in srgb, var(--danger-color, #e5484d) 10%, transparent);
    flex-shrink: 0;
  }
  .inbox-content {
    position: relative;
    min-height: 0;
    flex: 1;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--card-border-color) 80%, transparent);
    border-radius: 18px;
    background: color-mix(in srgb, var(--background-color) 96%, var(--primary-color) 4%);
    box-shadow: 0 10px 34px rgba(28, 33, 66, 0.04);
  }
  .inbox-content::before,
  .inbox-content::after {
    position: absolute;
    left: 0;
    right: 0;
    z-index: 2;
    height: 44px;
    content: '';
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.18s ease;
  }
  .inbox-content::before {
    top: 0;
    background: linear-gradient(to bottom, var(--background-color), transparent);
  }
  .inbox-content::after {
    bottom: 0;
    background: linear-gradient(to top, var(--background-color), transparent);
  }
  .inbox-content.has-top-fade::before,
  .inbox-content.has-bottom-fade::after {
    opacity: 0.96;
  }
  .inbox-scroll {
    height: 100%;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior-y: contain;
    scrollbar-gutter: stable;
    -webkit-overflow-scrolling: touch;
  }
  .inbox-loading {
    min-height: 100%;
  }
  .inbox-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 10px 12px 22px;
  }
  .inbox-empty {
    min-height: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
  }
  .inbox-empty__icon {
    width: 54px;
    height: 54px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    color: #fff;
    background: #615ced;
    font-size: 24px;
  }
  .inbox-error .inbox-empty__icon {
    background: var(--danger-color, #e5484d);
  }
  .inbox-empty--filtered .inbox-empty__icon {
    border: 1px solid color-mix(in srgb, var(--primary-color) 24%, transparent);
    background: color-mix(in srgb, var(--primary-color) 10%, var(--background-color));
    color: var(--primary-color);
  }
  .inbox-empty h2 {
    margin: 14px 0 6px;
  }
  .inbox-empty p {
    color: var(--desc-color);
    margin: 0 0 16px;
  }
  @media (max-width: 900px) {
    .inbox-page {
      padding: 12px;
    }
  }
  @media (max-width: 767px) {
    .inbox-hero {
      align-items: center;
    }
    h1 {
      font-size: 22px;
    }
    .inbox-toolbar {
      display: block;
      overflow: hidden;
    }
    .inbox-toolbar :deep(.tab-container) {
      overflow-x: auto;
    }
    .inbox-toolbar__right {
      grid-template-columns: 1fr 110px;
      margin-top: 10px;
    }
    .inbox-batch {
      align-items: flex-start;
      gap: 8px;
    }
    .inbox-batch__actions {
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .inbox-batch__actions > span {
      width: 100%;
      text-align: right;
    }
    .inbox-list {
      padding: 8px 8px 18px;
    }
  }
</style>
