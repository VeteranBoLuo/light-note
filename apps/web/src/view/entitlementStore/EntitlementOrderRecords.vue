<template>
  <BModal
    v-model:visible="visible"
    :title="t('entitlementStore.layout.historyAction')"
    width="var(--ui-layout-620, 620px)"
    :show-footer="false"
  >
    <div class="order-records">
      <EntitlementPurchaseHistory
        :orders="orders"
        :authenticated="authenticated"
        :ready="ready && (!authenticated || loaded)"
        :error="error || stateError"
        @retry="stateError ? emit('retry-state') : loadOrders()"
      />
      <BPagination
        v-if="loaded && !error && total > pageSize"
        :current="page"
        :page-size="pageSize"
        :total="total"
        :show-size-selector="false"
        @page-change="page = $event"
      />
      <slot v-if="ready && authenticated" name="current-order" />
    </div>
  </BModal>
</template>

<script setup lang="ts">
  import { onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { getEntitlementOrders, type AfdianSupportOrder } from '@/api/supportApi';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BPagination from '@/components/base/BasicComponents/BPagination.vue';
  import { useUserStore } from '@/store';
  import EntitlementPurchaseHistory from './EntitlementPurchaseHistory.vue';

  const visible = defineModel<boolean>('visible', { required: true });
  const props = defineProps<{ authenticated: boolean; ready: boolean; stateError: boolean; revision: number }>();
  const emit = defineEmits<{ 'retry-state': [] }>();
  const { t } = useI18n();
  const user = useUserStore();
  const orders = ref<AfdianSupportOrder[]>([]);
  const page = ref(1);
  const pageSize = ref(10);
  const total = ref(0);
  const loaded = ref(false);
  const error = ref(false);
  let orderGeneration = 0;

  async function loadOrders() {
    const generation = ++orderGeneration;
    loaded.value = false;
    error.value = false;
    orders.value = [];
    if (!visible.value || !props.ready || !props.authenticated || props.stateError) return;
    try {
      const result = await getEntitlementOrders(page.value);
      if (generation !== orderGeneration) return;
      const lastPage = Math.max(1, Math.ceil(result.total / result.pageSize));
      if (result.page > lastPage) {
        page.value = lastPage;
        return;
      }
      orders.value = result.items;
      total.value = result.total;
      pageSize.value = result.pageSize;
      loaded.value = true;
    } catch {
      if (generation === orderGeneration) error.value = true;
    }
  }

  watch([visible, () => user.id], () => {
    page.value = 1;
  });
  watch(
    [
      visible,
      page,
      () => props.ready,
      () => props.authenticated,
      () => props.stateError,
      () => props.revision,
      () => user.id,
    ],
    loadOrders,
  );
  onBeforeUnmount(() => {
    ++orderGeneration;
  });
</script>

<style scoped lang="less">
  .order-records {
    display: grid;
    gap: var(--ui-space-10, 10px);
  }
</style>
