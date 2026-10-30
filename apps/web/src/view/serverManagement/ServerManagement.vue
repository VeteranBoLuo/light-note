<template>
  <InfraPage>
    <template #header>
      <InfraModuleHeader
        :title="t('serverManagement.modules.overview')"
        :loading="refreshing"
        :refresh-label="t('common.refresh')"
        :cadence="t('serverManagement.sampledAt', { time: formatTime(dashboard?.sampledAt) })"
        @refresh="refresh"
      >
        <template #status
          ><BChip :tone="agentStatus === 'online' ? 'success' : agentStatus === 'loading' ? 'pending' : 'danger'"
            ><span class="server-agent-dot" aria-hidden="true" />{{ agentStatusLabel }}</BChip
          ></template
        >
        <template #detail
          ><div v-if="dashboard" class="server-hostline"
            ><span>{{ host?.hostname }}</span
            ><BButton type="text" size="small" @click="detailsOpen = !detailsOpen"
              >{{ t('serverManagement.workspace.hostDetails') }} {{ detailsOpen ? '⌃' : '›' }}</BButton
            ></div
          ></template
        >
        <template #controls
          ><BSelect
            v-if="!bookmark.isMobile"
            class="server-refresh-select"
            :value="refreshIntervalMs"
            :options="refreshIntervalOptions"
            :aria-label="t('serverManagement.refreshIntervalLabel')"
            @change="setRefreshInterval" /><BActionMenu
            v-if="bookmark.isMobile"
            :items="refreshIntervalOptions.map((item) => ({ key: String(item.value), label: item.label }))"
            placement="bottom-right"
            @select="setRefreshInterval(Number($event))"
            ><BButton :aria-label="t('serverManagement.refreshIntervalLabel')"
              ><SvgIcon :src="icon.common.more" size="16" /></BButton></BActionMenu
        ></template>
      </InfraModuleHeader>
    </template>
    <div v-if="bookmark.isMobile" class="server-mobile-meta"
      ><span :title="host?.hostname">{{ host?.hostname || '—' }}</span
      ><BChip :tone="agentStatus === 'online' ? 'success' : 'neutral'">{{ agentStatusLabel }}</BChip
      ><BButton type="text" size="small" @click="detailsOpen = !detailsOpen"
        >{{ t('serverManagement.workspace.hostDetails') }} ›</BButton
      ></div
    >
    <BCard v-if="detailsOpen && dashboard" :title="t('serverManagement.workspace.hostDetails')"
      ><dl class="server-host-details"
        ><div
          ><dt>{{ t('serverManagement.cpuModel') }}</dt
          ><dd>{{ host?.cpuModel || '—' }}</dd></div
        ><div
          ><dt>{{ t('serverManagement.architecture') }}</dt
          ><dd>{{ host?.platform }} · {{ host?.arch }} · {{ host?.release }}</dd></div
        ><div
          ><dt>Agent</dt><dd>{{ dashboard.agentVersion }}</dd></div
        ></dl
      ></BCard
    >
    <template v-if="initialLoading">
      <BLoading inline :loading="true" :title="t('serverManagement.loading')" />
      <section class="server-management-metrics" aria-hidden="true">
        <BCard v-for="index in 4" :key="index"><div class="server-management-skeleton"></div></BCard>
      </section>
      <BCard aria-hidden="true"><div class="server-management-skeleton server-management-skeleton--large"></div></BCard>
    </template>

    <BCard v-else-if="!isOnline" class="server-management-unavailable" variant="panel">
      <SvgIcon :src="icon.message.warning" size="30" aria-hidden="true" />
      <div>
        <h2>
          {{
            agentStatus === 'incompatible'
              ? t('serverManagement.incompatibleTitle')
              : t('serverManagement.offlineTitle')
          }}
        </h2>
        <p>
          {{
            agentStatus === 'incompatible'
              ? t('serverManagement.incompatibleDescription')
              : t('serverManagement.offlineDescription')
          }}
        </p>
        <code v-if="agentCode || refreshError">{{ agentCode || refreshError }}</code>
      </div>
      <BButton type="primary" @click="refresh">{{ t('serverManagement.retry') }}</BButton>
    </BCard>

    <template v-else>
      <section
        v-if="dashboard && refreshError"
        class="server-management-refresh-warning"
        role="status"
        :aria-label="t('serverManagement.refreshFailedTitle')"
      >
        <SvgIcon :src="icon.message.warning" size="18" aria-hidden="true" />
        <div>
          <strong>{{ t('serverManagement.refreshFailedTitle') }}</strong>
          <span>{{ t('serverManagement.refreshFailedDescription') }}</span>
        </div>
        <BButton size="small" :loading="refreshing" @click="refresh">{{ t('common.refresh') }}</BButton>
      </section>

      <section
        v-if="dashboard?.collectionErrors?.length"
        class="server-management-warning"
        role="status"
        :aria-label="t('serverManagement.partialCollectionTitle')"
      >
        <SvgIcon :src="icon.message.warning" size="18" aria-hidden="true" />
        <div>
          <strong>{{ t('serverManagement.partialCollectionTitle') }}</strong>
          <span>{{ collectionErrorText }}</span>
        </div>
      </section>

      <InfraAttention />
      <section class="server-management-metrics" :aria-label="t('serverManagement.metricsTitle')">
        <BCard v-for="metric in metricCards" :key="metric.key" class="server-metric-card">
          <div class="server-metric-card__heading">
            <span class="server-metric-card__icon"><SvgIcon :src="metric.icon" size="19" /></span>
            <span>{{ metric.label }}</span>
          </div>
          <strong>{{ metric.value }}</strong>
          <span>{{ metric.detail }}</span>
          <div v-if="metric.percent !== null" class="server-metric-card__track" aria-hidden="true">
            <i :style="{ width: `${metric.percent}%` }"></i>
          </div>
        </BCard>
      </section>

      <BCard :title="t('serverManagement.workspace.trend')" class="server-management-history">
        <ServerMetricChart :points="dashboard?.history || []" />
      </BCard>
      <BCard class="server-runtime-strip"
        ><div class="server-runtime-strip__items"
          ><span v-for="item in runtimeFacts.filter((item) => item.key !== 'cpu-model')" :key="item.key"
            >{{ item.label }} <strong>{{ item.value }}</strong></span
          ><BButton type="text" @click="detailsOpen = !detailsOpen"
            >{{ t('serverManagement.workspace.hostDetails') }} {{ detailsOpen ? '⌃' : '›' }}</BButton
          ></div
        ></BCard
      >
    </template>
  </InfraPage>
</template>
<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { formatBytes, formatRate, formatPercent } from './serverManagementFormat';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import { bookmarkStore } from '@/store';
  import BActionMenu from '@/components/base/BasicComponents/BActionMenu.vue';
  import InfraPage from './InfraPage.vue';
  import InfraModuleHeader from './InfraModuleHeader.vue';
  import InfraAttention from './InfraAttention.vue';
  import icon from '@/config/icon';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import ServerMetricChart from './ServerMetricChart.vue';
  import { useServerManagement } from './useServerManagement';

  const { t, locale } = useI18n();
  const router = useRouter();
  const bookmark = bookmarkStore();
  const detailsOpen = ref(false);
  const {
    dashboard,
    agentStatus,
    agentCode,
    initialLoading,
    refreshing,
    refreshError,
    refreshIntervalMs,
    now,
    isOnline,
    refresh,
    setRefreshInterval,
  } = useServerManagement();
  const metrics = computed(() => dashboard.value?.metrics);
  const host = computed(() => dashboard.value?.host);
  const refreshIntervalOptions = computed(() => [
    { label: t('serverManagement.refreshIntervals.default'), value: 3_000 },
    { label: t('serverManagement.refreshIntervals.tenSeconds'), value: 10_000 },
    { label: t('serverManagement.refreshIntervals.thirtySeconds'), value: 30_000 },
    { label: t('serverManagement.refreshIntervals.oneMinute'), value: 60_000 },
    { label: t('serverManagement.refreshIntervals.fiveMinutes'), value: 300_000 },
    { label: t('serverManagement.refreshIntervals.paused'), value: 0 },
  ]);
  const agentStatusLabel = computed(() => t(`serverManagement.agentStatus.${agentStatus.value}`));
  const collectionErrorText = computed(() =>
    (dashboard.value?.collectionErrors || []).map((item) => `${item.source}: ${item.code}`).join(' · '),
  );
  const metricCards = computed(() => [
    {
      key: 'cpu',
      label: t('serverManagement.cpu'),
      icon: icon.infrastructure.cpu,
      value: formatPercent(metrics.value?.cpu.percent),
      detail: t('serverManagement.cpuDetail', {
        cores: metrics.value?.cpu.cores ?? host.value?.cpuCores ?? '—',
        load: metrics.value?.cpu.loadAverage?.[0] ?? '—',
      }),
      percent: validPercent(metrics.value?.cpu.percent),
    },
    {
      key: 'memory',
      label: t('serverManagement.memory'),
      icon: icon.infrastructure.memory,
      value: formatPercent(metrics.value?.memory.percent),
      detail: `${formatBytes(metrics.value?.memory.usedBytes)} / ${formatBytes(metrics.value?.memory.totalBytes)}`,
      percent: validPercent(metrics.value?.memory.percent),
    },
    {
      key: 'disk',
      label: t('serverManagement.disk'),
      icon: icon.infrastructure.disk,
      value: formatPercent(metrics.value?.disk?.percent),
      detail: `${formatBytes(metrics.value?.disk?.usedBytes)} / ${formatBytes(metrics.value?.disk?.totalBytes)} · ${metrics.value?.disk?.mountPoint || '/'}`,
      percent: validPercent(metrics.value?.disk?.percent),
    },
    {
      key: 'network',
      label: t('serverManagement.network'),
      icon: icon.infrastructure.network,
      value: `↓ ${formatRate(metrics.value?.network?.rxBytesPerSecond)}`,
      detail: `↑ ${formatRate(metrics.value?.network?.txBytesPerSecond)}`,
      percent: null,
    },
  ]);
  const runtimeFacts = computed(() => {
    const startedAt = new Date(String(dashboard.value?.startedAt || '')).getTime();
    const agentUptimeSeconds = Number.isFinite(startedAt)
      ? Math.max(0, Math.floor((now.value - startedAt) / 1_000))
      : null;
    return [
      {
        key: 'host-uptime',
        label: t('serverManagement.hostUptime'),
        value: formatDuration(metrics.value?.uptimeSeconds),
        icon: icon.infrastructure.server,
      },
      {
        key: 'agent-uptime',
        label: t('serverManagement.agentUptime'),
        value: formatDuration(agentUptimeSeconds),
        icon: icon.infrastructure.service,
      },
      {
        key: 'cpu-model',
        label: t('serverManagement.cpuModel'),
        value: host.value?.cpuModel || t('serverManagement.unknown'),
        icon: icon.infrastructure.cpu,
      },
      {
        key: 'architecture',
        label: t('serverManagement.architecture'),
        value: [host.value?.platform, host.value?.arch].filter(Boolean).join(' · ') || t('serverManagement.unknown'),
        icon: icon.infrastructure.server,
      },
    ];
  });

  function validPercent(value: unknown) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : null;
  }

  function formatDuration(value: unknown) {
    if (value === null || value === undefined || value === '') return t('serverManagement.unknown');
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds < 0) return t('serverManagement.unknown');
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) return t('serverManagement.durationDaysHours', { days, hours });
    if (hours > 0) return t('serverManagement.durationHoursMinutes', { hours, minutes });
    return t('serverManagement.durationMinutes', { minutes });
  }

  function formatTime(value: unknown) {
    const date = typeof value === 'number' ? new Date(value) : new Date(String(value || ''));
    if (!Number.isFinite(date.getTime())) return '—';
    return new Intl.DateTimeFormat(locale.value, {
      timeZone: 'Asia/Shanghai',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(date);
  }
</script>

<style scoped lang="less">
  .server-mobile-meta {
    display: flex;
    align-items: center;
    gap: var(--ui-space-10, 10px);
    font-size: var(--ui-font-12, 12px);
    color: var(--desc-color);
  }
  .server-mobile-meta > span:first-child {
    max-width: 40%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .server-agent-dot {
    display: inline-block;
    width: var(--ui-space-6, 6px);
    height: var(--ui-space-6, 6px);
    border-radius: 50%;
    background: currentColor;
    margin-right: var(--ui-space-4, 4px);
  }
  .server-hostline {
    display: flex;
    align-items: center;
    gap: var(--ui-space-12, 12px);
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    margin-top: var(--ui-space-4, 4px);
  }
  .server-refresh-select {
    width: var(--ui-layout-160, 160px);
  }
  .server-management-metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--ui-space-14, 14px);
  }
  .server-metric-card {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-10, 10px);
  }
  .server-metric-card__heading {
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    color: var(--desc-color);
  }
  .server-metric-card__icon {
    color: var(--primary-color);
    display: flex;
  }
  .server-metric-card > strong {
    font-size: var(--ui-font-28, 28px);
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
  }
  .server-metric-card > span {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .server-metric-card__track {
    height: var(--ui-space-5, 5px);
    background: var(--surface-divider-color);
    border-radius: 99px;
    margin-top: auto;
    overflow: hidden;
  }
  .server-metric-card__track i {
    display: block;
    height: 100%;
    background: var(--primary-color);
    border-radius: inherit;
  }
  .server-runtime-strip__items {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-16, 16px);
    flex-wrap: wrap;
    font-size: var(--ui-font-12, 12px);
    color: var(--desc-color);
  }
  .server-runtime-strip__items strong {
    color: var(--text-color);
  }
  .server-host-details {
    display: flex;
    gap: var(--ui-space-24, 24px);
    flex-wrap: wrap;
    margin: 0;
  }
  dt {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  dd {
    margin: var(--ui-space-6, 6px) 0 0;
  }
  .server-management-unavailable,
  .server-management-refresh-warning,
  .server-management-warning {
    display: flex;
    align-items: center;
    gap: var(--ui-space-12, 12px);
    padding: var(--ui-space-16, 16px);
    border: 1px solid var(--warning-color);
    border-radius: 12px;
  }
  .server-management-refresh-warning div,
  .server-management-warning div {
    flex: 1;
    display: grid;
    gap: var(--ui-space-4, 4px);
  }
  .server-management-warning span,
  .server-management-refresh-warning span {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .server-management-skeleton {
    min-height: var(--ui-layout-120, 120px);
    background: var(--hover-background);
    border-radius: 10px;
  }
  .server-management-skeleton--large {
    min-height: var(--ui-layout-260, 260px);
  }
  @media (max-width: 1199px) {
    .server-management-metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 767px) {
    .server-refresh-select {
      width: var(--ui-layout-100, 100px);
    }
    .server-metric-card > strong {
      font-size: var(--ui-font-24, 24px);
    }
    .server-runtime-strip__items {
      gap: var(--ui-space-10, 10px);
    }
  }
</style>
