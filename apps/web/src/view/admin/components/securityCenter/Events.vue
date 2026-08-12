<template>
  <div class="security-v2-page security-review-v2">
    <header class="security-v2-header">
      <div
        ><h2>{{ t('securityV2.review.title') }}</h2
        ><p>{{ t('securityV2.review.subtitle') }}</p></div
      >
      <div class="security-v2-actions">
        <BButton v-if="returnTo" @click="goBackToQueue">{{ t('securityV2.review.backToQueue') }}</BButton>
        <BButton @click="exportEvidence">{{ t('securityV2.review.export') }}</BButton>
      </div>
    </header>

    <section v-if="lastReceipt" class="security-review-receipt">
      <div>
        <strong>{{ t('securityV2.review.receiptTitle') }}</strong>
        <span>{{
          t('securityV2.review.receiptSummary', {
            disposition: dispositionLabel(lastReceipt.disposition),
            count: lastReceipt.handledTotal,
          })
        }}</span>
        <code
          >{{ t('securityV2.review.receiptRequestId', { id: shortId(lastReceipt.requestId) }) }} ·
          {{ t('securityV2.review.receiptAuditId', { id: shortId(lastReceipt.auditId) }) }}</code
        >
      </div>
      <BButton v-if="returnTo" @click="goBackToQueue">{{ t('securityV2.review.backToQueue') }}</BButton>
    </section>

    <div class="security-segment review-status-segment">
      <BButton
        v-for="status in dispositionOptions"
        :key="status.value"
        :class="{ 'is-active': disposition === status.value }"
        @click="setDisposition(status.value)"
        >{{ status.label }} {{ countFor(status.value) }}</BButton
      >
    </div>

    <div class="security-review-toolbar">
      <BInput
        v-model:value="draftKeyword"
        class="security-review-search"
        :placeholder="t('securityV2.review.search')"
        @enter="applyFilters"
      />
      <BSelect v-model:value="draftViewMode" class="security-review-select" :options="viewOptions" />
      <BSelect v-model:value="draftConfidence" class="security-review-select" :options="confidenceOptions" />
      <BButton type="primary" :loading="loading" @click="applyFilters">{{ t('securityV2.common.filter') }}</BButton>
    </div>
    <p class="security-review-mode-hint">
      {{ t(draftViewMode === 'raw' ? 'securityV2.review.rawModeHint' : 'securityV2.review.clusterModeHint') }}
    </p>

    <div class="security-review-batch-bar" :class="{ 'has-selection': selectedKeys.length }">
      <div>
        <strong>{{ t('securityV2.review.selected', { count: selectedKeys.length, unit: reviewUnit }) }}</strong>
        <span>{{ t('securityV2.review.batchHint') }}</span>
      </div>
      <div class="security-review-batch-actions">
        <BButton :disabled="!selectedKeys.length || Boolean(bulkAction)" @click="clearSelection">{{
          t('securityV2.review.clearSelection')
        }}</BButton>
        <BButton
          :disabled="!selectedKeys.length || Boolean(bulkAction)"
          :loading="bulkAction === 'benign_anomaly'"
          @click="confirmBatchDisposition('benign_anomaly')"
          >{{ t('securityV2.review.benignAction') }}</BButton
        >
        <BButton
          :disabled="!selectedKeys.length || Boolean(bulkAction)"
          :loading="bulkAction === 'authorized_test'"
          @click="confirmBatchDisposition('authorized_test')"
          >{{ t('securityV2.review.authorizedAction') }}</BButton
        >
        <BButton
          :disabled="!selectedKeys.length || Boolean(bulkAction)"
          :loading="bulkAction === 'false_positive'"
          @click="confirmBatchDisposition('false_positive')"
          >{{ t('securityV2.review.batchFalseAction') }}</BButton
        >
        <BButton
          type="danger"
          :disabled="!selectedKeys.length || Boolean(bulkAction)"
          :loading="bulkAction === 'confirmed_attack'"
          @click="confirmBatchDisposition('confirmed_attack')"
          >{{ t('securityV2.review.confirmAction') }}</BButton
        >
      </div>
    </div>

    <div class="security-v2-table-card">
      <BTable
        :data="items"
        :columns="columns"
        :row-key="viewMode === 'raw' ? 'eventId' : 'representativeEventId'"
        :row-clickable="true"
        :selectable="true"
        :selected-rows="selectedKeys"
        :loading="loading"
        @selection-change="handleSelectionChange"
        @row-click="openEvent"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'time'"
            ><span>{{ formatTime(record.lastSeenAt || record.createdAt) }}</span></template
          >
          <template v-else-if="column.key === 'score'">
            <span class="security-pill" :class="number(record.confidence) >= 85 ? 'is-danger' : 'is-warning'"
              >{{ confidenceLabel(record.confidence) }} · {{ number(record.maxScore ?? record.threatScore) }}</span
            >
          </template>
          <template v-else-if="column.key === 'ruleRoute'">
            <span class="security-event-title"
              ><strong>{{
                record.ruleName || record.matchedRule || record.ruleCode || record.primaryRuleCode || '-'
              }}</strong
              ><small>{{ record.requestMethod || '-' }} {{ record.requestPath || '-' }}</small></span
            >
          </template>
          <template v-else-if="column.key === 'actor'">
            <span class="security-event-title"
              ><strong>{{
                record.actorLabel || record.alias || record.email || record.userId || t('securityV2.common.anonymous')
              }}</strong
              ><small>{{ record.sourceIp || '-' }}</small></span
            >
          </template>
          <template v-else-if="column.key === 'hits'">{{
            viewMode === 'raw'
              ? t('securityV2.common.hits', { count: 1 })
              : t('securityV2.common.hits', { count: record.hitCount || 1 })
          }}</template>
          <template v-else-if="column.key === 'action'"
            ><span class="security-pill" :class="record.blocked ? 'is-danger' : 'is-info'">{{
              record.blocked ? t('securityV2.common.blocked') : t('securityV2.common.logged')
            }}</span></template
          >
        </template>
      </BTable>
      <div v-if="!loading && !items.length" class="security-empty">{{ t('securityV2.common.noData') }}</div>
    </div>

    <EventDetailDrawer
      :open="drawerOpen"
      :event-id="activeEventId"
      :raw="viewMode === 'raw'"
      @close="closeDrawer"
      @saved="handleReviewSaved"
    />

    <AdminRiskActionModal
      v-model:visible="batchModalVisible"
      :title="t('securityV2.review.batchConfirmTitle')"
      :impact="batchImpact"
      :confirm-label="dispositionLabel(pendingBatchDisposition)"
      :loading="Boolean(bulkAction)"
      @confirm="executeBatchDisposition"
    />
  </div>
</template>

<script lang="ts" setup>
  import { computed, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import AdminRiskActionModal from '@/components/admin/AdminRiskActionModal.vue';
  import { apiBasePost } from '@/http/request';
  import { normalizeAdminActionCenterReturnTo } from '@/utils/adminNavigation.ts';
  import EventDetailDrawer from './EventDetailDrawer.vue';
  import { securityCenterMessages } from './securityCenterI18n';

  const emit = defineEmits<{ pendingCount: [count: number] }>();
  const { t } = useI18n({ useScope: 'local', messages: securityCenterMessages });
  const route = useRoute();
  const router = useRouter();
  const loading = ref(false);
  const items = ref<any[]>([]);
  const counts = ref<any[]>([]);
  const keyword = ref('');
  const draftKeyword = ref('');
  const disposition = ref('unknown');
  const viewMode = ref<'clusters' | 'raw'>('clusters');
  const draftViewMode = ref<'clusters' | 'raw'>('clusters');
  const confidence = ref('all');
  const draftConfidence = ref('all');
  const selectedKeys = ref<string[]>([]);
  const bulkAction = ref('');
  const batchModalVisible = ref(false);
  const pendingBatchDisposition = ref('');
  const drawerOpen = ref(false);
  const activeEventId = ref('');
  const lastReceipt = ref<{ disposition: string; handledTotal: number; requestId: string; auditId: string } | null>(
    null,
  );
  const number = (value: unknown) => Number(value || 0);
  const columns = computed(() => [
    { title: t('securityV2.review.time'), key: 'time', width: '85px' },
    { title: t('securityV2.review.score'), key: 'score', width: '105px' },
    { title: t('securityV2.review.ruleRoute'), key: 'ruleRoute', width: 'minmax(190px,1fr)' },
    { title: t('securityV2.review.actor'), key: 'actor', width: 'minmax(145px,.8fr)' },
    { title: t('securityV2.review.hit'), key: 'hits', width: '72px' },
    { title: t('securityV2.review.action'), key: 'action', width: '90px' },
  ]);
  const dispositionOptions = computed(() => [
    { value: 'unknown', label: t('securityV2.review.pending') },
    { value: 'confirmed_attack', label: t('securityV2.review.confirmed') },
    { value: 'false_positive', label: t('securityV2.review.falsePositive') },
    { value: 'authorized_test', label: t('securityV2.review.authorized') },
    { value: 'benign_anomaly', label: t('securityV2.review.benign') },
  ]);
  const viewOptions = computed(() => [
    { value: 'clusters', label: t('securityV2.review.clusters') },
    { value: 'raw', label: t('securityV2.review.raw') },
  ]);
  const confidenceOptions = computed(() => [
    { value: 'all', label: t('securityV2.review.allConfidence') },
    { value: 'high', label: t('securityV2.review.high') },
    { value: 'medium', label: t('securityV2.review.medium') },
  ]);
  const reviewUnit = computed(() =>
    t(viewMode.value === 'raw' ? 'securityV2.review.eventUnit' : 'securityV2.review.clusterUnit'),
  );
  const returnTo = computed(() => normalizeAdminActionCenterReturnTo(route.query.returnTo));
  const batchImpact = computed(() =>
    t('securityV2.review.batchConfirmContent', {
      count: selectedKeys.value.length,
      unit: reviewUnit.value,
      disposition: dispositionLabel(pendingBatchDisposition.value),
    }),
  );

  function countFor(value: string) {
    return number(counts.value.find((item) => item.disposition === value)?.total);
  }
  function setDisposition(value: string) {
    disposition.value = value;
    loadEvents();
  }
  function confidenceLabel(value: unknown) {
    return number(value) >= 85 ? t('securityV2.review.high') : t('securityV2.review.medium');
  }
  function formatTime(value: string) {
    return value
      ? new Date(value.replace(' ', 'T')).toLocaleString([], {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '-';
  }
  function openEvent(record: any) {
    activeEventId.value = record.representativeEventId || record.eventId;
    drawerOpen.value = true;
    router.replace({ query: { ...route.query, eventId: activeEventId.value } });
  }
  function closeDrawer() {
    drawerOpen.value = false;
    router.replace({ query: { ...route.query, eventId: undefined } });
  }
  function goBackToQueue() {
    if (returnTo.value) void router.push(returnTo.value);
  }
  function shortId(value: string) {
    return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
  }
  function captureReceipt(data: any, fallbackDisposition: string, fallbackCount: number) {
    const requestId = String(data?.requestId || '');
    const auditId = String(data?.auditId || '');
    if (!requestId || !auditId) return false;
    lastReceipt.value = {
      disposition: String(data?.review?.disposition || data?.disposition || fallbackDisposition),
      handledTotal: Math.max(1, number(data?.handledTotal || fallbackCount)),
      requestId,
      auditId,
    };
    return true;
  }
  async function handleReviewSaved(receipt: Record<string, unknown>) {
    const disposition = String(receipt.disposition || 'unknown');
    if (!captureReceipt(receipt, disposition, 1)) {
      message.error(t('securityV2.review.dispositionFailed'));
      return;
    }
    message.success(t('securityV2.review.success'));
    await loadEvents();
  }
  function clearSelection() {
    selectedKeys.value = [];
  }
  function handleSelectionChange(keys: Array<string | number>) {
    selectedKeys.value = keys.map((key) => String(key));
  }
  async function loadEvents(filters = { key: keyword.value, viewMode: viewMode.value, confidence: confidence.value }) {
    loading.value = true;
    try {
      const res = await apiBasePost(
        '/api/security/v2/review/clusters',
        {
          pageSize: 100,
          filters: {
            days: 7,
            disposition: disposition.value,
            key: filters.key.trim(),
            viewMode: filters.viewMode,
            confidence: filters.confidence === 'all' ? '' : filters.confidence,
          },
        },
        { silent: true },
      );
      if (res?.status !== 200) return false;
      keyword.value = filters.key;
      viewMode.value = filters.viewMode;
      confidence.value = filters.confidence;
      items.value = res.data?.items || [];
      counts.value = res.data?.counts || counts.value;
      clearSelection();
      emit('pendingCount', countFor('unknown'));
      return true;
    } catch {
      return false;
    } finally {
      loading.value = false;
    }
  }
  async function applyFilters() {
    const success = await loadEvents({
      key: draftKeyword.value,
      viewMode: draftViewMode.value,
      confidence: draftConfidence.value,
    });
    if (success) {
      message.success(t('securityV2.review.filterApplied', { count: items.value.length, unit: reviewUnit.value }));
    } else {
      message.error(t('securityV2.review.filterFailed'));
    }
  }
  function dispositionLabel(value: string) {
    return dispositionOptions.value.find((item) => item.value === value)?.label || value;
  }
  function confirmBatchDisposition(nextDisposition: string) {
    if (!selectedKeys.value.length || bulkAction.value) return;
    pendingBatchDisposition.value = nextDisposition;
    batchModalVisible.value = true;
  }
  async function executeBatchDisposition(payload: { reason: string; confirmed: true }) {
    const nextDisposition = pendingBatchDisposition.value;
    if (!nextDisposition || !selectedKeys.value.length || bulkAction.value) return;
    const eventIds = [...selectedKeys.value];
    const unit = reviewUnit.value;
    bulkAction.value = nextDisposition;
    try {
      const res = await apiBasePost(
        '/api/security/v2/review/batch-disposition',
        {
          eventIds,
          scope: viewMode.value === 'raw' ? 'events' : 'clusters',
          disposition: nextDisposition,
          reason: payload.reason,
          confirmed: payload.confirmed,
          createTuningSuggestion: nextDisposition === 'false_positive',
        },
        { silent: true },
      );
      if (res?.status !== 200 || !captureReceipt(res.data, nextDisposition, eventIds.length)) {
        message.error(t('securityV2.review.batchFailed'));
        return;
      }
      batchModalVisible.value = false;
      pendingBatchDisposition.value = '';
      message.success(
        t('securityV2.review.batchSuccess', {
          count: res.data?.selectedTotal || eventIds.length,
          unit,
          affected: res.data?.handledTotal || eventIds.length,
        }),
      );
      await loadEvents();
    } catch {
      message.error(t('securityV2.review.batchFailed'));
    } finally {
      bulkAction.value = '';
    }
  }
  function exportEvidence() {
    const redacted = items.value.map((item) => ({
      time: item.lastSeenAt || item.createdAt,
      rule: item.ruleCode || item.primaryRuleCode,
      route: item.requestPath,
      actor: item.userId ? `user:${String(item.userId).slice(0, 6)}…` : t('securityV2.common.anonymous'),
      sourceIp: item.sourceIp || '',
      score: item.maxScore ?? item.threatScore,
      blocked: Boolean(item.blocked),
      hits: item.hitCount || 1,
    }));
    const url = URL.createObjectURL(new Blob([JSON.stringify(redacted, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `security-review-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }
  onMounted(async () => {
    await loadEvents();
    if (route.query.eventId) {
      activeEventId.value = String(route.query.eventId);
      drawerOpen.value = true;
    }
  });
  watch(
    () => route.query.eventId,
    (value) => {
      activeEventId.value = value ? String(value) : '';
      drawerOpen.value = Boolean(activeEventId.value);
    },
  );
</script>

<style lang="less" scoped>
  @import './securityCenter.less';
</style>
