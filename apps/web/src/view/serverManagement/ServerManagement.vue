<template>
  <main class="server-management-page">
    <div class="server-management-shell">
      <header class="server-management-header">
        <div class="server-management-header__main">
          <BButton
            class="server-management-back"
            :aria-label="t('serverManagement.back')"
            @click="router.push('/personCenter')"
          >
            <SvgIcon :src="icon.arrow_left" size="19" aria-hidden="true" />
          </BButton>
          <span class="server-management-header__icon">
            <SvgIcon :src="icon.infrastructure.server" size="24" aria-hidden="true" />
          </span>
          <div>
            <div class="server-management-title-row">
              <h1>{{ t('serverManagement.title') }}</h1>
              <BChip :tone="agentStatus === 'online' ? 'success' : agentStatus === 'loading' ? 'pending' : 'danger'">
                <span class="server-management-status-dot" aria-hidden="true"></span>
                {{ agentStatusLabel }}
              </BChip>
            </div>
            <p v-if="dashboard" class="server-management-hostline">
              {{ host?.hostname || '—' }} · {{ host?.platform || '—' }} {{ host?.release || '' }} ·
              {{ t('serverManagement.agentVersion', { version: dashboard.agentVersion }) }}
            </p>
            <p v-else class="server-management-hostline">{{ t('serverManagement.subtitle') }}</p>
          </div>
        </div>
        <div class="server-management-refresh-controls">
          <div class="server-management-refresh-state">
            <strong>{{ t('serverManagement.autoRefresh') }}</strong>
            <span :class="{ 'is-error': Boolean(refreshError), 'is-paused': isAutoRefreshPaused }">
              <i aria-hidden="true"></i>{{ refreshStatusText }}
            </span>
            <small v-if="lastLoadedAt">{{
              t('serverManagement.lastUpdatedAt', { time: formatTime(lastLoadedAt) })
            }}</small>
          </div>
          <BSelect
            class="server-management-refresh-select"
            :value="refreshIntervalMs"
            :options="refreshIntervalOptions"
            :aria-label="t('serverManagement.refreshIntervalLabel')"
            @change="setRefreshInterval"
          />
          <BButton
            class="server-management-refresh"
            :aria-label="t('common.refresh')"
            :loading="refreshing"
            :disabled="initialLoading"
            @click="refresh"
          >
            <SvgIcon v-if="!refreshing" :src="icon.infrastructure.refresh" size="16" aria-hidden="true" />
            <span class="server-management-refresh__label">{{ t('common.refresh') }}</span>
          </BButton>
        </div>
      </header>

      <template v-if="initialLoading">
        <BLoading inline :loading="true" :title="t('serverManagement.loading')" />
        <section class="server-management-metrics" aria-hidden="true">
          <BCard v-for="index in 4" :key="index"><div class="server-management-skeleton"></div></BCard>
        </section>
        <BCard aria-hidden="true"
          ><div class="server-management-skeleton server-management-skeleton--large"></div
        ></BCard>
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

        <BCard :title="t('serverManagement.runtimeTitle')" class="server-management-runtime">
          <div class="server-management-runtime__grid">
            <div v-for="item in runtimeFacts" :key="item.key">
              <span class="server-management-runtime__icon">
                <SvgIcon :src="item.icon" size="17" aria-hidden="true" />
              </span>
              <span>{{ item.label }}</span>
              <strong :title="item.value">{{ item.value }}</strong>
            </div>
          </div>
        </BCard>

        <BCard :title="t('serverManagement.historyTitle')" class="server-management-history">
          <template #extra>
            <span class="server-management-sampled-at">
              {{ t('serverManagement.sampledAt', { time: formatTime(dashboard?.sampledAt) }) }}
            </span>
          </template>
          <ServerMetricChart :points="dashboard?.history || []" />
        </BCard>
      </template>
    </div>
  </main>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import router from '@/router';
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
  const {
    dashboard,
    agentStatus,
    agentCode,
    initialLoading,
    refreshing,
    refreshError,
    lastLoadedAt,
    refreshIntervalMs,
    nextRefreshInSeconds,
    now,
    isOnline,
    isAutoRefreshPaused,
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
  const refreshStatusText = computed(() => {
    if (refreshing.value) return t('serverManagement.refreshing');
    if (isAutoRefreshPaused.value) return t('serverManagement.autoRefreshPaused');
    if (nextRefreshInSeconds.value !== null) {
      return refreshError.value
        ? t('serverManagement.refreshRetryCountdown', { seconds: nextRefreshInSeconds.value })
        : t('serverManagement.nextRefreshCountdown', { seconds: nextRefreshInSeconds.value });
    }
    return t('serverManagement.autoRefreshWaiting');
  });
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

  function formatPercent(value: unknown) {
    const number = validPercent(value);
    return number === null ? '—' : `${number.toFixed(number % 1 === 0 ? 0 : 1)}%`;
  }

  function formatBytes(value: unknown) {
    if (value === null || value === undefined || value === '') return '—';
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes < 0) return '—';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let amount = bytes;
    let index = 0;
    while (amount >= 1024 && index < units.length - 1) {
      amount /= 1024;
      index += 1;
    }
    return `${amount.toFixed(index === 0 || amount >= 100 ? 0 : 1)} ${units[index]}`;
  }

  function formatRate(value: unknown) {
    const formatted = formatBytes(value);
    return formatted === '—' ? formatted : `${formatted}/s`;
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
    return new Intl.DateTimeFormat(locale.value, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(
      date,
    );
  }
</script>

<style scoped lang="less">
  .server-management-page {
    height: 100%;
    overflow-y: auto;
    background: var(--background-color);
    color: var(--text-color);
  }
  .server-management-shell {
    width: min(1440px, calc(100% - 48px));
    margin: 0 auto;
    padding: 28px 0 48px;
    display: grid;
    gap: 18px;
  }
  .server-management-header {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
  }
  .server-management-header__main,
  .server-management-title-row,
  .server-management-refresh-controls,
  .server-metric-card__heading,
  .server-management-warning,
  .server-management-refresh-warning {
    display: flex;
    align-items: center;
  }
  .server-management-header__main {
    min-width: 0;
    gap: 12px;
  }
  .server-management-header__icon,
  .server-metric-card__icon {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--surface-border-color);
    color: var(--primary-color);
    background: var(--card-background);
  }
  .server-management-header__icon {
    width: 46px;
    height: 46px;
    border-radius: 14px;
  }
  .server-management-title-row {
    flex-wrap: wrap;
    gap: 10px;
  }
  .server-management-title-row h1,
  .server-management-unavailable h2 {
    margin: 0;
    color: var(--text-color);
  }
  .server-management-title-row h1 {
    font-size: 24px;
    line-height: 1.35;
  }
  .server-management-hostline {
    margin: 5px 0 0;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.45;
  }
  .server-management-status-dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    margin-right: 5px;
    border: 1px solid currentColor;
    border-radius: 50%;
    background: currentColor;
  }
  .server-management-back {
    display: none;
    width: 36px;
    padding: 0;
  }
  .server-management-refresh-controls {
    flex: 0 0 auto;
    justify-content: flex-end;
    gap: 10px;
  }
  .server-management-refresh-state {
    min-width: 150px;
    display: grid;
    justify-items: end;
    gap: 2px;
    line-height: 1.3;
  }
  .server-management-refresh-state strong {
    color: var(--text-color);
    font-size: 12px;
  }
  .server-management-refresh-state span {
    display: inline-flex;
    align-items: center;
    color: var(--success-color, #27965b);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .server-management-refresh-state span.is-error {
    color: var(--error-color, #d14343);
  }
  .server-management-refresh-state span.is-paused {
    color: var(--desc-color);
  }
  .server-management-refresh-state span i {
    width: 7px;
    height: 7px;
    margin-right: 5px;
    border: 1px solid currentColor;
    border-radius: 50%;
    background: currentColor;
  }
  .server-management-refresh-state small {
    color: var(--desc-color);
    font-size: 10px;
    font-variant-numeric: tabular-nums;
  }
  .server-management-refresh-select {
    width: 142px;
  }
  .server-management-refresh-select :deep(.select-trigger) {
    min-height: 36px;
  }
  .server-management-refresh {
    flex: 0 0 auto;
  }
  .server-management-metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
  }
  .server-metric-card {
    display: grid;
    gap: 9px;
  }
  .server-metric-card__heading {
    gap: 8px;
    color: var(--desc-color);
    font-size: 13px;
    font-weight: 600;
  }
  .server-metric-card__icon {
    width: 30px;
    height: 30px;
    border-radius: 9px;
  }
  .server-metric-card > strong {
    color: var(--text-color);
    font-size: 26px;
    font-variant-numeric: tabular-nums;
  }
  .server-metric-card > span {
    min-height: 18px;
    overflow: hidden;
    color: var(--desc-color);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .server-metric-card__track {
    height: 5px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--surface-divider-color, var(--card-border-color));
  }
  .server-metric-card__track i {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--primary-color);
  }
  .server-management-skeleton {
    height: 96px;
    border-radius: 10px;
    background: linear-gradient(
      90deg,
      var(--surface-divider-color) 25%,
      var(--card-background) 50%,
      var(--surface-divider-color) 75%
    );
    background-size: 200% 100%;
    animation: server-management-skeleton 1.3s ease-in-out infinite;
  }
  .server-management-skeleton--large {
    height: 230px;
  }
  @keyframes server-management-skeleton {
    to {
      background-position: -200% 0;
    }
  }
  .server-management-unavailable {
    min-height: 220px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 16px;
    border-color: var(--error-color, #d14343);
  }
  .server-management-unavailable > svg {
    color: var(--error-color, #d14343);
  }
  .server-management-unavailable h2 {
    font-size: 18px;
  }
  .server-management-unavailable p {
    margin: 7px 0 0;
    color: var(--desc-color);
    line-height: 1.65;
  }
  .server-management-unavailable code {
    display: block;
    margin-top: 8px;
    color: var(--desc-color);
    font-size: 11px;
  }
  .server-management-warning {
    gap: 10px;
    padding: 11px 14px;
    border: 1px solid var(--warning-color, #ad6800);
    border-radius: 10px;
    color: var(--warning-color, #ad6800);
    background: var(--card-background);
  }
  .server-management-warning div {
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  .server-management-warning span {
    overflow: hidden;
    color: var(--desc-color);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .server-management-refresh-warning {
    gap: 10px;
    padding: 11px 14px;
    border: 1px solid var(--error-color, #d14343);
    border-radius: 10px;
    color: var(--error-color, #d14343);
    background: var(--card-background);
  }
  .server-management-refresh-warning div {
    min-width: 0;
    flex: 1;
    display: grid;
    gap: 2px;
  }
  .server-management-refresh-warning span {
    color: var(--desc-color);
    font-size: 11px;
  }
  .server-management-runtime__grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0;
  }
  .server-management-runtime__grid > div {
    min-width: 0;
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr);
    align-items: center;
    gap: 2px 8px;
    padding: 2px 18px;
    border-left: 1px solid var(--surface-divider-color, var(--card-border-color));
  }
  .server-management-runtime__grid > div:first-child {
    padding-left: 0;
    border-left: 0;
  }
  .server-management-runtime__grid > div:last-child {
    padding-right: 0;
  }
  .server-management-runtime__icon {
    grid-row: 1 / 3;
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--surface-border-color);
    border-radius: 9px;
    color: var(--primary-color);
    background: var(--card-background);
  }
  .server-management-runtime__grid span:not(.server-management-runtime__icon) {
    color: var(--desc-color);
    font-size: 11px;
  }
  .server-management-runtime__grid strong {
    min-width: 0;
    overflow: hidden;
    color: var(--text-color);
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .server-management-sampled-at {
    color: var(--desc-color);
    font-size: 12px;
    font-weight: 400;
  }
  html.light-note-mobile-rendering .server-management-header__icon,
  html.light-note-mobile-rendering .server-metric-card__icon,
  html.light-note-mobile-rendering .server-management-runtime__icon,
  html.light-note-mobile-rendering .server-management-unavailable,
  html.light-note-mobile-rendering .server-management-warning,
  html.light-note-mobile-rendering .server-management-refresh-warning {
    box-shadow: none;
  }
  @media (max-width: 1023px) {
    .server-management-metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .server-management-runtime__grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px 0;
    }
    .server-management-runtime__grid > div:nth-child(odd) {
      padding-left: 0;
      border-left: 0;
    }
  }
  @media (max-width: 767px) {
    .server-management-shell {
      width: 100%;
      padding: 14px 12px 96px;
      box-sizing: border-box;
      gap: 13px;
    }
    .server-management-header {
      flex-wrap: wrap;
      align-items: flex-start;
      gap: 8px;
    }
    .server-management-header__main {
      gap: 8px;
      align-items: flex-start;
    }
    .server-management-back {
      display: flex;
      flex: 0 0 auto;
    }
    .server-management-header__icon {
      display: none;
    }
    .server-management-title-row h1 {
      font-size: 20px;
    }
    .server-management-refresh-controls {
      width: 100%;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 132px 36px;
      gap: 8px;
      padding-top: 3px;
    }
    .server-management-refresh-state {
      min-width: 0;
      justify-items: start;
    }
    .server-management-refresh-state small {
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .server-management-refresh-select {
      width: 132px;
    }
    .server-management-refresh {
      width: 36px;
      padding: 0;
      flex: 0 0 auto;
    }
    .server-management-refresh__label {
      display: none;
    }
    .server-management-metrics {
      grid-template-columns: 1fr;
      gap: 10px;
    }
    .server-metric-card {
      grid-template-columns: auto 1fr auto;
      align-items: center;
    }
    .server-metric-card > strong {
      justify-self: end;
      font-size: 22px;
    }
    .server-metric-card > span {
      grid-column: 2 / 4;
    }
    .server-metric-card__track {
      grid-column: 1 / 4;
    }
    .server-management-unavailable {
      grid-template-columns: auto 1fr;
      align-items: start;
    }
    .server-management-unavailable > :deep(.b_btn) {
      grid-column: 1 / 3;
      width: 100%;
    }
    .server-management-sampled-at {
      font-size: 10px;
      white-space: nowrap;
    }
    .server-management-refresh-warning {
      align-items: flex-start;
      flex-wrap: wrap;
    }
    .server-management-refresh-warning > :deep(.b_btn) {
      width: 100%;
    }
    .server-management-runtime__grid {
      grid-template-columns: 1fr;
      gap: 12px;
    }
    .server-management-runtime__grid > div,
    .server-management-runtime__grid > div:nth-child(odd) {
      padding: 0;
      border-left: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .server-management-skeleton {
      animation: none;
    }
  }
</style>
