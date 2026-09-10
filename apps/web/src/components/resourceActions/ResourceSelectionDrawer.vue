<template>
  <BDrawer
    :open="store.reviewOpen && !!store.module"
    :title="t('resourceSelection.title')"
    :mobile-full-screen="true"
    width="min(520px, 92vw)"
    body-padding="0"
    @close="store.reviewOpen = false"
  >
    <div class="selection-review">
      <div v-auto-scrollbar class="selection-review__content">
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
            class="selection-review__remove"
            :disabled="store.busy"
            :aria-label="t('resourceSelection.remove', { title: item.title })"
            @click="store.setVisible([item], false)"
            >{{ t('common.cancel') }}</BButton
          >
        </div>
      </div>
      <div class="selection-review__footer">
        <BButton class="selection-review__clear" :disabled="store.busy || !store.count" @click="store.clear()">
          {{ t('resourceOutcome.batch.clear') }}
        </BButton>
      </div>
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
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    color: var(--text-color);
  }
  .selection-review__content {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 16px 24px;
  }
  .selection-review__footer {
    flex-shrink: 0;
    display: flex;
    justify-content: flex-end;
    padding: 16px 24px max(16px, env(safe-area-inset-bottom));
    border-top: 1px solid var(--surface-border-color);
  }
  .selection-review__clear {
    background: transparent;
    border: 1px solid var(--surface-border-color);
    border-radius: 8px;
  }
  .selection-review__remove {
    flex-shrink: 0;
    background: transparent;
    color: var(--workspace-purple-text);
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
  @media (max-width: 767px) {
    .selection-review__content {
      padding: 12px 16px;
    }
    .selection-review__footer {
      padding-inline: 16px;
    }
    .selection-review__clear {
      width: 100%;
      height: 44px;
    }
  }
</style>
