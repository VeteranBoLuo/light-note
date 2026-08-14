<template>
  <section class="points-recon">
    <div class="points-recon__toolbar">
      <div>
        <h2>异常与对账</h2>
        <p>发现问题只进入人工复核；系统不会自动改余额、自动封号或批量修复。</p>
      </div>
      <BButton size="small" :loading="loading" @click="reload">重新扫描</BButton>
    </div>

    <div class="points-recon__summary">
      <span
        >本页扫描 <b>{{ reconciliation?.scanned || 0 }}</b> 个账户</span
      >
      <span
        >一致 <b class="is-ok">{{ reconciliation?.consistent || 0 }}</b></span
      >
      <span
        >差异 <b class="is-danger">{{ reconciliation?.mismatched || 0 }}</b></span
      >
      <span
        >规则异常 <b>{{ anomalies?.count || 0 }}</b></span
      >
    </div>

    <article class="points-recon__panel">
      <header><h3>余额差异</h3><span>基线 + 全量账本 = 预期余额</span></header>
      <BTable :data="mismatchRows" :columns="mismatchColumns" row-key="userId" :loading="loading">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'action'">
            <BButton size="small" type="danger" @click="openCorrection(record)">创建纠正流水</BButton>
          </template>
          <template v-else>{{ record[column.key] }}</template>
        </template>
      </BTable>
      <div class="points-recon__pager">
        <BButton v-if="reconciliation?.nextCursor" size="small" :loading="loadingMore" @click="loadMore"
          >继续扫描</BButton
        >
        <span v-else>当前有界扫描已结束</span>
      </div>
    </article>

    <article class="points-recon__panel">
      <header><h3>规则异常</h3><span>仅提供线索，需结合用户与审计记录判断</span></header>
      <BTable :data="anomalyRows" :columns="anomalyColumns" row-key="rowKey" :loading="loading" />
    </article>

    <AdminRiskActionModal
      v-model:visible="correctionVisible"
      title="确认创建积分纠正流水"
      :impact="correctionImpact"
      confirm-phrase="确认创建纠正"
      :loading="correcting"
      @confirm="confirmCorrection"
    />
  </section>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import growthApi from '@/api/growthApi';
  import AdminRiskActionModal from '@/components/admin/AdminRiskActionModal.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { generateUUID } from '@/utils/common';
  import { isAmbiguousAdminWriteFailure } from './adminWriteRequest';

  const loading = ref(false);
  const loadingMore = ref(false);
  const correcting = ref(false);
  const correctionVisible = ref(false);
  const correctionTarget = ref<any>(null);
  const pendingCorrectionRequest = ref<{ payloadKey: string; requestId: string } | null>(null);
  const reconciliation = ref<any>(null);
  const anomalies = ref<any>(null);
  const mismatchColumns = [
    { title: '用户', key: 'identity', width: 'minmax(190px, 1fr)', ellipsis: false },
    { title: '当前余额', key: 'balanceLabel', width: '100px' },
    { title: '预期余额', key: 'expectedLabel', width: '100px' },
    { title: '差额', key: 'differenceLabel', width: '100px' },
    { title: '操作', key: 'action', width: '130px', ellipsis: false },
  ];
  const anomalyColumns = [
    { title: '严重性', key: 'severityLabel', width: '90px' },
    { title: '规则', key: 'codeLabel', width: 'minmax(220px, 1fr)', ellipsis: false },
    { title: '对象', key: 'target', width: 'minmax(150px, 1fr)', ellipsis: false },
    { title: '数值', key: 'value', width: '110px' },
  ];
  const codeLabels: Record<string, string> = {
    DAILY_STABLE_OVER_CAP: '单日签到与每日任务超过稳定上限',
    DUPLICATE_CLAIM_CONFLICT: '同一领取引用出现重复流水',
    ADMIN_GRANT_OUTLIER: '运营发放 / 纠正数值异常偏大',
    CAMPAIGN_DUPLICATE: '活动名单出现重复用户',
  };
  const severityLabels: Record<string, string> = { critical: '严重', high: '高', warning: '警告' };
  const format = (value: unknown) => Number(value || 0).toLocaleString('zh-CN');
  const mismatchRows = computed(() =>
    (reconciliation.value?.rows || []).map((row: any) => ({
      ...row,
      identity: `${row.alias || row.email || '未命名'} · ${row.userId}`,
      balanceLabel: format(row.balance),
      expectedLabel: format(row.expected),
      differenceLabel: `${Number(row.difference) > 0 ? '+' : ''}${format(row.difference)}`,
    })),
  );
  const anomalyRows = computed(() =>
    (anomalies.value?.rows || []).map((row: any, index: number) => ({
      ...row,
      rowKey: `${row.code}:${row.userId || row.campaignId || row.id || index}:${index}`,
      severityLabel: severityLabels[row.severity] || row.severity,
      codeLabel: codeLabels[row.code] || row.code,
      target: row.userId || (row.campaignId ? `活动 ${row.campaignId}` : '—'),
      value:
        row.amount != null
          ? format(row.amount)
          : row.delta != null
            ? format(row.delta)
            : row.occurrences != null
              ? `${row.occurrences} 次`
              : '—',
    })),
  );
  const correctionImpact = computed(() => {
    const row = correctionTarget.value;
    if (!row) return '';
    return `用户 ${row.alias || row.email || row.userId}（${row.userId}）当前余额 ${row.balance}，账本预期 ${row.expected}，差额 ${row.difference}。本操作只补齐缺失历史流水，不再次改变当前余额。`;
  });

  async function reload() {
    loading.value = true;
    try {
      const [reconResult, anomalyResult] = await Promise.all([
        growthApi.adminPointsReconciliation({ limit: 50, onlyMismatch: true }),
        growthApi.adminPointsAnomalies({ presetDays: 28, limit: 50 }),
      ]);
      if (reconResult.status === 200) reconciliation.value = reconResult.data;
      else message.error(reconResult.msg || '积分对账加载失败');
      if (anomalyResult.status === 200) anomalies.value = anomalyResult.data;
      else message.error(anomalyResult.msg || '异常规则加载失败');
    } finally {
      loading.value = false;
    }
  }

  async function loadMore() {
    const cursor = reconciliation.value?.nextCursor;
    if (!cursor) return;
    loadingMore.value = true;
    try {
      const result = await growthApi.adminPointsReconciliation({ cursor, limit: 50, onlyMismatch: true });
      if (result.status === 200) {
        reconciliation.value = {
          ...result.data,
          scanned: Number(reconciliation.value?.scanned || 0) + Number(result.data?.scanned || 0),
          consistent: Number(reconciliation.value?.consistent || 0) + Number(result.data?.consistent || 0),
          mismatched: Number(reconciliation.value?.mismatched || 0) + Number(result.data?.mismatched || 0),
          rows: [...(reconciliation.value?.rows || []), ...(result.data?.rows || [])],
        };
      }
    } finally {
      loadingMore.value = false;
    }
  }

  function openCorrection(row: any) {
    correctionTarget.value = row;
    correctionVisible.value = true;
  }

  async function confirmCorrection(action: { reason: string; confirmed: true; confirmText: string }) {
    const row = correctionTarget.value;
    if (!row) return;
    correcting.value = true;
    const payload = {
      userId: row.userId,
      expectedDifference: Number(row.difference),
      note: action.reason,
      ...action,
    };
    const payloadKey = JSON.stringify(payload);
    if (!pendingCorrectionRequest.value || pendingCorrectionRequest.value.payloadKey !== payloadKey) {
      pendingCorrectionRequest.value = { payloadKey, requestId: generateUUID() };
    }
    try {
      const result = await growthApi.adminPointsCorrection(payload, pendingCorrectionRequest.value.requestId);
      if (result.status === 200 && result.data?.ok) {
        pendingCorrectionRequest.value = null;
        correctionVisible.value = false;
        message.success(result.data?.idempotent ? '已恢复此前纠正结果' : '纠正流水已创建，当前余额未被二次改动');
        await reload();
      } else {
        pendingCorrectionRequest.value = null;
        message.error(result.msg || '创建纠正失败');
      }
    } catch (error) {
      if (isAmbiguousAdminWriteFailure(error)) {
        message.warning('网络结果未知，已保留本次纠正请求；请保持内容不变后重试。');
      } else {
        pendingCorrectionRequest.value = null;
        message.error((error as { message?: string })?.message || '创建纠正失败');
      }
    } finally {
      correcting.value = false;
    }
  }

  defineExpose({ reload });
  onMounted(reload);
</script>

<style scoped lang="less">
  @import '@/assets/css/admin-breakpoints.less';
  .points-recon {
    display: grid;
    gap: 16px;
  }
  .points-recon__toolbar,
  .points-recon__panel header,
  .points-recon__pager {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  h2,
  h3,
  p {
    margin: 0;
  }
  h2 {
    color: var(--text-color);
    font-size: 18px;
  }
  h3 {
    color: var(--text-color);
    font-size: 14px;
  }
  p,
  header span,
  .points-recon__pager span {
    color: var(--desc-color);
    font-size: 12px;
  }
  .points-recon__summary {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .points-recon__summary span {
    padding: 9px 12px;
    border: 1px solid var(--card-border-color);
    border-radius: 9px;
    background: var(--workbench-subcard-bg);
    color: var(--desc-color);
    font-size: 12px;
  }
  .points-recon__summary b {
    color: var(--text-color);
    font-variant-numeric: tabular-nums;
  }
  .points-recon__summary b.is-ok {
    color: var(--success-color);
  }
  .points-recon__summary b.is-danger {
    color: var(--danger-color);
  }
  .points-recon__panel {
    display: grid;
    min-width: 0;
    gap: 12px;
    padding: 15px;
    border: 1px solid var(--card-border-color);
    border-radius: 12px;
    background: var(--workbench-subcard-bg);
    overflow: hidden;
  }
  @media (max-width: @admin-bp-mobile) {
    .points-recon__toolbar {
      align-items: flex-start;
      flex-direction: column;
    }
  }
</style>
