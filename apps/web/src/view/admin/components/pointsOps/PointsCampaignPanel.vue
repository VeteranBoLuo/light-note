<template>
  <section class="points-campaign">
    <div class="points-campaign__intro">
      <div>
        <h2>活动积分发放</h2>
        <p>只支持正向积分。名单冻结后不可改变，执行按小批次可恢复发放。</p>
      </div>
      <span :class="runtime?.ready ? 'is-ready' : 'is-disabled'">{{
        runtime?.ready ? '安全上限已就绪' : '功能未启用'
      }}</span>
    </div>

    <div class="points-campaign__layout">
      <article class="points-campaign__panel points-campaign__create">
        <header><h3>新建草稿</h3><span>先定义受众，再预览影响</span></header>
        <div class="points-campaign__form-grid">
          <label class="is-wide"
            ><span>活动名称</span><BInput v-model:value="form.name" maxlength="100" placeholder="如 2026 周年感谢礼"
          /></label>
          <label
            ><span>每人积分</span><BInput v-model:value="form.pointsPerUser" type="number" placeholder="必须为正整数"
          /></label>
          <label><span>原因类型</span><BSelect v-model:value="form.reasonCode" :options="reasonOptions" /></label>
          <label class="is-wide"
            ><span>活动原因</span><BInput v-model:value="form.reason" placeholder="至少 6 个字，会进入审计"
          /></label>
        </div>
        <div class="points-campaign__audience-head">
          <strong>受众条件</strong>
          <label class="points-campaign__switch"
            ><BSwitch v-model:checked="form.allRegisteredUsers" />全部普通注册用户</label
          >
        </div>
        <div class="points-campaign__form-grid">
          <label class="is-wide"
            ><span>明确用户 ID（可选）</span
            ><BInput
              v-model:value="form.explicitUserIds"
              type="textarea"
              :rows="3"
              placeholder="每行或逗号分隔；与其他条件共同收窄"
          /></label>
          <label><span>注册起始</span><BInput v-model:value="form.registeredFrom" placeholder="YYYY-MM-DD" /></label>
          <label><span>注册结束</span><BInput v-model:value="form.registeredTo" placeholder="YYYY-MM-DD" /></label>
          <label><span>活跃起始</span><BInput v-model:value="form.lastActiveFrom" placeholder="YYYY-MM-DD" /></label>
          <label><span>活跃结束</span><BInput v-model:value="form.lastActiveTo" placeholder="YYYY-MM-DD" /></label>
          <label><span>最低等级</span><BInput v-model:value="form.minLevel" type="number" placeholder="1～15" /></label>
          <label><span>最高等级</span><BInput v-model:value="form.maxLevel" type="number" placeholder="1～15" /></label>
          <label><span>最低余额</span><BInput v-model:value="form.minPoints" type="number" placeholder="可选" /></label>
          <label><span>最高余额</span><BInput v-model:value="form.maxPoints" type="number" placeholder="可选" /></label>
          <label class="is-wide"
            ><span>排除既有活动（可选）</span
            ><BInput v-model:value="form.excludeCampaignPublicId" placeholder="填写历史活动公开 ID，避免重复触达"
          /></label>
        </div>
        <BButton type="primary" :loading="creating" :disabled="!runtime?.ready" @click="createCampaign"
          >创建活动草稿</BButton
        >
      </article>

      <article class="points-campaign__panel points-campaign__list">
        <header><h3>活动记录</h3><BButton size="small" :loading="loading" @click="reload">刷新</BButton></header>
        <div v-if="campaigns.length" class="points-campaign__cards">
          <BButton
            v-for="campaign in campaigns"
            :key="campaign.publicId"
            class="points-campaign__card"
            :class="{ 'is-active': selectedId === campaign.publicId }"
            @click="selectCampaign(campaign.publicId)"
          >
            <strong>{{ campaign.name }}</strong>
            <span>{{ statusLabel(campaign.status) }} · 每人 {{ format(campaign.pointsPerUser) }} 分</span>
            <small
              >{{ campaign.recipientCount || 0 }} 人 · 已发 {{ campaign.deliveredCount || 0 }} · 失败
              {{ campaign.failedCount || 0 }}</small
            >
          </BButton>
        </div>
        <p v-else class="points-campaign__empty">尚无活动记录。</p>
      </article>
    </div>

    <article v-if="detail?.campaign" class="points-campaign__panel points-campaign__detail">
      <header>
        <div
          ><h3>{{ detail.campaign.name }}</h3
          ><span>{{ detail.campaign.publicId }} · {{ statusLabel(detail.campaign.status) }}</span></div
        >
        <div class="points-campaign__actions">
          <BButton v-if="canPreview" size="small" :loading="acting" @click="previewCampaign">预览受众</BButton>
          <BButton
            v-if="detail.campaign.status === 'previewed'"
            size="small"
            type="primary"
            @click="openAction('freeze')"
            >冻结名单</BButton
          >
          <BButton
            v-if="detail.campaign.status === 'recipients_frozen'"
            size="small"
            type="primary"
            @click="openAction('confirm')"
            >确认发放</BButton
          >
          <BButton v-if="canExecute" size="small" type="danger" @click="openAction('execute')">{{
            detail.campaign.status === 'running' ? '继续下一批' : '执行首批'
          }}</BButton>
          <BButton v-if="canDelete" size="small" type="danger" @click="openAction('delete')">删除草稿</BButton>
        </div>
      </header>
      <div class="points-campaign__facts">
        <span
          >每人 <b>{{ format(detail.campaign.pointsPerUser) }}</b></span
        >
        <span
          >冻结人数 <b>{{ format(detail.campaign.recipientCount) }}</b></span
        >
        <span
          >总积分 <b>{{ format(detail.campaign.totalPoints) }}</b></span
        >
        <span
          >已发 <b>{{ format(detail.campaign.deliveredCount) }}</b></span
        >
        <span
          >失败 <b>{{ format(detail.campaign.failedCount) }}</b></span
        >
      </div>
      <div v-if="preview" class="points-campaign__preview">
        <strong>预览：{{ format(preview.recipientCount) }} 人 / {{ format(preview.totalPoints) }} 分</strong>
        <span
          >余额 P50：{{ format(preview.balanceDistribution?.before?.p50) }} →
          {{ format(preview.balanceDistribution?.after?.p50) }}</span
        >
        <span
          >余额 P90：{{ format(preview.balanceDistribution?.before?.p90) }} →
          {{ format(preview.balanceDistribution?.after?.p90) }}</span
        >
        <b v-if="preview.exceedsLimits" class="is-danger">超过服务端安全上限，不能冻结</b>
        <b v-if="preview.nameConflict" class="is-danger">存在同名非草稿活动，请先核对</b>
      </div>
      <BTable :data="sampleRows" :columns="sampleColumns" row-key="rowKey" />
    </article>

    <AdminRiskActionModal
      v-model:visible="actionVisible"
      :title="actionConfig.title"
      :impact="actionConfig.impact"
      :confirm-phrase="actionConfig.phrase"
      :loading="acting"
      @confirm="confirmAction"
    />
  </section>
</template>

<script setup lang="ts">
  import { computed, onMounted, reactive, ref } from 'vue';
  import growthApi from '@/api/growthApi';
  import AdminRiskActionModal from '@/components/admin/AdminRiskActionModal.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BSwitch from '@/components/base/BasicComponents/BSwitch.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { generateUUID } from '@/utils/common';
  import { isAmbiguousAdminWriteFailure } from './adminWriteRequest';

  type CampaignAction = 'freeze' | 'confirm' | 'execute' | 'delete';
  const loading = ref(false);
  const creating = ref(false);
  const acting = ref(false);
  const actionVisible = ref(false);
  const pendingAction = ref<CampaignAction>('freeze');
  const campaigns = ref<any[]>([]);
  const runtime = ref<any>(null);
  const selectedId = ref('');
  const detail = ref<any>(null);
  const preview = ref<any>(null);
  const pendingCreateRequest = ref<{ payloadKey: string; requestId: string } | null>(null);
  const pendingPreviewRequest = ref<{ payloadKey: string; requestId: string } | null>(null);
  const pendingActionRequest = ref<{ payloadKey: string; requestId: string } | null>(null);
  const form = reactive({
    name: '',
    pointsPerUser: '',
    reasonCode: 'community_event',
    reason: '',
    allRegisteredUsers: false,
    explicitUserIds: '',
    registeredFrom: '',
    registeredTo: '',
    lastActiveFrom: '',
    lastActiveTo: '',
    minLevel: '',
    maxLevel: '',
    minPoints: '',
    maxPoints: '',
    excludeCampaignPublicId: '',
  });
  const reasonOptions = [
    { label: '社区活动', value: 'community_event' },
    { label: '周年活动', value: 'anniversary' },
    { label: '事故补偿', value: 'incident_compensation' },
    { label: '客户支持', value: 'customer_support' },
    { label: '其他', value: 'other' },
  ];
  const statusLabels: Record<string, string> = {
    draft: '草稿',
    previewed: '已预览',
    recipients_frozen: '名单已冻结',
    confirmed: '已确认',
    running: '发放中',
    completed: '已完成',
    partial_failed: '部分失败',
  };
  const sampleColumns = [
    { title: '匿名用户', key: 'userHash', width: 'minmax(150px, 1fr)' },
    { title: '积分', key: 'pointsLabel', width: '100px' },
    { title: '状态', key: 'statusLabel', width: '110px' },
    { title: '尝试', key: 'attemptsLabel', width: '80px' },
    { title: '错误', key: 'errorCode', width: 'minmax(140px, 1fr)', ellipsis: false },
  ];
  const format = (value: unknown) => Number(value || 0).toLocaleString('zh-CN');
  const statusLabel = (status: string) => statusLabels[status] || status;
  const canPreview = computed(() => ['draft', 'previewed'].includes(detail.value?.campaign?.status));
  const canDelete = computed(() => ['draft', 'previewed'].includes(detail.value?.campaign?.status));
  const canExecute = computed(() =>
    ['confirmed', 'running', 'partial_failed'].includes(detail.value?.campaign?.status),
  );
  const sampleRows = computed(() =>
    (detail.value?.sample || preview.value?.sample || []).map((row: any, index: number) => ({
      ...row,
      rowKey: `${row.userHash}:${index}`,
      pointsLabel: format(row.points),
      statusLabel: row.status ? statusLabel(row.status) : '预览样本',
      attemptsLabel: row.attempts == null ? '—' : format(row.attempts),
      errorCode: row.errorCode || '—',
    })),
  );
  const actionConfigs: Record<CampaignAction, { title: string; phrase: string; impact: string }> = {
    freeze: {
      title: '冻结活动收件人名单',
      phrase: '确认冻结名单',
      impact: '冻结会将当前预览结果固化为不可变收件人名单；后续受众条件变化不会再影响本活动。',
    },
    confirm: {
      title: '二次确认活动发放',
      phrase: '确认活动发放',
      impact: '确认后活动进入可执行状态；仍不会立即发放，需要再执行首批。',
    },
    execute: {
      title: '执行活动积分发放',
      phrase: '确认执行发放',
      impact: '本次最多执行一个有界批次。失败记录可重试，已成功用户会由幂等键防止重复到账。',
    },
    delete: {
      title: '删除活动草稿',
      phrase: '确认删除草稿',
      impact: '只允许删除草稿或已预览但尚未冻结名单的活动，删除后不可恢复。',
    },
  };
  const actionConfig = computed(() => actionConfigs[pendingAction.value]);
  const optionalNumber = (value: string) => (value.trim() === '' ? null : Number(value));
  const explicitIds = computed(() => [
    ...new Set(
      form.explicitUserIds
        .split(/[\s,，]+/u)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ]);

  async function reload() {
    loading.value = true;
    try {
      const response = await growthApi.adminPointsCampaigns(50);
      if (response.status === 200) {
        campaigns.value = response.data?.rows || [];
        runtime.value = response.data?.runtime || null;
        if (selectedId.value) await loadDetail(selectedId.value);
      } else message.error(response.msg || '活动列表加载失败');
    } finally {
      loading.value = false;
    }
  }
  async function loadDetail(publicId: string) {
    const response = await growthApi.adminPointsCampaignDetail(publicId);
    if (response.status === 200) {
      detail.value = response.data;
      runtime.value = response.data?.runtime || runtime.value;
    } else message.error(response.msg || '活动详情加载失败');
  }
  async function selectCampaign(publicId: string) {
    selectedId.value = publicId;
    preview.value = null;
    await loadDetail(publicId);
  }
  async function createCampaign() {
    creating.value = true;
    const payload = {
      name: form.name,
      pointsPerUser: Number(form.pointsPerUser),
      reasonCode: form.reasonCode,
      reason: form.reason,
      audience: {
        allRegisteredUsers: form.allRegisteredUsers,
        explicitUserIds: explicitIds.value,
        registeredFrom: form.registeredFrom || null,
        registeredTo: form.registeredTo || null,
        lastActiveFrom: form.lastActiveFrom || null,
        lastActiveTo: form.lastActiveTo || null,
        minLevel: optionalNumber(form.minLevel),
        maxLevel: optionalNumber(form.maxLevel),
        minPoints: optionalNumber(form.minPoints),
        maxPoints: optionalNumber(form.maxPoints),
        excludeCampaignPublicId: form.excludeCampaignPublicId.trim() || null,
      },
    };
    const payloadKey = JSON.stringify(payload);
    if (!pendingCreateRequest.value || pendingCreateRequest.value.payloadKey !== payloadKey) {
      pendingCreateRequest.value = { payloadKey, requestId: generateUUID() };
    }
    try {
      const response = await growthApi.adminCreatePointsCampaign(payload, pendingCreateRequest.value.requestId);
      if (response.status === 200 && response.data?.campaign?.publicId) {
        message.success(response.data?.idempotent ? '已恢复此前创建的活动草稿' : '活动草稿已创建');
        pendingCreateRequest.value = null;
        selectedId.value = response.data.campaign.publicId;
        await reload();
      } else {
        pendingCreateRequest.value = null;
        message.error(response.msg || '创建活动失败');
      }
    } catch (error) {
      if (isAmbiguousAdminWriteFailure(error)) {
        message.warning('网络结果未知，已保留本次请求；请刷新活动列表，或保持表单不变后重试。');
      } else {
        pendingCreateRequest.value = null;
        message.error((error as { message?: string })?.message || '创建活动失败');
      }
    } finally {
      creating.value = false;
    }
  }
  async function previewCampaign() {
    if (!selectedId.value) return;
    acting.value = true;
    const payloadKey = `preview:${selectedId.value}`;
    if (!pendingPreviewRequest.value || pendingPreviewRequest.value.payloadKey !== payloadKey) {
      pendingPreviewRequest.value = { payloadKey, requestId: generateUUID() };
    }
    try {
      const response = await growthApi.adminPreviewPointsCampaign(
        selectedId.value,
        pendingPreviewRequest.value.requestId,
      );
      if (response.status === 200) {
        pendingPreviewRequest.value = null;
        preview.value = response.data;
        message.success('预览完成，名单尚未冻结');
        await loadDetail(selectedId.value);
      } else {
        pendingPreviewRequest.value = null;
        message.error(response.msg || '活动预览失败');
      }
    } catch (error) {
      if (isAmbiguousAdminWriteFailure(error)) {
        message.warning('预览结果未知，已保留本次请求；请保持活动不变后重试。');
      } else {
        pendingPreviewRequest.value = null;
        message.error((error as { message?: string })?.message || '活动预览失败');
      }
    } finally {
      acting.value = false;
    }
  }
  function openAction(action: CampaignAction) {
    pendingAction.value = action;
    actionVisible.value = true;
  }
  async function confirmAction(action: { reason: string; confirmed: true; confirmText: string }) {
    if (!selectedId.value) return;
    acting.value = true;
    const publicId = selectedId.value;
    const payload = {
      publicId,
      ...(pendingAction.value === 'execute' ? { batchSize: 200 } : {}),
      ...action,
    };
    const payloadKey = JSON.stringify({ action: pendingAction.value, payload });
    if (!pendingActionRequest.value || pendingActionRequest.value.payloadKey !== payloadKey) {
      pendingActionRequest.value = { payloadKey, requestId: generateUUID() };
    }
    try {
      const response =
        pendingAction.value === 'freeze'
          ? await growthApi.adminFreezePointsCampaign({ publicId, ...action }, pendingActionRequest.value.requestId)
          : pendingAction.value === 'confirm'
            ? await growthApi.adminConfirmPointsCampaign({ publicId, ...action }, pendingActionRequest.value.requestId)
            : pendingAction.value === 'execute'
              ? await growthApi.adminExecutePointsCampaign(
                  { publicId, batchSize: 200, ...action },
                  pendingActionRequest.value.requestId,
                )
              : await growthApi.adminDeletePointsCampaign(
                  { publicId, ...action },
                  pendingActionRequest.value.requestId,
                );
      if (response.status === 200) {
        pendingActionRequest.value = null;
        actionVisible.value = false;
        message.success(
          pendingAction.value === 'execute' ? `本批处理 ${response.data?.processed || 0} 人` : '活动状态已更新',
        );
        if (pendingAction.value === 'delete') {
          selectedId.value = '';
          detail.value = null;
          preview.value = null;
        }
        await reload();
      } else {
        pendingActionRequest.value = null;
        message.error(response.msg || '活动操作失败');
      }
    } catch (error) {
      if (isAmbiguousAdminWriteFailure(error)) {
        message.warning('活动操作结果未知，已保留本次请求；请保持确认内容不变后重试。');
      } else {
        pendingActionRequest.value = null;
        message.error((error as { message?: string })?.message || '活动操作失败');
      }
    } finally {
      acting.value = false;
    }
  }

  defineExpose({ reload });
  onMounted(reload);
</script>

<style scoped lang="less">
  @import '@/assets/css/admin-breakpoints.less';
  .points-campaign {
    display: grid;
    gap: 16px;
  }
  .points-campaign__intro,
  .points-campaign__panel header,
  .points-campaign__audience-head {
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
  header span {
    color: var(--desc-color);
    font-size: 12px;
  }
  .points-campaign__intro > span {
    padding: 5px 9px;
    border: 1px solid var(--danger-color);
    border-radius: 999px;
    color: var(--danger-color);
    font-size: 11px;
  }
  .points-campaign__intro > span.is-ready {
    border-color: var(--success-color);
    color: var(--success-color);
  }
  .points-campaign__layout {
    display: grid;
    grid-template-columns: 1.35fr 0.85fr;
    gap: 16px;
    align-items: start;
  }
  .points-campaign__panel {
    display: grid;
    min-width: 0;
    gap: 14px;
    padding: 15px;
    border: 1px solid var(--card-border-color);
    border-radius: 12px;
    background: var(--workbench-subcard-bg);
    overflow: hidden;
  }
  .points-campaign__form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .points-campaign__form-grid label {
    display: grid;
    gap: 5px;
    color: var(--text-color);
    font-size: 12px;
  }
  .points-campaign__form-grid label.is-wide {
    grid-column: 1 / -1;
  }
  .points-campaign__audience-head strong {
    color: var(--text-color);
    font-size: 13px;
  }
  .points-campaign__switch {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--desc-color);
    font-size: 12px;
  }
  .points-campaign__cards {
    display: grid;
    gap: 8px;
    max-height: 560px;
    overflow-y: auto;
  }
  .points-campaign__card {
    width: 100%;
    min-height: auto;
    display: grid;
    justify-items: start;
    gap: 3px;
    padding: 10px 12px;
    border: 1px solid var(--card-border-color);
    background: var(--card-background);
    text-align: left;
  }
  .points-campaign__card.is-active {
    border: 2px solid var(--primary-color);
  }
  .points-campaign__card strong {
    color: var(--text-color);
    font-size: 13px;
  }
  .points-campaign__card span,
  .points-campaign__card small,
  .points-campaign__empty {
    color: var(--desc-color);
    font-size: 11px;
  }
  .points-campaign__detail header > div:first-child {
    display: grid;
    gap: 4px;
  }
  .points-campaign__actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
  }
  .points-campaign__facts {
    display: flex;
    flex-wrap: wrap;
    gap: 9px;
  }
  .points-campaign__facts span {
    padding: 8px 10px;
    border-radius: 8px;
    background: var(--card-background);
    color: var(--desc-color);
    font-size: 11px;
  }
  .points-campaign__facts b {
    color: var(--text-color);
    font-variant-numeric: tabular-nums;
  }
  .points-campaign__preview {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    padding: 11px;
    border: 1px solid var(--primary-color);
    border-radius: 9px;
    background: var(--card-background);
    color: var(--desc-color);
    font-size: 12px;
  }
  .points-campaign__preview strong {
    color: var(--text-color);
  }
  .is-danger {
    color: var(--danger-color);
  }
  @media (max-width: @admin-bp-mobile) {
    .points-campaign__intro,
    .points-campaign__panel header {
      align-items: flex-start;
      flex-direction: column;
    }
    .points-campaign__layout {
      grid-template-columns: 1fr;
    }
    .points-campaign__actions {
      justify-content: flex-start;
    }
  }
</style>
