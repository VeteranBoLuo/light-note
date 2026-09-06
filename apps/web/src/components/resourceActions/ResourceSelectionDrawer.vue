<template>
  <BDrawer
    :open="store.reviewOpen && !!store.module"
    :title="t('resourceSelection.title')"
    :mobile-full-screen="true"
    width="min(520px, 92vw)"
    @close="store.reviewOpen = false"
  >
    <div class="selection-review">
      <p v-if="store.query">{{ t('resourceSelection.allMatching') }} · {{ store.count }}</p>
      <p v-else>{{ t('resourceCenter.batch.selectedCount', { count: store.items.length }) }}</p>
      <div v-if="store.pendingReconcile" role="status">
        <p>{{ t('resourceSelection.pending') }}</p>
        <BButton :loading="checking" @click="retry">{{ t('resourceSelection.retry') }}</BButton>
      </div>
      <p v-if="!store.count">{{ t('resourceSelection.empty') }}</p>
      <div v-for="item in store.items" :key="resourceSelectionKey(item)" class="selection-review__row">
        <span>{{ t(`resourceOutcome.type.${item.type}`) }}</span>
        <strong>{{ item.title }}</strong>
        <BButton
          :disabled="store.busy"
          :aria-label="t('resourceSelection.remove', { title: item.title })"
          @click="store.setVisible([item], false)"
          >{{ t('common.cancel') }}</BButton
        >
      </div>
      <BButton :disabled="store.busy || !store.count" @click="store.clear()">{{
        t('resourceOutcome.batch.clear')
      }}</BButton>
    </div>
  </BDrawer>
</template>
<script setup lang="ts">
  import { ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import { useResourceSelectionStore, resourceSelectionKey } from '@/store/resourceSelection';
  import { previewSearchBatchSelection } from '@/api/search';
  const store = useResourceSelectionStore();
  const { t } = useI18n();
  const checking = ref(false);
  async function retry() {
    const pending = store.pendingReconcile;
    if (!pending || checking.value || store.busy) return;
    const operation = store.beginOperation(pending.items);
    if (!operation) return;
    checking.value = true;
    try {
      const response = await previewSearchBatchSelection(operation.selection, true);
      if (!store.isCurrent(operation) || response.status !== 200 || !Array.isArray(response.data?.unavailableItems))
        return;
      store.removeConfirmed(operation, response.data.unavailableItems);
      store.refreshItems(response.data.resolvedItems || []);
      store.pendingReconcile = null;
    } catch {
      /* 请求层提示失败，保留待核对状态。 */
    } finally {
      store.finish(operation);
      checking.value = false;
    }
  }
</script>
<style scoped lang="less">
  .selection-review {
    padding: 16px;
    color: var(--text-color);
  }
  .selection-review__row {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 52px;
    border-bottom: 1px solid var(--surface-border-color);
  }
  .selection-review__row strong {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .selection-review__row > span {
    color: var(--text-secondary-color);
  }
  @media (max-width: 768px) {
    .selection-review :deep(.b_btn) {
      min-height: 44px;
    }
  }
</style>
