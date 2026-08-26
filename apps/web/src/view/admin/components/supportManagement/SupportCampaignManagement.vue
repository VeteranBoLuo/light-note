<template>
  <section class="campaign-admin">
    <header class="campaign-admin__header">
      <div>
        <h2>{{ t('adminSupport.campaigns.title') }}</h2>
        <p>{{ t('adminSupport.campaigns.description') }}</p>
      </div>
      <BButton type="primary" @click="openCreate">{{ t('adminSupport.campaigns.create') }}</BButton>
    </header>

    <div v-if="loading" class="campaign-admin__state"><BLoading inline loading /></div>
    <div v-else-if="loadError" class="campaign-admin__state is-error">
      <span>{{ t('adminSupport.campaigns.loadFailed') }}</span>
      <BButton size="small" @click="loadCampaigns">{{ t('common.retry') }}</BButton>
    </div>
    <div v-else-if="!campaigns.length" class="campaign-admin__state">
      {{ t('adminSupport.campaigns.empty') }}
    </div>
    <div v-else class="campaign-admin__list">
      <BCard v-for="campaign in campaigns" :key="campaign.id" padding="18px" radius="14px">
        <div class="campaign-admin__card-head">
          <div>
            <div class="campaign-admin__title-row">
              <strong>{{ campaign.title }}</strong>
              <BChip :tone="statusTone(campaign)">{{ statusLabel(campaign) }}</BChip>
              <BChip tone="neutral">v{{ campaign.version }}</BChip>
            </div>
            <p>{{ campaign.campaignKey }} · {{ formatTime(campaign.startsAt) }} — {{ formatTime(campaign.endsAt) }}</p>
          </div>
          <div class="campaign-admin__actions">
            <BButton size="small" @click="openGrants(campaign)">{{ t('adminSupport.campaigns.grants') }}</BButton>
            <BButton
              v-if="campaign.status === 'draft'"
              size="small"
              type="primary"
              :disabled="!campaignPassesCostGate(campaign)"
              :loading="actingId === campaign.id"
              @click="confirmPublish(campaign)"
            >
              {{ t('adminSupport.campaigns.publish') }}
            </BButton>
            <BButton
              v-else-if="campaign.status === 'published' && !campaignIsEnded(campaign)"
              size="small"
              :loading="actingId === campaign.id"
              @click="confirmSuspend(campaign)"
            >
              {{ t('adminSupport.campaigns.suspend') }}
            </BButton>
          </div>
        </div>
        <p v-if="campaign.description" class="campaign-admin__description">{{ campaign.description }}</p>
        <div class="campaign-admin__skus">
          <div v-for="sku in campaign.skus" :key="sku.campaignSkuId" class="campaign-admin__sku">
            <div>
              <strong>{{ sku.title }}</strong>
              <small>{{ sku.skuId }} · ¥{{ sku.amount }} · {{ benefitLabel(sku) }}</small>
            </div>
            <BChip :tone="sku.marginBps >= 4000 ? 'success' : 'danger'">
              {{ t('adminSupport.campaigns.margin', { value: (sku.marginBps / 100).toFixed(1) }) }}
            </BChip>
          </div>
        </div>
        <p v-if="campaign.status !== 'draft'" class="campaign-admin__immutable">
          {{ t('adminSupport.campaigns.immutable') }}
        </p>
        <p v-else-if="!campaignPassesCostGate(campaign)" class="campaign-admin__cost-blocked">
          {{ t('adminSupport.campaigns.publishCostBlocked') }}
        </p>
      </BCard>
    </div>
  </section>

  <BModal
    v-model:visible="createVisible"
    :title="t('adminSupport.campaigns.createTitle')"
    width="min(920px, 96vw)"
    height="min(760px, 90vh)"
    content-class="campaign-admin__modal-content"
    :show-footer="true"
    :close-disabled="creating"
  >
    <div class="campaign-admin__form">
      <div class="campaign-admin__form-grid">
        <label>
          <span>{{ t('adminSupport.campaigns.key') }}</span>
          <BInput v-model:value="draft.campaignKey" theme="al-day" placeholder="summer-2026" :maxlength="64" />
        </label>
        <label>
          <span>{{ t('adminSupport.campaigns.name') }}</span>
          <BInput
            v-model:value="draft.title"
            theme="al-day"
            :placeholder="t('adminSupport.campaigns.namePlaceholder')"
            :maxlength="120"
          />
        </label>
        <label>
          <span>{{ t('adminSupport.campaigns.startsAt') }}</span>
          <BInput v-model:value="draft.startsAt" theme="al-day" type="datetime-local" />
        </label>
        <label>
          <span>{{ t('adminSupport.campaigns.endsAt') }}</span>
          <BInput v-model:value="draft.endsAt" theme="al-day" type="datetime-local" />
        </label>
      </div>
      <label>
        <span>{{ t('adminSupport.campaigns.descriptionLabel') }}</span>
        <BInput
          v-model:value="draft.description"
          theme="al-day"
          :placeholder="t('adminSupport.campaigns.descriptionPlaceholder')"
          :maxlength="500"
        />
      </label>

      <div class="campaign-admin__sku-heading">
        <strong>{{ t('adminSupport.campaigns.skuTitle') }}</strong>
        <BButton size="small" @click="addSku">{{ t('adminSupport.campaigns.addSku') }}</BButton>
      </div>
      <div v-for="(sku, index) in draft.skus" :key="sku.localId" class="campaign-admin__sku-form">
        <div class="campaign-admin__sku-form-head">
          <strong>{{ t('adminSupport.campaigns.skuNumber', { count: index + 1 }) }}</strong>
          <BButton v-if="draft.skus.length > 1" size="small" @click="removeSku(index)">{{ t('common.delete') }}</BButton>
        </div>
        <div class="campaign-admin__form-grid is-sku">
          <label><span>SKU ID</span><BInput v-model:value="sku.skuId" theme="al-day" placeholder="summer-ai-6" /></label>
          <label
            ><span>{{ t('adminSupport.campaigns.skuName') }}</span
            ><BInput v-model:value="sku.title" theme="al-day"
          /></label>
          <label
            ><span>{{ t('adminSupport.campaigns.price') }}</span
            ><BInput v-model:value="sku.amount" theme="al-day" type="number"
          /></label>
          <label><span>AI tokens</span><BInput v-model:value="sku.aiTokens" theme="al-day" type="number" /></label>
          <label
            ><span>{{ t('adminSupport.campaigns.storageMb') }}</span
            ><BInput v-model:value="sku.storageMb" theme="al-day" type="number"
          /></label>
          <label
            ><span>{{ t('adminSupport.campaigns.perUserLimit') }}</span
            ><BInput v-model:value="sku.perUserLimit" theme="al-day" type="number"
          /></label>
        </div>
        <div v-if="costBySku.get(sku.skuId)" class="campaign-admin__cost" :class="{ 'is-failed': !costBySku.get(sku.skuId)?.passes }">
          {{
            t('adminSupport.campaigns.costResult', {
              cost: costBySku.get(sku.skuId)?.directCost.toFixed(2),
              margin: ((costBySku.get(sku.skuId)?.marginBps || 0) / 100).toFixed(1),
            })
          }}
        </div>
      </div>
      <div class="campaign-admin__preview-row">
        <BButton :loading="previewing" @click="previewCost">{{ t('adminSupport.campaigns.previewCost') }}</BButton>
        <span v-if="costPreview" :class="costPreview.passes ? 'is-pass' : 'is-failed'">
          {{ t(costPreview.passes ? 'adminSupport.campaigns.costPassed' : 'adminSupport.campaigns.costFailed') }}
        </span>
      </div>
    </div>
    <template #footer>
      <div class="campaign-admin__modal-footer">
        <BButton :disabled="creating" @click="createVisible = false">{{ t('common.cancel') }}</BButton>
        <BButton type="primary" :loading="creating" @click="createDraft">{{ t('adminSupport.campaigns.saveDraft') }}</BButton>
      </div>
    </template>
  </BModal>

  <BModal
    v-model:visible="grantsVisible"
    :title="t('adminSupport.campaigns.grantsTitle', { name: grantsCampaign?.title || '' })"
    width="min(940px, 96vw)"
    height="min(680px, 88vh)"
    :show-footer="false"
  >
    <div v-if="grantsLoading" class="campaign-admin__state"><BLoading inline loading /></div>
    <div v-else-if="grantsError" class="campaign-admin__state is-error">
      <span>{{ t('adminSupport.campaigns.grantsFailed') }}</span>
      <BButton size="small" @click="loadGrants">{{ t('common.retry') }}</BButton>
    </div>
    <div v-else-if="!grants.length" class="campaign-admin__state">{{ t('adminSupport.campaigns.noGrants') }}</div>
    <template v-else>
      <BTable
        class="campaign-admin__grant-table"
        fill
        row-key="id"
        :data="grants"
        :columns="grantColumns"
        :pagination="false"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'benefit'">{{ grantBenefit(record as AdminSupportCampaignGrant) }}</template>
          <template v-else-if="column.key === 'status'">
            <BChip :tone="grantStatusTone(record.status)">
              {{ grantStatusLabel(record.status) }}
            </BChip>
          </template>
          <template v-else-if="column.key === 'time'">{{ formatTime(record.creditedAt || record.createTime) }}</template>
        </template>
      </BTable>
      <div class="campaign-admin__grant-cards">
        <BCard v-for="grant in grants" :key="grant.id" padding="14px" radius="12px">
          <div class="campaign-admin__grant-card-head">
            <div>
              <strong>{{ grant.skuId }}</strong>
              <small>{{ grant.providerOrderNo }}</small>
            </div>
            <BChip :tone="grantStatusTone(grant.status)">{{ grantStatusLabel(grant.status) }}</BChip>
          </div>
          <dl>
            <div>
              <dt>{{ t('adminSupport.campaigns.paid') }}</dt>
              <dd>¥{{ grant.paidAmount }}</dd>
            </div>
            <div>
              <dt>{{ t('adminSupport.campaigns.benefit') }}</dt>
              <dd>{{ grantBenefit(grant) }}</dd>
            </div>
            <div>
              <dt>{{ t('adminSupport.campaigns.time') }}</dt>
              <dd>{{ formatTime(grant.creditedAt || grant.createTime) }}</dd>
            </div>
          </dl>
        </BCard>
      </div>
    </template>
  </BModal>
</template>

<script setup lang="ts">
  import { computed, onMounted, reactive, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import {
    createAdminSupportCampaign,
    getAdminSupportCampaignGrants,
    getAdminSupportCampaigns,
    previewAdminSupportCampaignCosts,
    publishAdminSupportCampaign,
    suspendAdminSupportCampaign,
    type AdminSupportCampaign,
    type AdminSupportCampaignCostPreview,
    type AdminSupportCampaignGrant,
    type AdminSupportCampaignSkuInput,
  } from '@/api/adminSupportApi';
  import { formatAiQuotaTokens } from '@/composables/useAiQuotaStatus';
  import { formatStorageSize } from '@/utils/common';

  type DraftSku = Omit<AdminSupportCampaignSkuInput, 'amount' | 'aiTokens' | 'storageMb' | 'perUserLimit'> & {
    localId: number;
    amount: number | string;
    aiTokens: number | string;
    storageMb: number | string;
    perUserLimit: number | string;
  };

  const { t, locale } = useI18n();
  const campaigns = ref<AdminSupportCampaign[]>([]);
  const loading = ref(true);
  const loadError = ref(false);
  const actingId = ref('');
  const createVisible = ref(false);
  const creating = ref(false);
  const previewing = ref(false);
  const costPreview = ref<AdminSupportCampaignCostPreview | null>(null);
  const grantsVisible = ref(false);
  const grantsLoading = ref(false);
  const grantsError = ref(false);
  const grants = ref<AdminSupportCampaignGrant[]>([]);
  const grantsCampaign = ref<AdminSupportCampaign | null>(null);
  let localSkuId = 0;

  function emptySku(): DraftSku {
    localSkuId += 1;
    return { localId: localSkuId, skuId: '', title: '', amount: 6, aiTokens: 0, storageMb: 0, perUserLimit: 1 };
  }

  const draft = reactive({
    campaignKey: '',
    title: '',
    description: '',
    startsAt: '',
    endsAt: '',
    skus: [emptySku()] as DraftSku[],
  });

  const costBySku = computed(() => new Map((costPreview.value?.items || []).map((item) => [item.skuId, item])));
  const grantColumns = computed(() => [
    { title: t('adminSupport.campaigns.order'), key: 'providerOrderNo' },
    { title: 'SKU', key: 'skuId' },
    { title: t('adminSupport.campaigns.paid'), key: 'paidAmount', width: '90px' },
    { title: t('adminSupport.campaigns.benefit'), key: 'benefit' },
    { title: t('adminSupport.campaigns.status'), key: 'status', width: '120px' },
    { title: t('adminSupport.campaigns.time'), key: 'time', width: '160px' },
  ]);

  function normalizeSkus(): AdminSupportCampaignSkuInput[] {
    return draft.skus.map((sku, index) => ({
      skuId: sku.skuId.trim(),
      title: sku.title.trim(),
      amount: Number(sku.amount),
      aiTokens: Number(sku.aiTokens),
      storageMb: Number(sku.storageMb),
      perUserLimit: Number(sku.perUserLimit),
      sortOrder: index,
    }));
  }

  async function loadCampaigns() {
    loading.value = true;
    loadError.value = false;
    try {
      campaigns.value = await getAdminSupportCampaigns();
    } catch {
      loadError.value = true;
    } finally {
      loading.value = false;
    }
  }

  function resetDraft() {
    draft.campaignKey = '';
    draft.title = '';
    draft.description = '';
    draft.startsAt = '';
    draft.endsAt = '';
    draft.skus.splice(0, draft.skus.length, emptySku());
    costPreview.value = null;
  }

  function openCreate() {
    resetDraft();
    createVisible.value = true;
  }

  function addSku() {
    if (draft.skus.length < 12) draft.skus.push(emptySku());
  }

  function removeSku(index: number) {
    draft.skus.splice(index, 1);
    costPreview.value = null;
  }

  async function previewCost() {
    previewing.value = true;
    try {
      costPreview.value = await previewAdminSupportCampaignCosts(normalizeSkus());
    } catch {
      message.error(t('adminSupport.campaigns.costPreviewFailed'));
    } finally {
      previewing.value = false;
    }
  }

  async function createDraft() {
    creating.value = true;
    try {
      await createAdminSupportCampaign({
        campaignKey: draft.campaignKey.trim(),
        title: draft.title.trim(),
        description: draft.description.trim(),
        startsAt: draft.startsAt,
        endsAt: draft.endsAt,
        skus: normalizeSkus(),
      });
      createVisible.value = false;
      message.success(t('adminSupport.campaigns.createSuccess'));
      await loadCampaigns();
    } catch {
      message.error(t('adminSupport.campaigns.createFailed'));
    } finally {
      creating.value = false;
    }
  }

  function confirmPublish(campaign: AdminSupportCampaign) {
    Alert.alert({
      title: t('adminSupport.campaigns.publishTitle'),
      content: t('adminSupport.campaigns.publishDescription'),
      okText: t('adminSupport.campaigns.publish'),
      async onOk() {
        actingId.value = campaign.id;
        try {
          await publishAdminSupportCampaign(campaign.id);
          message.success(t('adminSupport.campaigns.publishSuccess'));
          await loadCampaigns();
        } catch {
          message.error(t('adminSupport.campaigns.publishFailed'));
        } finally {
          actingId.value = '';
        }
      },
    });
  }

  function confirmSuspend(campaign: AdminSupportCampaign) {
    Alert.alert({
      title: t('adminSupport.campaigns.suspendTitle'),
      content: t('adminSupport.campaigns.suspendDescription'),
      okText: t('adminSupport.campaigns.suspend'),
      async onOk() {
        actingId.value = campaign.id;
        try {
          await suspendAdminSupportCampaign(campaign.id);
          message.success(t('adminSupport.campaigns.suspendSuccess'));
          await loadCampaigns();
        } catch {
          message.error(t('adminSupport.campaigns.suspendFailed'));
        } finally {
          actingId.value = '';
        }
      },
    });
  }

  async function loadGrants() {
    const campaign = grantsCampaign.value;
    if (!campaign) return;
    grants.value = [];
    grantsError.value = false;
    grantsLoading.value = true;
    try {
      grants.value = await getAdminSupportCampaignGrants(campaign.id);
    } catch {
      grantsError.value = true;
      message.error(t('adminSupport.campaigns.grantsFailed'));
    } finally {
      grantsLoading.value = false;
    }
  }

  function openGrants(campaign: AdminSupportCampaign) {
    grantsCampaign.value = campaign;
    grantsVisible.value = true;
    void loadGrants();
  }

  function campaignIsEnded(campaign: AdminSupportCampaign) {
    return campaign.status === 'published' && new Date(campaign.endsAt).getTime() <= Date.now();
  }

  function campaignPassesCostGate(campaign: AdminSupportCampaign) {
    return campaign.skus.length > 0 && campaign.skus.every((sku) => sku.marginBps >= 4_000);
  }

  function statusLabel(campaign: AdminSupportCampaign) {
    const status = campaignIsEnded(campaign) ? 'ended' : campaign.status;
    return t(`adminSupport.campaigns.statuses.${status}`);
  }

  function statusTone(campaign: AdminSupportCampaign): 'neutral' | 'success' | 'pending' {
    if (campaignIsEnded(campaign)) return 'neutral';
    if (campaign.status === 'published') return 'success';
    if (campaign.status === 'suspended') return 'pending';
    return 'neutral';
  }

  function benefitLabel(sku: { aiTokens: number; storageMb: number }) {
    const parts = [];
    if (sku.aiTokens) parts.push(formatAiQuotaTokens(sku.aiTokens, locale.value));
    if (sku.storageMb) parts.push(formatStorageSize(sku.storageMb));
    return parts.join(' + ');
  }

  function grantBenefit(grant: AdminSupportCampaignGrant) {
    return benefitLabel({ aiTokens: grant.grantedAiTokens, storageMb: grant.grantedStorageMb });
  }

  function grantStatusLabel(status: string) {
    const knownStatuses = ['pending', 'manual_review', 'credited', 'reversal_review', 'ineligible'];
    return knownStatuses.includes(status) ? t(`adminSupport.campaigns.grantStatuses.${status}`) : status;
  }

  function grantStatusTone(status: string): 'neutral' | 'success' | 'pending' | 'danger' {
    if (status === 'credited') return 'success';
    if (status === 'reversal_review') return 'danger';
    if (status === 'manual_review' || status === 'pending') return 'pending';
    return 'neutral';
  }

  function formatTime(value?: string | null) {
    if (!value) return '-';
    const date = new Date(String(value).replace(' ', 'T'));
    return Number.isNaN(date.getTime())
      ? String(value)
      : new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  onMounted(() => void loadCampaigns());
</script>

<style scoped lang="less">
  .campaign-admin {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .campaign-admin__header,
  .campaign-admin__card-head,
  .campaign-admin__title-row,
  .campaign-admin__actions,
  .campaign-admin__sku,
  .campaign-admin__sku-heading,
  .campaign-admin__sku-form-head,
  .campaign-admin__preview-row,
  .campaign-admin__modal-footer {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .campaign-admin__header,
  .campaign-admin__card-head,
  .campaign-admin__sku,
  .campaign-admin__sku-heading,
  .campaign-admin__sku-form-head {
    justify-content: space-between;
  }

  .campaign-admin__header h2,
  .campaign-admin__header p,
  .campaign-admin__card-head p,
  .campaign-admin__description,
  .campaign-admin__immutable,
  .campaign-admin__cost-blocked {
    margin: 0;
  }

  .campaign-admin__header h2 {
    color: var(--text-color);
    font-size: 18px;
  }

  .campaign-admin__header p,
  .campaign-admin__card-head p,
  .campaign-admin__description,
  .campaign-admin__immutable,
  .campaign-admin__cost-blocked {
    margin-top: 5px;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.6;
  }

  .campaign-admin__state {
    min-height: 150px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    color: var(--desc-color);
  }

  .campaign-admin__state.is-error {
    border-color: var(--error-color, #c33f47);
    color: var(--error-color, #c33f47);
  }

  .campaign-admin__list {
    display: grid;
    gap: 12px;
  }

  .campaign-admin__skus {
    margin-top: 12px;
    display: grid;
    gap: 7px;
  }

  .campaign-admin__sku {
    padding: 9px 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 9px;
    background: var(--workspace-panel-bg-color);
  }

  .campaign-admin__sku strong,
  .campaign-admin__sku small {
    display: block;
  }

  .campaign-admin__sku small {
    margin-top: 3px;
    color: var(--desc-color);
    font-size: 11px;
  }

  .campaign-admin__immutable {
    padding-left: 9px;
    border-left: 3px solid var(--primary-color);
  }

  .campaign-admin__cost-blocked {
    padding-left: 9px;
    border-left: 3px solid var(--error-color, #c33f47);
    color: var(--error-color, #c33f47);
  }

  :global(.campaign-admin__modal-content) {
    overflow-y: auto;
  }

  .campaign-admin__form {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .campaign-admin__form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .campaign-admin__form-grid.is-sku {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .campaign-admin__form label {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
    color: var(--desc-color);
    font-size: 12px;
  }

  .campaign-admin__sku-form {
    padding: 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 11px;
    background: var(--workspace-panel-bg-color);
  }

  .campaign-admin__sku-form-head {
    margin-bottom: 9px;
  }

  .campaign-admin__cost,
  .campaign-admin__preview-row span {
    margin-top: 8px;
    color: var(--success-color);
    font-size: 12px;
  }

  .campaign-admin__cost.is-failed,
  .campaign-admin__preview-row .is-failed {
    color: var(--error-color, #c33f47);
  }

  .campaign-admin__modal-footer {
    justify-content: flex-end;
    padding: 12px 16px;
    border-top: 1px solid var(--surface-border-color);
  }

  .campaign-admin__grant-cards {
    display: none;
  }

  .campaign-admin__grant-card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }

  .campaign-admin__grant-card-head strong,
  .campaign-admin__grant-card-head small {
    display: block;
  }

  .campaign-admin__grant-card-head small {
    margin-top: 3px;
    color: var(--desc-color);
    font-size: 11px;
  }

  .campaign-admin__grant-cards dl {
    display: grid;
    gap: 7px;
    margin: 12px 0 0;
  }

  .campaign-admin__grant-cards dl > div {
    display: grid;
    grid-template-columns: minmax(72px, auto) minmax(0, 1fr);
    gap: 10px;
  }

  .campaign-admin__grant-cards dt,
  .campaign-admin__grant-cards dd {
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
  }

  .campaign-admin__grant-cards dt {
    color: var(--desc-color);
  }

  .campaign-admin__grant-cards dd {
    min-width: 0;
    color: var(--text-color);
    overflow-wrap: anywhere;
  }

  @media (max-width: 760px) {
    .campaign-admin__header,
    .campaign-admin__card-head {
      align-items: stretch;
      flex-direction: column;
    }

    .campaign-admin__actions {
      flex-wrap: wrap;
    }

    .campaign-admin__form-grid,
    .campaign-admin__form-grid.is-sku {
      grid-template-columns: 1fr;
    }

    .campaign-admin__grant-table {
      display: none;
    }

    .campaign-admin__grant-cards {
      display: grid;
      gap: 10px;
    }
  }

  html.light-note-mobile-rendering .campaign-admin__sku,
  html.light-note-mobile-rendering .campaign-admin__sku-form {
    box-shadow: none;
  }
</style>
