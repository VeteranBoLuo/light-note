<template>
  <AdminDataPage
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
        <span class="admin-stat-label">{{ t('adminSupport.metrics.totalAmount') }}</span>
        <strong class="admin-stat-value">¥{{ overview.totalAmount }}</strong>
        <span class="admin-stat-hint">{{ t('adminSupport.metrics.totalAmountHint') }}</span>
      </li>
      <li class="admin-stat-card">
        <span class="admin-stat-label">{{ t('adminSupport.metrics.monthAmount') }}</span>
        <strong class="admin-stat-value">¥{{ overview.monthAmount }}</strong>
        <span class="admin-stat-hint">{{ t('adminSupport.metrics.monthAmountHint') }}</span>
      </li>
      <li class="admin-stat-card">
        <span class="admin-stat-label">{{ t('adminSupport.metrics.orders') }}</span>
        <strong class="admin-stat-value">{{ overview.verifiedOrders }}</strong>
        <span class="admin-stat-hint">{{ t('adminSupport.metrics.ordersHint') }}</span>
      </li>
      <li class="admin-stat-card">
        <span class="admin-stat-label">{{ t('adminSupport.metrics.supporters') }}</span>
        <strong class="admin-stat-value">{{ overview.assignedSupporters }}</strong>
        <span class="admin-stat-hint">{{ t('adminSupport.metrics.supportersHint') }}</span>
      </li>
      <li class="admin-stat-card">
        <span class="admin-stat-label">{{ t('adminSupport.metrics.links') }}</span>
        <strong class="admin-stat-value">{{ overview.linkedAccounts }}</strong>
        <span class="admin-stat-hint">{{ t('adminSupport.metrics.linksHint') }}</span>
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
        v-if="activeTab !== 'overview'"
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
      <BButton v-if="activeTab !== 'overview'" :disabled="loading" @click="applySearch">{{ t('common.search') }}</BButton>
    </template>

    <div v-if="activeTab === 'overview'" class="support-admin__overview">
      <BCard padding="18px">
        <strong>{{ t('adminSupport.overview.privacyTitle') }}</strong>
        <p>{{ t('adminSupport.overview.privacyDescription') }}</p>
      </BCard>
      <BCard padding="18px">
        <strong>{{ t('adminSupport.overview.timeTitle') }}</strong>
        <p>{{ t('adminSupport.overview.timeDescription') }}</p>
      </BCard>
      <BCard padding="18px">
        <strong>{{ t('adminSupport.overview.safetyTitle') }}</strong>
        <p>{{ t('adminSupport.overview.safetyDescription') }}</p>
      </BCard>
    </div>

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
        <template v-else-if="column.key === 'time'">{{ formatTime(record.lastSupportAt || record.rankingObservedAt || record.verifiedAt) }}</template>
        <template v-else-if="column.key === 'visibility'">
          <BChip :tone="visibilityTone(record as AdminSupporter)">{{
            visibilityLabel(record as AdminSupporter)
          }}</BChip>
        </template>
        <template v-else-if="column.key === 'actions'">
          <BButton
            v-if="activeTab === 'supporters'"
            size="small"
            @click.stop="openVisibility(record as AdminSupporter)"
          >
            {{ record.adminHidden ? t('adminSupport.restoreIdentity') : t('adminSupport.hideIdentity') }}
          </BButton>
          <BButton
            v-else-if="record.verificationState === 'pending'"
            size="small"
            :loading="actingKey === record.providerOrderNo"
            @click.stop="retryOrder(record.providerOrderNo)"
          >
            {{ t('adminSupport.retry') }}
          </BButton>
          <span v-else>-</span>
        </template>
      </template>
    </BTable>
  </AdminDataPage>

  <BModal
    v-model:visible="visibilityModal"
    :title="visibilityTarget?.adminHidden ? t('adminSupport.restoreIdentity') : t('adminSupport.hideIdentity')"
    width="min(520px, 94vw)"
    :show-footer="true"
    @ok="saveVisibility"
  >
    <p class="support-admin__modal-copy">{{ t('adminSupport.hideIdentityDescription') }}</p>
    <BInput
      v-if="!visibilityTarget?.adminHidden"
      v-model:value="visibilityReason"
      :placeholder="t('adminSupport.hideReasonPlaceholder')"
      :maxlength="255"
    />
    <template #footer>
      <div class="support-admin__modal-footer">
        <BButton @click="visibilityModal = false">{{ t('common.cancel') }}</BButton>
        <BButton type="primary" :loading="visibilitySaving" @click="saveVisibility">{{ t('common.confirm') }}</BButton>
      </div>
    </template>
  </BModal>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import AdminDataPage from '@/components/admin/AdminDataPage.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import {
    forceAdminSupportSync,
    getAdminSupportOrders,
    getAdminSupportOverview,
    getAdminSupporters,
    reconcileAdminSupportOrder,
    setAdminSupportIdentityHidden,
    type AdminSupportOrder,
    type AdminSupportOverview,
    type AdminSupporter,
  } from '@/api/adminSupportApi';

  type TabKey = 'overview' | 'orders' | 'supporters' | 'exceptions';
  type Row = (AdminSupportOrder | AdminSupporter) & { rowKey?: string };

  const EMPTY_OVERVIEW: AdminSupportOverview = {
    verifiedOrders: 0,
    assignedSupporters: 0,
    totalAmount: '0.00',
    monthAmount: '0.00',
    linkedAccounts: 0,
    pendingOrders: 0,
    conflictOrders: 0,
    unlinkedOrders: 0,
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
  const visibilityModal = ref(false);
  const visibilityTarget = ref<AdminSupporter | null>(null);
  const visibilityReason = ref('');
  const visibilitySaving = ref(false);

  const exceptionCount = computed(
    () => overview.value.pendingOrders + overview.value.conflictOrders + overview.value.unlinkedOrders,
  );
  const tabs = computed(() => [
    { key: 'overview', label: t('adminSupport.tabs.overview') },
    { key: 'orders', label: t('adminSupport.tabs.orders') },
    { key: 'supporters', label: t('adminSupport.tabs.supporters') },
    { key: 'exceptions', label: t('adminSupport.tabs.exceptions'), badge: exceptionCount.value || undefined },
  ]);
  const orderStateOptions = computed(() => [
    { value: 'all', label: t('adminSupport.states.all') },
    { value: 'verified', label: t('adminSupport.states.verified') },
    { value: 'pending', label: t('adminSupport.states.pending') },
    { value: 'conflict', label: t('adminSupport.states.conflict') },
    { value: 'unlinked', label: t('adminSupport.states.unlinked') },
  ]);
  const toolbarHint = computed(() =>
    activeTab.value === 'overview' ? t('adminSupport.overviewHint') : t('adminSupport.listHint'),
  );
  const columns = computed(() =>
    activeTab.value === 'supporters'
      ? [
          { title: t('adminSupport.columns.supporter'), key: 'identity' },
          { title: t('adminSupport.columns.amount'), key: 'amount', width: '110px' },
          { title: t('adminSupport.columns.orders'), key: 'orderCount', width: '90px' },
          { title: t('adminSupport.columns.visibility'), key: 'visibility', width: '130px' },
          { title: t('adminSupport.columns.lastSupport'), key: 'time', width: '150px' },
          { title: t('adminSupport.columns.operation'), key: 'actions', width: '110px' },
        ]
      : [
          { title: t('adminSupport.columns.order'), key: 'providerOrderNo' },
          { title: t('adminSupport.columns.supporter'), key: 'identity' },
          { title: t('adminSupport.columns.amount'), key: 'amount', width: '110px' },
          { title: t('adminSupport.columns.status'), key: 'status', width: '110px' },
          { title: t('adminSupport.columns.time'), key: 'time', width: '150px' },
          { title: t('adminSupport.columns.operation'), key: 'actions', width: '100px' },
        ],
  );

  async function loadOverview() {
    overview.value = await getAdminSupportOverview();
  }

  async function loadRows() {
    if (activeTab.value === 'overview') {
      rows.value = [];
      total.value = 0;
      return;
    }
    loading.value = true;
    try {
      const result =
        activeTab.value === 'supporters'
          ? await getAdminSupporters({ page: page.value, pageSize: pageSize.value, search: search.value })
          : await getAdminSupportOrders({
              page: page.value,
              pageSize: pageSize.value,
              search: search.value,
              state: activeTab.value === 'exceptions' ? 'exceptions' : orderState.value === 'all' ? '' : orderState.value,
            });
      rows.value = result.items.map((item: AdminSupportOrder | AdminSupporter) => ({
        ...item,
        rowKey: 'providerOrderNo' in item ? item.providerOrderNo : item.userId,
      }));
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
    actingKey.value = providerOrderNo;
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

  function openVisibility(record: AdminSupporter) {
    visibilityTarget.value = record;
    visibilityReason.value = '';
    visibilityModal.value = true;
  }

  async function saveVisibility() {
    const target = visibilityTarget.value;
    if (!target) return;
    if (!target.adminHidden && !visibilityReason.value.trim()) {
      message.warning(t('adminSupport.hideReasonRequired'));
      return;
    }
    visibilitySaving.value = true;
    try {
      await setAdminSupportIdentityHidden({
        userId: target.userId,
        hidden: !Boolean(target.adminHidden),
        reason: visibilityReason.value,
      });
      visibilityModal.value = false;
      message.success(t('adminSupport.visibilitySaved'));
      await loadRows();
    } catch {
      message.error(t('adminSupport.visibilityFailed'));
    } finally {
      visibilitySaving.value = false;
    }
  }

  function statusLabel(record: AdminSupportOrder) {
    if (record.verificationState === 'pending') return t('adminSupport.states.pending');
    if (record.providerStatus !== 2) return t('adminSupport.states.notCompleted');
    if (record.ownershipSource === 'conflict') return t('adminSupport.states.conflict');
    if (!record.lightNoteUserId) return t('adminSupport.states.unlinked');
    return t('adminSupport.states.verified');
  }

  function statusTone(record: AdminSupportOrder) {
    return record.verificationState === 'api_verified' && record.lightNoteUserId && record.ownershipSource !== 'conflict'
      ? 'success'
      : 'warning';
  }

  function visibilityLabel(record: AdminSupporter) {
    if (!record.participateInRanking) return t('adminSupport.visibility.excluded');
    if (record.adminHidden) return t('adminSupport.visibility.hidden');
    return record.showIdentity ? t('adminSupport.visibility.public') : t('adminSupport.visibility.anonymous');
  }

  function visibilityTone(record: AdminSupporter) {
    return record.adminHidden ? 'pending' : record.showIdentity ? 'success' : 'neutral';
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
  .support-admin__search {
    width: min(280px, 100%);
  }

  .support-admin__select {
    width: 140px;
  }

  .support-admin__overview {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }

  .support-admin__overview strong {
    color: var(--text-color);
    font-size: 14px;
  }

  .support-admin__overview p,
  .support-admin__modal-copy {
    margin: 7px 0 0;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.7;
  }

  small {
    display: block;
    margin-top: 2px;
    color: var(--desc-color);
    font-size: 11px;
  }

  .support-admin__modal-copy {
    margin: 0 0 12px;
  }

  .support-admin__modal-footer {
    padding: 12px 16px;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    border-top: 1px solid var(--surface-border-color);
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
