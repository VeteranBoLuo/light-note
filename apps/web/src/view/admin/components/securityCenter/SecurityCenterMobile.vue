<template>
  <CommonContainer :title="t('securityV2.title')" @back-click="router.push('/admin')">
    <template #navigation>
      <div class="security-mobile-nav">
        <BButton class="security-mobile-icon" :aria-label="t('securityV2.common.back')" @click="router.push('/admin')"><SvgIcon :src="icon.arrow_left" size="22" /></BButton>
        <strong>{{ t('securityV2.title') }}</strong>
        <span></span>
        <BButton class="security-mobile-icon" :aria-label="t('securityV2.common.refresh')" :loading="loading" @click="loadOverview"><SvgIcon :src="icon.cloudSpace.preview.rotate" size="20" /></BButton>
      </div>
    </template>

    <div class="security-mobile-content">
      <section v-if="mobileTab === 'overview'" class="security-mobile-panel" data-section="overview">
        <section class="security-mobile-status">
          <b>{{ t('securityV2.mobile.healthy') }}</b>
          <span>{{ t('securityV2.mobile.status', { version: summary.policyVersion || 1, backlog: summary.eventBacklog ? t('securityV2.overview.backlog', { count: summary.eventBacklog }) : t('securityV2.mobile.noBacklog') }) }}</span>
        </section>
        <div class="security-mobile-kpis">
          <article v-for="card in mobileKpis" :key="card.label"><span>{{ card.label }}</span><b :class="card.tone">{{ card.value }}</b></article>
        </div>
      </section>

      <section v-else-if="mobileTab === 'review'" class="security-mobile-panel" data-section="review">
        <div class="security-mobile-section-title"><strong>{{ t('securityV2.mobile.reviewEvents') }}</strong><span>{{ t('securityV2.mobile.viewAll', { count: summary.pendingReview || 0 }) }}</span></div>
        <article v-for="event in reviewQueue" :key="event.representativeEventId" class="security-mobile-event" @click="openDetail(event)">
          <div class="security-mobile-event-head">
            <span class="security-mobile-score">{{ number(event.maxScore) }}</span>
            <div><strong>{{ event.ruleName || event.ruleCode }}</strong><span>{{ event.requestPath || '-' }} · {{ event.actorLabel || t('securityV2.common.anonymous') }} · {{ t('securityV2.common.hits', { count: event.hitCount || 1 }) }}</span></div>
            <span class="security-pill" :class="event.blocked ? 'is-danger' : 'is-info'">{{ event.blocked ? t('securityV2.common.blocked') : t('securityV2.common.logged') }}</span>
          </div>
          <div class="security-mobile-event-meta"><span class="security-pill is-warning">{{ t('securityV2.overview.needsContext') }}</span><span>{{ formatTime(event.lastSeenAt) }}</span></div>
          <div class="security-mobile-event-actions" @click.stop>
            <BButton @click="classify(event, 'false_positive')">{{ t('securityV2.review.falsePositive') }}</BButton>
            <BButton @click="classify(event, 'authorized_test')">{{ t('securityV2.review.authorized') }}</BButton>
            <BButton type="danger" @click="classify(event, 'confirmed_attack')">{{ t('securityV2.review.confirmAction') }}</BButton>
          </div>
        </article>
        <div v-if="!reviewQueue.length" class="security-empty">{{ t('securityV2.common.noData') }}</div>
      </section>

      <section v-else-if="mobileTab === 'quality'" class="security-mobile-panel" data-section="quality">
        <div class="security-mobile-section-title"><strong>{{ t('securityV2.mobile.qualityAlert') }}</strong><span>{{ t('securityV2.mobile.desktop') }}</span></div>
        <article v-for="rule in noisyRules" :key="rule.ruleCode" class="security-mobile-event">
          <div class="security-mobile-event-head"><span class="security-mobile-score is-alert">!</span><div><strong>{{ rule.ruleName || rule.ruleCode }} · {{ number(rule.falsePositiveRate) }}%</strong><span>{{ rule.primaryRoute || '-' }} · {{ t('securityV2.overview.noisyHint') }}</span></div></div>
        </article>
        <div v-if="!noisyRules.length" class="security-empty">{{ t('securityV2.common.noData') }}</div>
        <p class="security-mobile-principle">{{ t('securityV2.mobile.reviewOnly') }}</p>
      </section>

      <SecurityAccessControl v-else class="security-mobile-access" data-section="access" />
    </div>

    <nav class="security-mobile-bottom-nav">
      <BButton :class="{ 'is-active': mobileTab === 'overview' }" @click="selectTab('overview')">{{ t('securityV2.nav.overview') }}</BButton>
      <BButton :class="{ 'is-active': mobileTab === 'review' }" @click="selectTab('review')">{{ t('securityV2.nav.review') }}</BButton>
      <BButton :class="{ 'is-active': mobileTab === 'quality' }" @click="selectTab('quality')">{{ t('securityV2.nav.quality') }}</BButton>
      <BButton :class="{ 'is-active': mobileTab === 'access' }" @click="selectTab('access')">{{ t('securityV2.nav.access') }}</BButton>
    </nav>

    <EventDetailDrawer :open="drawerOpen" :event-id="activeEventId" @close="drawerOpen = false" @saved="loadOverview" />
  </CommonContainer>
</template>

<script lang="ts" setup>
  import { computed, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { apiBasePost } from '@/http/request';
  import EventDetailDrawer from './EventDetailDrawer.vue';
  import SecurityAccessControl from './SecurityAccessControl.vue';
  import { securityCenterMessages } from './securityCenterI18n';

  const { t } = useI18n({ useScope: 'local', messages: securityCenterMessages });
  const route = useRoute();
  const router = useRouter();
  const loading = ref(false);
  const overview = ref<any>({ summary: {}, reviewQueue: [], noisyRules: [] });
  const drawerOpen = ref(false);
  const activeEventId = ref('');
  type MobileTab = 'overview' | 'review' | 'quality' | 'access';
  const mobileTabs = new Set<MobileTab>(['overview', 'review', 'quality', 'access']);
  const normalizeTab = (value: unknown): MobileTab => mobileTabs.has(String(value) as MobileTab) ? String(value) as MobileTab : 'overview';
  const mobileTab = ref<MobileTab>(normalizeTab(route.query.tab));
  const summary = computed(() => overview.value.summary || {});
  const reviewQueue = computed(() => overview.value.reviewQueue || []);
  const noisyRules = computed(() => overview.value.noisyRules || []);
  const number = (value: unknown) => Number(value || 0);
  const mobileKpis = computed(() => [
    { label: t('securityV2.overview.pending'), value: number(summary.value.pendingReview), tone: 'is-warning' },
    { label: t('securityV2.overview.confirmed7d'), value: number(summary.value.confirmedAttacks), tone: '' },
    { label: t('securityV2.overview.falsePositive7d'), value: `${number(summary.value.falsePositiveRate)}%`, tone: 'is-danger' },
    { label: t('securityV2.overview.highBlocks'), value: number(summary.value.highConfidenceBlocks), tone: '' },
  ]);
  function formatTime(value: string) { return value ? new Date(value.replace(' ', 'T')).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'; }
  function openDetail(event: any) { activeEventId.value = event.representativeEventId; drawerOpen.value = true; }
  function selectTab(tab: MobileTab) {
    if (mobileTab.value === tab) return;
    mobileTab.value = tab;
    router.replace({ query: { ...route.query, tab } });
  }
  async function loadOverview() { loading.value = true; const res = await apiBasePost('/api/security/v2/overview', { days: 7 }, { silent: true }).catch(() => null).finally(() => { loading.value = false; }); if (res?.status === 200) overview.value = res.data || overview.value; }
  async function classify(event: any, disposition: string) { const res = await apiBasePost(`/api/security/v2/clusters/${encodeURIComponent(event.representativeEventId)}/disposition`, { disposition, reason: t('securityV2.review.reviewReason'), createTuningSuggestion: disposition === 'false_positive' }).catch(() => null); if (res?.status === 200) { message.success(t('securityV2.review.success')); loadOverview(); } }
  watch(() => route.query.tab, (tab) => { mobileTab.value = normalizeTab(tab); });
  onMounted(loadOverview);
</script>

<style lang="less" scoped>
  @import './securityCenter.less';
</style>
