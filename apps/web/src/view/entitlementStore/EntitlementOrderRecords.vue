<template>
  <BModal
    v-model:visible="visible"
    :title="t('entitlementStore.layout.historyAction')"
    width="var(--ui-layout-620, 620px)"
    :show-footer="false"
  >
    <BTabs
      v-model:active-tab="activeTab"
      variant="solid"
      class="order-records__tabs"
      :options="tabs"
      :aria-label="t('entitlementStore.layout.historyAction')"
    />
    <div class="order-records">
      <EntitlementPurchaseHistory
        :orders="orders"
        :authenticated="authenticated"
        :ready="ready && (!authenticated || loaded)"
        :error="error || stateError"
        :scope="scope"
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
      <slot v-if="scope === 'purchase' && ready && authenticated" name="current-order" />
      <div v-if="scope === 'history' && ready && authenticated" class="order-records__account">
        <BButton type="text" size="small" :aria-expanded="showAccount" @click="showAccount = !showAccount">
          {{ t('entitlementStore.layout.supportAccountAction') }}
        </BButton>
        <template v-if="showAccount">
          <SupportAccountPanel
            v-if="account && !accountError"
            :state="{ ...account, recentOrders: [] }"
            archived
            :unlinking="unlinking"
            :preference-saving="preferenceSaving"
            @link="openAfdianOAuthPage()"
            @unlink="confirmUnlink"
            @preference-change="savePreference"
          />
          <BButton v-else-if="accountError" type="text" size="small" @click="loadAccount">{{
            t('common.retry')
          }}</BButton>
          <BLoading v-else inline loading :title="t('entitlementStore.layout.historyLoading')" />
        </template>
      </div>
    </div>
  </BModal>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import {
    getAfdianSupportState,
    getEntitlementOrders,
    unlinkAfdianAccount,
    updateAfdianPublicPreference,
    type AfdianSupportOrder,
    type AfdianSupportState,
    type EntitlementOrderScope,
  } from '@/api/supportApi';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import BPagination from '@/components/base/BasicComponents/BPagination.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import { openAfdianOAuthPage } from '@/config/support';
  import { useUserStore } from '@/store';
  import EntitlementPurchaseHistory from './EntitlementPurchaseHistory.vue';
  import SupportAccountPanel from '@/view/support/SupportAccountPanel.vue';

  const visible = defineModel<boolean>('visible', { required: true });
  const scope = defineModel<EntitlementOrderScope>('scope', { required: true });
  const props = defineProps<{ authenticated: boolean; ready: boolean; stateError: boolean; revision: number }>();
  const emit = defineEmits<{ 'retry-state': [] }>();
  const { t } = useI18n();
  const user = useUserStore();
  const tabs = computed(() => [
    { key: 'purchase', label: t('entitlementStore.layout.resourcePurchase') },
    { key: 'history', label: t('entitlementStore.layout.pastSupport') },
  ]);
  const activeTab = computed<string>({
    get: () => scope.value,
    set(value) {
      scope.value = value === 'history' ? 'history' : 'purchase';
    },
  });
  const orders = ref<AfdianSupportOrder[]>([]);
  const page = ref(1);
  const pageSize = ref(10);
  const total = ref(0);
  const loaded = ref(false);
  const error = ref(false);
  const showAccount = ref(false);
  const account = ref<AfdianSupportState | null>(null);
  const accountError = ref(false);
  const unlinking = ref(false);
  const preferenceSaving = ref(false);
  let orderGeneration = 0;
  let accountGeneration = 0;

  async function loadOrders() {
    const generation = ++orderGeneration;
    loaded.value = false;
    error.value = false;
    orders.value = [];
    if (!visible.value || !props.ready || !props.authenticated || props.stateError) return;
    try {
      const result = await getEntitlementOrders(scope.value, page.value);
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

  async function loadAccount() {
    const generation = ++accountGeneration;
    accountError.value = false;
    if (!visible.value || scope.value !== 'history' || !props.authenticated || !showAccount.value) {
      account.value = null;
      return;
    }
    try {
      const next = await getAfdianSupportState();
      if (generation === accountGeneration) account.value = next;
    } catch {
      if (generation === accountGeneration) accountError.value = true;
    }
  }

  async function savePreference(value: { participateInRanking: boolean; showIdentity: boolean }) {
    if (preferenceSaving.value || unlinking.value || !account.value) return;
    preferenceSaving.value = true;
    const owner = user.id;
    try {
      const next = await updateAfdianPublicPreference(value);
      if (owner === user.id && account.value) account.value.publicPreference = next;
    } catch {
      if (owner === user.id) message.error(t('support.rankingPreferenceFailed'));
    } finally {
      preferenceSaving.value = false;
    }
  }

  function confirmUnlink() {
    const owner = user.id;
    Alert.alert({
      title: t('support.accountUnlinkTitle'),
      content: t('support.accountUnlinkDescription'),
      okText: t('support.accountUnlinkAction'),
      async onOk() {
        if (owner !== user.id || !account.value?.linked || unlinking.value || preferenceSaving.value) return;
        unlinking.value = true;
        try {
          await unlinkAfdianAccount();
          if (owner !== user.id) return;
          await loadAccount();
          message.success(t('support.accountUnlinkSuccess'));
        } catch {
          if (owner === user.id) message.error(t('support.accountUnlinkFailed'));
        } finally {
          unlinking.value = false;
        }
      },
    });
  }

  watch([visible, scope, () => user.id], () => {
    page.value = 1;
    showAccount.value = false;
    account.value = null;
  });
  watch(
    [
      visible,
      scope,
      page,
      () => props.ready,
      () => props.authenticated,
      () => props.stateError,
      () => props.revision,
      () => user.id,
    ],
    loadOrders,
  );
  watch([visible, scope, showAccount, () => props.authenticated, () => user.id], loadAccount);
  onBeforeUnmount(() => {
    ++orderGeneration;
    ++accountGeneration;
  });
</script>

<style scoped lang="less">
  .order-records {
    display: grid;
    gap: var(--ui-space-10, 10px);
    margin-top: var(--ui-space-10, 10px);
  }
  .order-records__tabs :deep(.tab) {
    flex: 1;
  }
  .order-records__account {
    border-top: 1px solid var(--surface-divider-color);
    padding-top: var(--ui-space-8, 8px);
  }
</style>
