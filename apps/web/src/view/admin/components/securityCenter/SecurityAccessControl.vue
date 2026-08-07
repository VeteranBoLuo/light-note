<template>
  <div class="security-v2-page security-access-v2">
    <header class="security-v2-header">
      <div><h2>{{ t('securityV2.access.title') }}</h2><p>{{ t('securityV2.access.subtitle') }}</p></div>
      <BButton type="primary" @click="openCreate('accounts')">{{ t('securityV2.access.newPolicy') }}</BButton>
    </header>

    <BLoading :loading="loading">
      <div class="security-control-columns">
        <section class="security-panel">
          <div class="security-panel-head">
            <div><h3>{{ t('securityV2.access.activeAccounts') }}</h3><span>{{ t('securityV2.access.accountsHint') }}</span></div>
            <BButton @click="showHistory = !showHistory">{{ t('securityV2.access.history') }}</BButton>
          </div>
          <div v-for="item in visibleRestrictions" :key="item.id" class="security-control-row">
            <div class="security-control-main"><strong>{{ item.email || item.alias || item.userId }}</strong><small>{{ restrictionLabel(item.restrictionType) }} · {{ expiryLabel(item.expiresAt) }} · {{ item.reason }}</small></div>
            <div class="security-control-actions"><BButton size="small" @click="showDetail(item)">{{ t('securityV2.common.detail') }}</BButton><BButton v-if="item.status === 'active'" size="small" @click="revokeRestriction(item)">{{ t('securityV2.common.revoke') }}</BButton></div>
          </div>
          <div v-if="!visibleRestrictions.length" class="security-empty">{{ t('securityV2.access.noAccount') }}</div>
        </section>

        <section class="security-panel">
          <div class="security-panel-head">
            <div><h3>{{ t('securityV2.access.exceptionTitle') }}</h3><span>{{ t('securityV2.access.exceptionHint') }}</span></div>
            <BButton @click="openCreate('exceptions')">＋ {{ t('securityV2.common.add') }}</BButton>
          </div>
          <div v-for="item in exceptions" :key="item.id" class="security-control-row">
            <div class="security-control-main"><strong>{{ item.userAlias || item.userEmail || item.subjectValue }} · {{ item.ruleCode || '*' }}</strong><small>{{ item.routePattern || '*' }} · {{ effectLabel(item.effect) }} · {{ expiryLabel(item.expiresAt) }}</small></div>
            <div class="security-control-actions"><BButton size="small" @click="showDetail(item)">{{ t('securityV2.common.detail') }}</BButton><BButton v-if="item.enabled" size="small" @click="disableException(item)">{{ t('securityV2.common.disable') }}</BButton></div>
          </div>
          <div v-if="!exceptions.length" class="security-empty">{{ t('securityV2.access.noException') }}</div>
        </section>
      </div>

      <section class="security-panel security-source-panel">
        <div class="security-panel-head">
          <div><h3>{{ t('securityV2.access.sourceTitle') }}</h3><span>{{ t('securityV2.access.sourceHint') }}</span></div>
          <BButton @click="openCreate('sources')">{{ t('securityV2.access.sourceDialog') }}</BButton>
        </div>
        <div class="security-banner is-warning no-margin">
          <span class="security-pill is-warning">{{ t('securityV2.common.boundary') }}</span>
          <div><strong>{{ t('securityV2.access.sourceBoundary') }}</strong><p>{{ t('securityV2.access.sourceBoundaryDesc') }}</p></div>
        </div>
        <div v-for="item in sourceDenies" :key="item.ip" class="security-control-row">
          <div class="security-control-main"><strong>{{ item.ip || '-' }}</strong><small>{{ expiryLabel(item.bannedUntil) }} · {{ item.banReason || '-' }}</small></div>
          <div class="security-control-actions"><BButton size="small" @click="revokeSource(item)">{{ t('securityV2.common.revoke') }}</BButton></div>
        </div>
        <div v-if="!sourceDenies.length" class="security-empty">{{ t('securityV2.access.noSource') }}</div>
      </section>
    </BLoading>

    <BModal v-model:visible="modalOpen" :title="modalTitle" width="620px" modal-class="security-policy-modal" @ok="submitPolicy">
      <div v-if="createType === 'accounts'" class="security-modal-form">
        <label><span>{{ t('securityV2.access.userId') }}</span><BInput v-model:value="accountDraft.userId" /></label>
        <label><span>{{ t('securityV2.access.restrictionType') }}</span><BSelect v-model:value="accountDraft.restrictionType" :options="restrictionOptions" /></label>
        <label class="is-wide"><span>{{ t('securityV2.access.reason') }}</span><BInput v-model:value="accountDraft.reason" /></label>
        <label><span>{{ t('securityV2.access.expiry') }}</span><BDateTimePicker v-model:value="accountDraft.expiresAt" :disabled="accountDraft.permanent" /></label>
        <BCheckbox v-model="accountDraft.permanent">{{ t('securityV2.access.permanent') }}</BCheckbox>
      </div>
      <div v-else-if="createType === 'exceptions'" class="security-modal-form">
        <label><span>{{ t('securityV2.access.subjectType') }}</span><BSelect v-model:value="exceptionDraft.subjectType" :options="subjectOptions" /></label>
        <label><span>{{ t('securityV2.access.subjectValue') }}</span><BInput v-model:value="exceptionDraft.subjectValue" /></label>
        <label><span>{{ t('securityV2.access.ruleCode') }}</span><BInput v-model:value="exceptionDraft.ruleCode" /></label>
        <label><span>{{ t('securityV2.access.effect') }}</span><BSelect v-model:value="exceptionDraft.effect" :options="effectOptions" /></label>
        <label><span>{{ t('securityV2.access.routePattern') }}</span><BInput v-model:value="exceptionDraft.routePattern" /></label>
        <label><span>{{ t('securityV2.access.requestMethod') }}</span><BSelect v-model:value="exceptionDraft.requestMethod" allow-clear :options="methodOptions" /></label>
        <label><span>{{ t('securityV2.access.fieldPattern') }}</span><BInput v-model:value="exceptionDraft.fieldPattern" /></label>
        <label><span>{{ t('securityV2.access.expiry') }}</span><BDateTimePicker v-model:value="exceptionDraft.expiresAt" :disabled="exceptionDraft.permanent" /></label>
        <label class="is-wide"><span>{{ t('securityV2.access.reason') }}</span><BInput v-model:value="exceptionDraft.reason" /></label>
        <BCheckbox v-model="exceptionDraft.permanent">{{ t('securityV2.access.permanent') }}</BCheckbox>
      </div>
      <div v-else class="security-modal-form">
        <label><span>{{ t('securityV2.access.sourceIp') }}</span><BInput v-model:value="sourceDraft.ip" /></label>
        <label><span>{{ t('securityV2.access.minutes') }}</span><BInput v-model:value="sourceDraft.minutes" type="number" /></label>
        <label class="is-wide"><span>{{ t('securityV2.access.reason') }}</span><BInput v-model:value="sourceDraft.reason" /></label>
      </div>
      <template #footer>
        <div class="security-modal-footer"><BButton @click="modalOpen = false">{{ t('securityV2.common.close') }}</BButton><BButton type="primary" :loading="saving" @click="submitPolicy">{{ createType === 'sources' ? t('securityV2.access.sourceApply') : t('securityV2.access.create') }}</BButton></div>
      </template>
    </BModal>
  </div>
</template>

<script lang="ts" setup>
  import { computed, onMounted, reactive, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import BDateTimePicker from '@/components/base/BasicComponents/BDateTimePicker.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import { apiBasePost } from '@/http/request';
  import { securityCenterMessages } from './securityCenterI18n';

  type Section = 'accounts' | 'exceptions' | 'sources';
  const { t } = useI18n({ useScope: 'local', messages: securityCenterMessages });
  const route = useRoute();
  const loading = ref(false);
  const saving = ref(false);
  const showHistory = ref(false);
  const createType = ref<Section>('accounts');
  const modalOpen = ref(false);
  const restrictions = ref<any[]>([]);
  const exceptions = ref<any[]>([]);
  const sourceDenies = ref<any[]>([]);
  const accountDraft = reactive({ userId: '', restrictionType: 'write_lock', reason: '', expiresAt: '', permanent: false });
  const exceptionDraft = reactive({ subjectType: 'user', subjectValue: '', ruleCode: '', routePattern: '', requestMethod: '', fieldPattern: '', effect: 'observe_only', reason: '', expiresAt: '', permanent: false });
  const sourceDraft = reactive({ ip: '', minutes: 60, reason: '' });
  const restrictionOptions = computed(() => [
    { value: 'write_lock', label: t('securityV2.access.writeLock') }, { value: 'login_lock', label: t('securityV2.access.loginLock') },
    { value: 'upload_lock', label: t('securityV2.access.uploadLock') }, { value: 'ai_lock', label: t('securityV2.access.aiLock') },
    { value: 'full_lock', label: t('securityV2.access.fullLock') },
  ]);
  const subjectOptions = computed(() => [{ value: 'user', label: t('securityV2.access.user') }, { value: 'ip', label: t('securityV2.access.ip') }]);
  const effectOptions = computed(() => [{ value: 'observe_only', label: t('securityV2.access.observeOnly') }, { value: 'skip_rule', label: t('securityV2.access.skipRule') }, { value: 'score_adjust', label: t('securityV2.access.scoreAdjust') }]);
  const methodOptions = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((value) => ({ value, label: value }));
  const modalTitle = computed(() => createType.value === 'accounts' ? t('securityV2.access.accountDialog') : createType.value === 'exceptions' ? t('securityV2.access.exceptionDialog') : t('securityV2.access.sourceDialog'));
  const visibleRestrictions = computed(() => showHistory.value ? restrictions.value : restrictions.value.filter((item) => item.status === 'active'));

  function openCreate(type: Section) { createType.value = type; if (type === 'accounts' && route.query.userId) accountDraft.userId = String(route.query.userId); modalOpen.value = true; }
  function restrictionLabel(type: string) { return restrictionOptions.value.find((item) => item.value === type)?.label || type; }
  function effectLabel(effect: string) { return effectOptions.value.find((item) => item.value === effect)?.label || effect; }
  function expiryLabel(value: string) { return value ? t('securityV2.access.expiresAt', { time: new Date(value.replace(' ', 'T')).toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) }) : t('securityV2.access.noExpiry'); }
  function showDetail(item: any) { Alert.alert({ title: t('securityV2.common.detail'), content: `${item.reason || '-'} · ${expiryLabel(item.expiresAt)}`, okText: t('securityV2.common.close'), cancelText: t('securityV2.common.close'), onOk: () => {} }); }
  async function loadAll() {
    loading.value = true;
    const [restrictionRes, exceptionRes, sourceRes] = await Promise.all([
      apiBasePost('/api/security/v2/restrictions/list', {}, { silent: true }).catch(() => null), apiBasePost('/api/security/v2/exceptions/list', {}, { silent: true }).catch(() => null), apiBasePost('/api/security/v2/source-denies/list', {}, { silent: true }).catch(() => null),
    ]).finally(() => { loading.value = false; });
    if (restrictionRes?.status === 200) restrictions.value = restrictionRes.data?.items || [];
    if (exceptionRes?.status === 200) exceptions.value = exceptionRes.data?.items || [];
    if (sourceRes?.status === 200) sourceDenies.value = sourceRes.data?.items || [];
  }
  async function submitPolicy() {
    saving.value = true;
    let res;
    if (createType.value === 'accounts') res = await apiBasePost('/api/security/v2/restrictions/apply', { ...accountDraft, expiresAt: accountDraft.permanent ? null : accountDraft.expiresAt }).catch(() => null);
    else if (createType.value === 'exceptions') res = await apiBasePost('/api/security/v2/exceptions/save', { ...exceptionDraft, expiresAt: exceptionDraft.permanent ? null : exceptionDraft.expiresAt }).catch(() => null);
    else res = await apiBasePost('/api/security/v2/source-denies/apply', { ...sourceDraft, minutes: Number(sourceDraft.minutes) }).catch(() => null);
    saving.value = false;
    if (res?.status === 200) { message.success(createType.value === 'accounts' ? t('securityV2.access.accountApplied') : createType.value === 'exceptions' ? t('securityV2.access.exceptionApplied') : t('securityV2.access.sourceApplied')); modalOpen.value = false; loadAll(); }
  }
  async function revokeRestriction(item: any) { const res = await apiBasePost('/api/security/v2/restrictions/revoke', { id: item.id, reason: t('securityV2.review.reviewReason') }).catch(() => null); if (res?.status === 200) { message.success(t('securityV2.access.revoked')); loadAll(); } }
  async function disableException(item: any) { const res = await apiBasePost('/api/security/v2/exceptions/disable', { id: item.id, reason: t('securityV2.review.reviewReason') }).catch(() => null); if (res?.status === 200) { message.success(t('securityV2.access.disabled')); loadAll(); } }
  async function revokeSource(item: any) { const res = await apiBasePost('/api/security/v2/source-denies/revoke', { ip: item.ip }).catch(() => null); if (res?.status === 200) { message.success(t('securityV2.access.revoked')); loadAll(); } }
  onMounted(() => { if (route.query.userId) accountDraft.userId = String(route.query.userId); loadAll(); });
</script>

<style lang="less" scoped>
  @import './securityCenter.less';
</style>
