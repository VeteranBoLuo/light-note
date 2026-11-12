<template>
  <AdminDataPage
    class="support-admin-page"
    eyebrow="Admin / Support"
    :title="t('adminSupport.title')"
    :subtitle="t('adminSupport.subtitle')"
    :toolbar-hint="toolbarHint"
    :summary-count="activeTab === 'overview' ? undefined : total"
    layout="scroll"
  >
    <template #actions>
      <BButton :loading="syncing" @click="forceSync">{{ t('adminSupport.forceSync') }}</BButton>
      <BButton type="primary" :loading="loading" @click="refresh">{{ t('common.refresh') }}</BButton>
    </template>

    <template #metrics>
      <li class="admin-stat-card is-success">
        <span class="admin-stat-label">{{ t('adminSupport.metrics.purchaseAmount') }}</span>
        <strong class="admin-stat-value">¥{{ overview.purchaseAmount }}</strong>
        <span class="admin-stat-hint">{{
          t('adminSupport.metrics.purchaseAmountHint', { count: overview.purchaseOrders })
        }}</span>
      </li>
      <li class="admin-stat-card">
        <span class="admin-stat-label">{{ t('adminSupport.metrics.orders') }}</span>
        <strong class="admin-stat-value">{{ overview.verifiedOrders }}</strong>
        <span class="admin-stat-hint">{{ t('adminSupport.metrics.ordersHint') }}</span>
      </li>
      <li class="admin-stat-card">
        <span class="admin-stat-label">{{ t('adminSupport.metrics.grantedTokens') }}</span>
        <strong class="admin-stat-value">{{ formatAiQuotaTokens(overview.grantedTokens, locale) }}</strong>
        <span class="admin-stat-hint">{{ t('adminSupport.metrics.grantedTokensHint') }}</span>
      </li>
      <li class="admin-stat-card">
        <span class="admin-stat-label">{{ t('adminSupport.metrics.grantedStorage') }}</span>
        <strong class="admin-stat-value">{{ formatStorageSize(overview.grantedStorageMb) }}</strong>
        <span class="admin-stat-hint">{{ t('adminSupport.metrics.grantedStorageHint') }}</span>
      </li>
      <li class="admin-stat-card" :class="{ 'has-warning': exceptionCount > 0 }">
        <span class="admin-stat-label">{{ t('adminSupport.metrics.exceptions') }}</span>
        <strong class="admin-stat-value">{{ exceptionCount }}</strong>
        <span class="admin-stat-hint">{{ t('adminSupport.metrics.exceptionsHint') }}</span>
      </li>
    </template>

    <template #toolbar>
      <BTabs v-model:active-tab="activeTab" variant="segment" :options="tabs" @change="changeTab" />
      <BInput
        v-if="!['overview', 'campaigns'].includes(activeTab)"
        v-model:value="search"
        class="support-admin__search"
        clearable
        :placeholder="t('adminSupport.searchPlaceholder')"
        @enter="applySearch"
      />
      <BSelect
        v-if="activeTab === 'orders'"
        v-model:value="orderState"
        class="support-admin__select"
        :options="orderStateOptions"
        @change="applySearch"
      />
      <BButton v-if="!['overview', 'campaigns'].includes(activeTab)" :disabled="loading" @click="applySearch">{{
        t('common.search')
      }}</BButton>
    </template>

    <div v-if="activeTab === 'overview'" class="support-admin__overview">
      <BCard padding="var(--ui-space-18, 18px)">
        <strong>{{ t('adminSupport.overview.privacyTitle') }}</strong>
        <p>{{ t('adminSupport.overview.privacyDescription') }}</p>
      </BCard>
      <BCard padding="var(--ui-space-18, 18px)">
        <strong>{{ t('adminSupport.overview.timeTitle') }}</strong>
        <p>{{ t('adminSupport.overview.timeDescription') }}</p>
      </BCard>
      <BCard padding="var(--ui-space-18, 18px)">
        <strong>{{ t('adminSupport.overview.safetyTitle') }}</strong>
        <p>{{ t('adminSupport.overview.safetyDescription') }}</p>
      </BCard>
      <BCard padding="var(--ui-space-18, 18px)">
        <strong>{{ t('adminSupport.overview.rewardTitle') }}</strong>
        <p>{{ t('adminSupport.overview.rewardDescription') }}</p>
      </BCard>
    </div>

    <SupportCampaignManagement v-else-if="activeTab === 'campaigns'" />

    <BTable
      v-else
      fill
      row-key="rowKey"
      :data="rows"
      :columns="columns"
      :loading="loading"
      :pagination="true"
      :total="total"
      :current-page="page"
      :page-size="pageSize"
      @page-change="changePage"
      @size-change="changePageSize"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'status'">
          <BChip :tone="statusTone(record as AdminSupportOrder)">{{ statusLabel(record as AdminSupportOrder) }}</BChip>
        </template>
        <template v-else-if="column.key === 'identity'">
          <strong>{{ record.alias || record.providerName || '-' }}</strong>
          <small>{{ record.providerName || record.lightNoteUserId || '-' }}</small>
        </template>
        <template v-else-if="column.key === 'amount'">¥{{ record.totalAmount }}</template>
        <template v-else-if="column.key === 'purpose'">
          <BChip :tone="purposeTone(record as AdminSupportOrder)">{{
            purposeLabel(record as AdminSupportOrder)
          }}</BChip>
        </template>
        <template v-else-if="column.key === 'reward'">
          <BChip :tone="rewardTone(record)">{{ rewardLabel(record) }}</BChip>
        </template>
        <template v-else-if="column.key === 'time'">{{
          formatTime(record.rankingObservedAt || record.verifiedAt)
        }}</template>
        <template v-else-if="column.key === 'actions'">
          <BButton
            v-if="record.grantStatus === 'manual_review' && record.reasonCode === 'large_amount'"
            size="small"
            :loading="actingKey === `reward:${record.providerOrderNo}`"
            @click.stop="confirmRewardApproval(record as AdminSupportOrder)"
          >
            {{ t('adminSupport.approveReward') }}
          </BButton>
          <BButton
            v-else-if="needsReconcile(record as AdminSupportOrder)"
            size="small"
            :loading="actingKey === `reconcile:${record.providerOrderNo}`"
            @click.stop="retryOrder(record.providerOrderNo)"
          >
            {{ t('adminSupport.retry') }}
          </BButton>
          <span v-else>-</span>
        </template>
      </template>
    </BTable>
  </AdminDataPage>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import AdminDataPage from '@/components/admin/AdminDataPage.vue';
  import SupportCampaignManagement from './SupportCampaignManagement.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import {
    forceAdminSupportSync,
    approveAdminSupportReward,
    getAdminSupportOrders,
    getAdminSupportOverview,
    reconcileAdminSupportOrder,
    type AdminSupportOrder,
    type AdminSupportOverview,
  } from '@/api/adminSupportApi';
  import { formatAiQuotaTokens } from '@/composables/useAiQuotaStatus';
  import { formatStorageSize } from '@/utils/common';

  type TabKey = 'overview' | 'orders' | 'exceptions' | 'campaigns';
  type Row = AdminSupportOrder & { rowKey?: string };

  const EMPTY_OVERVIEW: AdminSupportOverview = {
    verifiedOrders: 0,
    totalAmount: '0.00',
    purchaseOrders: 0,
    purchaseAmount: '0.00',
    monthAmount: '0.00',
    pendingOrders: 0,
    conflictOrders: 0,
    unlinkedOrders: 0,
    grantedTokens: 0,
    grantedStorageMb: 0,
    manualReviewRewards: 0,
    reversalReviewRewards: 0,
  };

  const { t, locale } = useI18n();
  const overview = ref({ ...EMPTY_OVERVIEW });
  const activeTab = ref<TabKey>('overview');
  const rows = ref<Row[]>([]);
  const total = ref(0);
  const page = ref(1);
  const pageSize = ref(20);
  const search = ref('');
  const orderState = ref('all');
  const loading = ref(false);
  const syncing = ref(false);
  const actingKey = ref('');

  const exceptionCount = computed(
    () =>
      overview.value.pendingOrders +
      overview.value.conflictOrders +
      overview.value.unlinkedOrders +
      overview.value.manualReviewRewards +
      overview.value.reversalReviewRewards,
  );
  const tabs = computed(() => [
    { key: 'overview', label: t('adminSupport.tabs.overview') },
    { key: 'orders', label: t('adminSupport.tabs.orders') },
    { key: 'campaigns', label: t('adminSupport.tabs.campaigns') },
    { key: 'exceptions', label: t('adminSupport.tabs.exceptions'), badge: exceptionCount.value || undefined },
  ]);
  const orderStateOptions = computed(() => [
    { value: 'all', label: t('adminSupport.states.all') },
    { value: 'verified', label: t('adminSupport.states.verified') },
    { value: 'pending', label: t('adminSupport.states.pending') },
    { value: 'conflict', label: t('adminSupport.states.conflict') },
    { value: 'unlinked', label: t('adminSupport.states.unlinked') },
    { value: 'reward_review', label: t('adminSupport.states.rewardReview') },
  ]);
  const toolbarHint = computed(() =>
    activeTab.value === 'overview'
      ? t('adminSupport.overviewHint')
      : activeTab.value === 'campaigns'
        ? t('adminSupport.campaigns.hint')
        : t('adminSupport.listHint'),
  );
  const columns = computed(() => [
    { title: t('adminSupport.columns.order'), key: 'providerOrderNo' },
    { title: t('adminSupport.columns.buyer'), key: 'identity' },
    { title: t('adminSupport.columns.amount'), key: 'amount', width: 'var(--ui-layout-110, 110px)' },
    { title: t('adminSupport.columns.purpose'), key: 'purpose', width: 'var(--ui-layout-120, 120px)' },
    { title: t('adminSupport.columns.status'), key: 'status', width: 'var(--ui-layout-110, 110px)' },
    { title: t('adminSupport.columns.reward'), key: 'reward', width: 'var(--ui-layout-160, 160px)' },
    { title: t('adminSupport.columns.time'), key: 'time', width: 'var(--ui-layout-150, 150px)' },
    { title: t('adminSupport.columns.operation'), key: 'actions', width: 'var(--ui-layout-120, 120px)' },
  ]);

  async function loadOverview() {
    overview.value = await getAdminSupportOverview();
  }

  async function loadRows() {
    if (['overview', 'campaigns'].includes(activeTab.value)) {
      rows.value = [];
      total.value = 0;
      return;
    }
    loading.value = true;
    try {
      const result = await getAdminSupportOrders({
        page: page.value,
        pageSize: pageSize.value,
        search: search.value,
        state: activeTab.value === 'exceptions' ? 'exceptions' : orderState.value === 'all' ? '' : orderState.value,
      });
      rows.value = result.items.map((item) => ({ ...item, rowKey: item.providerOrderNo }));
      total.value = result.total;
    } catch {
      message.error(t('adminSupport.loadFailed'));
    } finally {
      loading.value = false;
    }
  }

  async function refresh() {
    loading.value = true;
    try {
      await Promise.all([loadOverview(), loadRows()]);
    } catch {
      message.error(t('adminSupport.loadFailed'));
    } finally {
      loading.value = false;
    }
  }

  function changeTab() {
    page.value = 1;
    void loadRows();
  }

  function applySearch() {
    page.value = 1;
    void loadRows();
  }

  function changePage(value: number) {
    page.value = value;
    void loadRows();
  }

  function changePageSize(value: number) {
    pageSize.value = value;
    page.value = 1;
    void loadRows();
  }

  async function forceSync() {
    syncing.value = true;
    try {
      const result = await forceAdminSupportSync();
      message.success(t('adminSupport.syncSuccess', { count: result.synced }));
      await refresh();
    } catch {
      message.error(t('adminSupport.syncFailed'));
    } finally {
      syncing.value = false;
    }
  }

  async function retryOrder(providerOrderNo: string) {
    actingKey.value = `reconcile:${providerOrderNo}`;
    try {
      await reconcileAdminSupportOrder(providerOrderNo);
      message.success(t('adminSupport.retrySuccess'));
      await refresh();
    } catch {
      message.error(t('adminSupport.retryFailed'));
    } finally {
      actingKey.value = '';
    }
  }

  function confirmRewardApproval(record: AdminSupportOrder) {
    Alert.alert({
      title: t('adminSupport.rewardApprovalTitle'),
      content: t('adminSupport.rewardApprovalDescription', {
        amount: record.totalAmount,
        tokens: formatAiQuotaTokens(record.calculatedTokens, locale.value),
      }),
      okText: t('adminSupport.approveReward'),
      async onOk() {
        actingKey.value = `reward:${record.providerOrderNo}`;
        try {
          if (!record.lightNoteUserId) throw new Error('ADMIN_SUPPORT_REWARD_OWNER_MISSING');
          await approveAdminSupportReward({
            providerOrderNo: record.providerOrderNo,
            expectedTokens: record.calculatedTokens,
            expectedUserId: record.lightNoteUserId,
          });
          message.success(t('adminSupport.rewardApprovalSuccess'));
          await refresh();
        } catch {
          message.error(t('adminSupport.rewardApprovalFailed'));
        } finally {
          actingKey.value = '';
        }
      },
    });
  }

  function statusLabel(record: AdminSupportOrder) {
    if (record.verificationState === 'pending') return t('adminSupport.states.pending');
    if (record.providerStatus !== 2) return t('adminSupport.states.notCompleted');
    if (record.ownershipSource === 'conflict') return t('adminSupport.states.conflict');
    if (!record.lightNoteUserId) return t('adminSupport.states.unlinked');
    return t('adminSupport.states.verified');
  }

  function statusTone(record: AdminSupportOrder) {
    return record.verificationState === 'api_verified' &&
      record.lightNoteUserId &&
      record.ownershipSource !== 'conflict'
      ? 'success'
      : 'pending';
  }

  function purposeLabel(record: AdminSupportOrder) {
    return t(`adminSupport.purposes.${record.orderPurpose || 'unknown'}`);
  }

  function purposeTone(record: AdminSupportOrder): 'success' | 'pending' | 'neutral' {
    if (record.orderPurpose === 'donation' || record.orderPurpose === 'legacy_support') return 'success';
    if (record.orderPurpose === 'entitlement_purchase') return 'neutral';
    return 'pending';
  }

  function needsReconcile(record: AdminSupportOrder) {
    return (
      record.verificationState === 'pending' ||
      ['manual_review', 'reversal_review'].includes(String(record.grantStatus || ''))
    );
  }

  function rewardLabel(record: Row) {
    if (record.orderPurpose === 'donation') return t('adminSupport.rewardStates.no_entitlement');
    if (record.grantStatus === 'credited') {
      if (record.grantedTokens > 0 && record.grantedStorageMb > 0) {
        return t('adminSupport.rewardGrantedCombo', {
          tokens: formatAiQuotaTokens(record.grantedTokens, locale.value),
          storage: formatStorageSize(record.grantedStorageMb),
        });
      }
      if (record.grantedStorageMb > 0) {
        return t('adminSupport.rewardGrantedStorage', { storage: formatStorageSize(record.grantedStorageMb) });
      }
      return t('adminSupport.rewardGranted', { tokens: formatAiQuotaTokens(record.grantedTokens, locale.value) });
    }
    return t(`adminSupport.rewardStates.${record.grantStatus || 'syncing'}`);
  }

  function rewardTone(record: Row): 'success' | 'pending' | 'neutral' | 'danger' {
    if (record.grantStatus === 'credited') return 'success';
    if (record.grantStatus === 'reversal_review') return 'danger';
    if (['manual_review', 'pending_link'].includes(record.grantStatus || '')) return 'pending';
    return 'neutral';
  }

  function formatTime(value?: string | null) {
    if (!value) return '-';
    const date = new Date(value.replace(' ', 'T'));
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  onMounted(() => void refresh());
</script>

<style scoped lang="less">
  .support-admin-page {
    font-size: var(--ui-font-16, 16px);
  }
  .support-admin__search {
    width: min(var(--ui-layout-280, 280px), 100%);
  }

  .support-admin__select {
    width: var(--ui-layout-140, 140px);
  }

  .support-admin__overview {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--ui-space-12, 12px);
  }

  .support-admin__overview strong {
    color: var(--text-color);
    font-size: var(--ui-font-14, 14px);
  }

  .support-admin__overview p {
    margin: var(--ui-space-7, 7px) 0 0;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.7;
  }

  small {
    display: block;
    margin-top: var(--ui-space-2, 2px);
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
  }

  @media (max-width: 820px) {
    .support-admin__overview {
      grid-template-columns: 1fr;
    }

    .support-admin__search,
    .support-admin__select {
      width: 100%;
    }
  }
</style>
