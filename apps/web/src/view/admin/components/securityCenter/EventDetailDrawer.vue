<template>
  <BDrawer
    :open="open"
    :title="t('securityV2.review.eventTitle', { name: detail.event?.matchedRule || detail.event?.primaryRuleCode || '-' })"
    width="680px"
    :mobile-full-screen="true"
    body-padding="0"
    @close="emit('close')"
  >
    <div class="security-detail-layout">
      <BLoading v-if="loading" inline loading class="security-detail-loading" :title="t('common.loading')" />
      <div v-else class="security-detail-body">
        <div class="security-detail-summary">
          <div class="security-detail-stat"><span>{{ t('securityV2.review.threatScore') }}</span><strong>{{ number(event.threatScore) }}</strong></div>
          <div class="security-detail-stat"><span>{{ t('securityV2.review.confidence') }}</span><strong>{{ number(event.confidence) }}%</strong></div>
          <div class="security-detail-stat"><span>{{ t('securityV2.review.action') }}</span><strong>{{ event.blocked ? t('securityV2.common.blocked') : t('securityV2.common.logged') }}</strong></div>
          <div class="security-detail-stat"><span>{{ t('securityV2.review.hit') }}</span><strong>{{ detail.similarEvents?.length || 1 }}</strong></div>
        </div>

        <section class="security-detail-section">
          <h4>{{ t('securityV2.review.why') }}</h4>
          <div class="security-banner is-warning no-margin">
            <span class="security-pill is-warning">{{ t('securityV2.review.pending') }}</span>
            <div><strong>{{ primaryEvidence?.evidenceMessage || event.decisionReason || event.matchedRule || '-' }}</strong><p>{{ t('securityV2.review.markedReason') }}</p></div>
          </div>
        </section>

        <section class="security-detail-section">
          <h4>{{ t('securityV2.review.evidence') }}</h4>
          <article v-for="evidence in detail.evidence" :key="evidence.id" class="security-evidence">
            <i></i>
            <div>
              <strong>{{ evidence.ruleCode }} · {{ evidence.matchedField || '-' }}</strong>
              <p>{{ evidence.evidenceMessage || '-' }} · {{ evidenceMode(evidence.policyMode) }} · {{ number(evidence.confidence) }}%</p>
              <code>{{ evidence.matchedValuePreview || '-' }}</code>
            </div>
            <span class="security-pill is-warning">+{{ number(evidence.scoreDelta) }}</span>
          </article>
          <div v-if="!detail.evidence?.length" class="security-empty">{{ t('securityV2.common.noData') }}</div>
        </section>

        <section class="security-detail-section">
          <h4>{{ t('securityV2.review.context') }}</h4>
          <div class="security-detail-summary">
            <div class="security-detail-stat"><span>{{ t('securityV2.review.endpoint') }}</span><strong>{{ event.requestMethod || '-' }} {{ event.requestPath || '-' }}</strong></div>
            <div class="security-detail-stat"><span>{{ t('securityV2.review.account') }}</span><strong>{{ event.alias || event.email || event.userId || t('securityV2.common.anonymous') }}</strong></div>
            <div class="security-detail-stat"><span>{{ t('securityV2.review.response') }}</span><strong>{{ event.statusCode || '-' }}</strong></div>
            <div class="security-detail-stat"><span>{{ t('securityV2.review.requestId') }}</span><strong>{{ event.eventId || '-' }}</strong></div>
          </div>
        </section>

        <section class="security-detail-section">
          <h4>{{ t('securityV2.review.advice') }}</h4>
          <div class="security-advice-row"><span class="is-tune">调</span><div><strong>{{ t('securityV2.review.storageAdvice') }}</strong><small>{{ t('securityV2.review.storageAdviceDesc') }}</small></div></div>
          <div class="security-advice-row"><span class="is-block">阻</span><div><strong>{{ t('securityV2.review.activeAdvice') }}</strong><small>{{ t('securityV2.review.activeAdviceDesc') }}</small></div></div>
        </section>

        <section class="security-detail-section security-more-actions">
          <h4>{{ t('securityV2.review.more') }}</h4>
          <BButton :disabled="!event.sourceIp" @click="denySource">{{ t('securityV2.review.sourceDeny') }}</BButton>
          <BButton :disabled="!event.userId" @click="openAccountRisk">{{ t('securityV2.review.accountRisk') }}</BButton>
        </section>
      </div>
      <footer class="security-detail-footer">
        <BButton @click="saveDisposition('benign_anomaly')">{{ t('securityV2.review.benignAction') }}</BButton>
        <BButton @click="saveDisposition('authorized_test')">{{ t('securityV2.review.authorizedAction') }}</BButton>
        <BButton class="is-false" @click="saveDisposition('false_positive')">{{ t('securityV2.review.falseAction') }}</BButton>
        <BButton type="danger" @click="saveDisposition('confirmed_attack')">{{ t('securityV2.review.confirmAction') }}</BButton>
      </footer>
    </div>
  </BDrawer>
</template>

<script lang="ts" setup>
  import { computed, reactive, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import { apiBaseGet, apiBasePost } from '@/http/request';
  import { securityCenterMessages } from './securityCenterI18n';

  const props = defineProps<{ open: boolean; eventId: string; raw?: boolean }>();
  const emit = defineEmits<{ close: []; saved: [] }>();
  const { t } = useI18n({ useScope: 'local', messages: securityCenterMessages });
  const router = useRouter();
  const loading = ref(false);
  const detail = reactive<any>({ event: {}, evidence: [], similarEvents: [], sourceAnalysis: {}, accountAnalysis: {} });
  const event = computed(() => detail.event || {});
  const primaryEvidence = computed(() => detail.evidence?.[0]);
  const number = (value: unknown) => Number(value || 0);
  const evidenceMode = (mode: string) => mode ? t(`securityV2.common.${mode === 'block' ? 'block' : 'observe'}`) : '-';

  async function loadDetail() {
    if (!props.open || !props.eventId) return;
    loading.value = true;
    const res = await apiBaseGet(`/api/security/v2/review/clusters/${encodeURIComponent(props.eventId)}`, {}, { silent: true }).catch(() => null).finally(() => { loading.value = false; });
    if (res?.status === 200) Object.assign(detail, res.data || {});
  }
  async function saveDisposition(disposition: string) {
    const kind = props.raw ? 'events' : 'clusters';
    const res = await apiBasePost(`/api/security/v2/${kind}/${encodeURIComponent(props.eventId)}/disposition`, {
      disposition,
      reason: t('securityV2.review.reviewReason'),
      createTuningSuggestion: disposition === 'false_positive',
    }).catch(() => null);
    if (res?.status === 200) { message.success(t('securityV2.review.success')); emit('saved'); emit('close'); }
  }
  function denySource() {
    Alert.alert({
      title: t('securityV2.review.sourceDeny'),
      content: `${event.value.sourceIp} · 60 min · ${t('securityV2.review.sourceSummary', { events: number(detail.sourceAnalysis?.events24h), confirmed: number(detail.sourceAnalysis?.confirmedEvents), falsePositive: number(detail.sourceAnalysis?.falsePositives) })}`,
      okText: t('securityV2.access.sourceApply'),
      cancelText: t('securityV2.common.close'),
      onOk: async () => {
        const res = await apiBasePost('/api/security/v2/source-denies/apply', { ip: event.value.sourceIp, minutes: 60, reason: t('securityV2.review.reviewReason') }).catch(() => null);
        if (res?.status === 200) message.success(t('securityV2.access.sourceApplied'));
      },
    });
  }
  function openAccountRisk() {
    Alert.alert({
      title: t('securityV2.review.accountRisk'),
      content: t('securityV2.review.accountSummary', { score: number(detail.accountAnalysis?.riskScore), events: number(detail.accountAnalysis?.totalEvents), restrictions: number(detail.accountAnalysis?.activeRestrictions) }),
      okText: t('securityV2.review.manageAccess'),
      cancelText: t('securityV2.common.close'),
      onOk: () => { emit('close'); router.push({ name: 'securityCenterAccess', query: { userId: event.value.userId } }); },
    });
  }
  watch(() => [props.open, props.eventId], loadDetail, { immediate: true });
</script>

<style lang="less" scoped>
  @import './securityCenter.less';
</style>
