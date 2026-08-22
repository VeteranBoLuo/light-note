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
        <section class="events-summary">
          <BCard v-for="item in summaryCards" :key="item.key">
            <span>{{ item.label }}</span
            ><strong :class="`is-${item.key}`">{{ item.value }}</strong>
          </BCard>
        </section>
        <BCard :title="t('serverManagement.eventsPage.auditTitle')">
          <template #extra>
            <div class="events-toolbar">
              <BInput
                v-model:value="keyword"
                clearable
                :placeholder="t('serverManagement.eventsPage.searchPlaceholder')"
              >
                <template #prefix><SvgIcon :src="icon.navigation.search" size="15" /></template>
              </BInput>
              <BSelect
                class="events-filter"
                :value="outcome"
                :options="outcomeOptions"
                :aria-label="t('serverManagement.eventsPage.outcomeFilterLabel')"
                @change="outcome = String($event)"
              />
              <BButton size="small" :disabled="!filteredItems.length" @click="exportItems">
                <SvgIcon :src="icon.infrastructure.export" size="14" />{{ t('serverManagement.eventsPage.export') }}
              </BButton>
            </div>
          </template>
          <p class="events-count">{{
            t('serverManagement.eventsPage.visibleCount', {
              visible: filteredItems.length,
              total: data?.items.length || 0,
            })
          }}</p>
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
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import InfraModuleHeader from './InfraModuleHeader.vue';
  import { useInfraSnapshot } from './useInfraSnapshot';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { copyTextToClipboard } from '@/utils/clipboard';
  import { buildExportFileName, deliverGeneratedFile } from '@/utils/fileDelivery';

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
  const keyword = ref('');
  const outcomeOptions = computed(() => [
    { value: 'all', label: t('serverManagement.eventsPage.filters.all') },
    { value: 'succeeded', label: t('serverManagement.eventsPage.filters.succeeded') },
    { value: 'failed', label: t('serverManagement.eventsPage.filters.failed') },
    { value: 'intent', label: t('serverManagement.eventsPage.filters.intent') },
  ]);
  const filteredItems = computed(() => {
    const normalizedKeyword = keyword.value.trim().toLocaleLowerCase(locale.value);
    return (data.value?.items || []).filter((item) => {
      const matchesOutcome = outcome.value === 'all' || item.outcome === outcome.value;
      const haystack =
        `${actionLabel(item.action)} ${item.action} ${targetLabel(item)} ${item.reason || ''}`.toLocaleLowerCase(
          locale.value,
        );
      return matchesOutcome && (!normalizedKeyword || haystack.includes(normalizedKeyword));
    });
  });
  const summaryCards = computed(() => {
    const items = data.value?.items || [];
    return [
      {
        key: 'succeeded',
        label: t('serverManagement.eventsPage.summary.succeeded'),
        value: items.filter((item) => item.outcome === 'succeeded').length,
      },
      {
        key: 'failed',
        label: t('serverManagement.eventsPage.summary.failed'),
        value: items.filter((item) => item.outcome === 'failed').length,
      },
      {
        key: 'intent',
        label: t('serverManagement.eventsPage.summary.intent'),
        value: items.filter((item) => item.outcome === 'intent').length,
      },
      { key: 'total', label: t('serverManagement.eventsPage.summary.total'), value: items.length },
    ];
  });
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
  function auditText() {
    return [
      [
        t('serverManagement.eventsPage.exportHeaders.time'),
        t('serverManagement.eventsPage.exportHeaders.outcome'),
        t('serverManagement.eventsPage.exportHeaders.action'),
        t('serverManagement.eventsPage.exportHeaders.target'),
        t('serverManagement.eventsPage.exportHeaders.reason'),
      ].join('\t'),
      ...filteredItems.value.map(
        (item) =>
          `${formatTime(item.createTime)}\t${outcomeLabel(item.outcome)}\t${actionLabel(item.action)}\t${targetLabel(item)}\t${item.reason || t('serverManagement.eventsPage.noReason')}`,
      ),
    ].join('\n');
  }
  async function exportItems() {
    try {
      const result = await deliverGeneratedFile({
        content: auditText(),
        fileName: buildExportFileName('lightnote-server-operation-audit', 'lightnote-server-operation-audit', 'tsv'),
        mimeType: 'text/tab-separated-values',
        preferShare: true,
      });
      if (result === 'unavailable') {
        const copied = await copyTextToClipboard(auditText());
        copied
          ? message.warning(t('serverManagement.eventsPage.exportUnavailable'))
          : message.error(t('serverManagement.eventsPage.exportFailed'));
      } else if (result !== 'cancelled') {
        message.success(t('serverManagement.eventsPage.exported'));
      }
    } catch {
      message.error(t('serverManagement.eventsPage.exportFailed'));
    }
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
  .events-summary {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }
  .events-summary :deep(.b-card) {
    display: grid;
    gap: 8px;
  }
  .events-summary span,
  .events-count {
    color: var(--desc-color);
    font-size: 12px;
  }
  .events-summary strong {
    font-size: 24px;
  }
  .events-summary strong.is-failed {
    color: var(--error-color, #d14343);
  }
  .events-summary strong.is-succeeded {
    color: var(--success-color, #27965b);
  }
  .events-toolbar {
    display: grid;
    grid-template-columns: minmax(180px, 280px) 130px auto;
    gap: 8px;
  }
  .events-count {
    margin: 0 0 12px;
    text-align: right;
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
    .events-summary {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .events-toolbar {
      grid-template-columns: 1fr 1fr;
    }
    .events-toolbar > :first-child {
      grid-column: 1 / 3;
    }
    .events-filter {
      width: 100%;
    }
    .events-count {
      text-align: left;
    }
  }
</style>
