<template>
  <main class="infra-module-page">
    <div class="infra-module-content">
      <InfraModuleHeader
        :title="t('serverManagement.eventsPage.title')"
        :subtitle="t('serverManagement.eventsPage.subtitle')"
        :icon-src="icon.infrastructure.events"
        :cadence="t('serverManagement.eventsPage.cadence')"
        :loading="refreshing"
        :refresh-label="t('common.refresh')"
        @refresh="refresh"
      />
      <BLoading v-if="initialLoading" inline :loading="true" :title="t('serverManagement.eventsPage.loading')" />
      <div v-else-if="error && !data" class="infra-state-card">
        <SvgIcon :src="icon.message.warning" size="24" /><div
          ><strong>{{ t('serverManagement.snapshotUnavailable') }}</strong
          ><p>{{ error }}</p></div
        >
        <BButton type="primary" @click="refresh">{{ t('serverManagement.retry') }}</BButton>
      </div>
      <template v-else>
        <div v-if="error" class="infra-stale-warning" role="status"
          ><SvgIcon :src="icon.message.warning" size="16" />{{ t('serverManagement.staleSnapshot') }}</div
        >
        <BCard :title="t('serverManagement.eventsPage.auditTitle')">
          <template #extra>
            <BSelect
              class="events-filter"
              :value="outcome"
              :options="outcomeOptions"
              @change="outcome = String($event)"
            />
          </template>
          <div v-if="!filteredItems.length" class="events-empty">{{ t('serverManagement.eventsPage.empty') }}</div>
          <ol v-else class="events-timeline">
            <li v-for="item in filteredItems" :key="item.id">
              <span class="events-timeline__marker" :class="`is-${item.outcome}`" aria-hidden="true"></span>
              <div class="events-timeline__content">
                <div
                  ><strong>{{ actionLabel(item.action) }}</strong
                  ><BChip :tone="outcomeTone(item.outcome)">{{ outcomeLabel(item.outcome) }}</BChip></div
                >
                <p>{{ item.reason || t('serverManagement.eventsPage.noReason') }}</p>
                <small>{{ targetLabel(item) }} · {{ formatTime(item.createTime) }}</small>
              </div>
            </li>
          </ol>
        </BCard>
      </template>
    </div>
  </main>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { getAdminOperationAudits } from '@/api/commonApi';
  import icon from '@/config/icon';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import InfraModuleHeader from './InfraModuleHeader.vue';
  import { useInfraSnapshot } from './useInfraSnapshot';

  interface AuditItem {
    id: string;
    action: string;
    targetType?: string | null;
    targetId?: string | null;
    outcome: string;
    reason?: string | null;
    createTime: string;
  }
  interface AuditSnapshot {
    items: AuditItem[];
  }
  const { t, locale } = useI18n();
  async function loadAudits() {
    const response: any = await getAdminOperationAudits({
      currentPage: 1,
      pageSize: 100,
      action: 'all',
      actionScope: 'infra',
      outcome: 'all',
      keyword: '',
    });
    if (response?.status !== 200) throw new Error(response?.msg || t('serverManagement.eventsPage.loadFailed'));
    const items = Array.isArray(response.data?.items) ? response.data.items : [];
    return { data: { items } as AuditSnapshot };
  }
  const { data, initialLoading, refreshing, error, refresh } = useInfraSnapshot(loadAudits, 30_000);
  const outcome = ref('all');
  const outcomeOptions = computed(() => [
    { value: 'all', label: t('serverManagement.eventsPage.filters.all') },
    { value: 'succeeded', label: t('serverManagement.eventsPage.filters.succeeded') },
    { value: 'failed', label: t('serverManagement.eventsPage.filters.failed') },
    { value: 'intent', label: t('serverManagement.eventsPage.filters.intent') },
  ]);
  const filteredItems = computed(() =>
    (data.value?.items || []).filter((item) => outcome.value === 'all' || item.outcome === outcome.value),
  );
  function actionLabel(action: string) {
    return action === 'infra.nginx_reload'
      ? t('serverManagement.reloadNginx')
      : action === 'infra.service_restart'
        ? t('serverManagement.restartService')
        : action;
  }
  function outcomeLabel(value: string) {
    return t(
      `serverManagement.eventsPage.outcomes.${['succeeded', 'failed', 'denied', 'intent'].includes(value) ? value : 'unknown'}`,
    );
  }
  function outcomeTone(value: string): 'success' | 'danger' | 'pending' | 'neutral' {
    return value === 'succeeded'
      ? 'success'
      : value === 'failed'
        ? 'danger'
        : value === 'intent'
          ? 'pending'
          : 'neutral';
  }
  function targetLabel(item: AuditItem) {
    return [item.targetType, item.targetId].filter(Boolean).join(' / ') || '—';
  }
  function formatTime(value: string) {
    const date = new Date(String(value).replace(' ', 'T'));
    return Number.isFinite(date.getTime()) ? date.toLocaleString(locale.value, { hour12: false }) : value;
  }
</script>

<style scoped lang="less">
  .infra-module-page {
    height: 100%;
    overflow-y: auto;
    background: var(--background-color);
    color: var(--text-color);
  }
  .infra-module-content {
    width: min(1320px, calc(100% - 48px));
    margin: 0 auto;
    padding: 28px 0 48px;
    display: grid;
    gap: 18px;
  }
  .infra-state-card {
    min-height: 150px;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 18px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--card-background);
  }
  .infra-state-card div {
    flex: 1;
  }
  .infra-state-card p {
    margin: 5px 0 0;
    color: var(--desc-color);
  }
  .infra-stale-warning {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border: 1px solid var(--warning-color, #ad6800);
    border-radius: 10px;
    color: var(--warning-color, #ad6800);
    background: var(--card-background);
  }
  .events-filter {
    width: 130px;
  }
  .events-timeline {
    display: grid;
    gap: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .events-timeline li {
    position: relative;
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr);
    gap: 10px;
    padding-bottom: 18px;
  }
  .events-timeline li:not(:last-child)::before {
    content: '';
    position: absolute;
    left: 5px;
    top: 13px;
    bottom: 0;
    width: 1px;
    background: var(--surface-divider-color);
  }
  .events-timeline__marker {
    z-index: 1;
    width: 11px;
    height: 11px;
    margin-top: 4px;
    border: 2px solid var(--card-background);
    border-radius: 50%;
    background: var(--desc-color);
  }
  .events-timeline__marker.is-succeeded {
    background: var(--success-color, #27965b);
  }
  .events-timeline__marker.is-failed {
    background: var(--error-color, #d14343);
  }
  .events-timeline__marker.is-intent {
    background: var(--warning-color, #ad6800);
  }
  .events-timeline__content {
    min-width: 0;
  }
  .events-timeline__content > div {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .events-timeline p {
    margin: 6px 0;
    color: var(--text-color);
    font-size: 13px;
  }
  .events-timeline small {
    color: var(--desc-color);
    font-size: 12px;
  }
  .events-empty {
    min-height: 110px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--desc-color);
  }
  @media (max-width: 760px) {
    .infra-module-content {
      width: calc(100% - 24px);
      padding: 18px 0 32px;
      gap: 14px;
    }
  }
</style>
