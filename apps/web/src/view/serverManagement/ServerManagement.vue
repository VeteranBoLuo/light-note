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

        <BCard :title="t('serverManagement.historyTitle')" class="server-management-history">
          <template #extra>
            <span class="server-management-sampled-at">
              {{ t('serverManagement.sampledAt', { time: formatTime(dashboard?.sampledAt) }) }}
            </span>
          </template>
          <ServerMetricChart :points="dashboard?.history || []" />
        </BCard>

        <BCard :title="t('serverManagement.servicesTitle')" class="server-management-services">
          <template #extra>
            <span class="server-management-service-summary">{{ serviceSummary }}</span>
          </template>

          <div class="server-management-service-table">
            <BTable :data="services" :columns="serviceColumns" row-key="id">
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'name'">
                  <span class="server-service-name">
                    <SvgIcon :src="icon.infrastructure.service" size="17" aria-hidden="true" />
                    <strong>{{ serviceName(record.id) }}</strong>
                  </span>
                </template>
                <template v-else-if="column.key === 'state'">
                  <BChip :tone="serviceTone(record.state)">
                    <span class="server-service-state-dot" aria-hidden="true"></span
                    >{{ serviceStateLabel(record.state) }}
                  </BChip>
                </template>
                <template v-else-if="column.key === 'uptime'">{{ formatDuration(record.uptimeSeconds) }}</template>
                <template v-else-if="column.key === 'actions'">
                  <div class="server-service-actions">
                    <BButton size="small" @click="openLogs(record)">
                      <SvgIcon :src="icon.infrastructure.logs" size="14" aria-hidden="true" />
                      {{ t('serverManagement.viewLogs') }}
                    </BButton>
                    <BButton
                      v-for="action in record.actions"
                      :key="action"
                      size="small"
                      type="danger"
                      :disabled="actionLoading"
                      @click="openAction(record, action)"
                    >
                      <SvgIcon :src="icon.infrastructure.restart" size="14" aria-hidden="true" />
                      {{ actionLabel(action) }}
                    </BButton>
                  </div>
                </template>
              </template>
            </BTable>
          </div>

          <MobileListSurface class="server-management-service-mobile" :aria-label="t('serverManagement.servicesTitle')">
            <MobileListRow v-for="service in services" :key="service.id" complex>
              <template #leading>
                <span class="server-service-mobile-icon"><SvgIcon :src="icon.infrastructure.service" size="19" /></span>
              </template>
              <template #title>{{ serviceName(service.id) }}</template>
              <template #subtitle>{{ service.detail || '—' }} · {{ formatDuration(service.uptimeSeconds) }}</template>
              <template #meta>
                <BChip :tone="serviceTone(service.state)">
                  <span class="server-service-state-dot" aria-hidden="true"></span
                  >{{ serviceStateLabel(service.state) }}
                </BChip>
              </template>
              <template #trailing>
                <div class="server-service-mobile-actions">
                  <BButton
                    size="small"
                    :aria-label="t('serverManagement.viewServiceLogs', { service: serviceName(service.id) })"
                    @click="openLogs(service)"
                  >
                    <SvgIcon :src="icon.infrastructure.logs" size="15" aria-hidden="true" />
                  </BButton>
                  <BButton
                    v-for="action in service.actions"
                    :key="action"
                    size="small"
                    type="danger"
                    :disabled="actionLoading"
                    :aria-label="actionAriaLabel(service, action)"
                    @click="openAction(service, action)"
                  >
                    <SvgIcon :src="icon.infrastructure.restart" size="15" aria-hidden="true" />
                  </BButton>
                </div>
              </template>
            </MobileListRow>
          </MobileListSurface>
        </BCard>
      </template>
    </div>

    <BModal
      v-model:visible="logsVisible"
      :title="
        t('serverManagement.logsTitle', { service: selectedLogService ? serviceName(selectedLogService.id) : '' })
      "
      width="min(900px, 94vw)"
      :show-footer="false"
      fullscreen-mobile
    >
      <div class="server-logs">
        <BLoading v-if="logsLoading" inline :loading="true" :title="t('serverManagement.logsLoading')" />
        <div v-else-if="logsError" class="server-logs__state server-logs__state--error">
          <SvgIcon :src="icon.message.error" size="22" aria-hidden="true" />
          <span>{{ logsError }}</span>
          <BButton size="small" @click="reloadLogs">{{ t('serverManagement.retry') }}</BButton>
        </div>
        <div v-else-if="!logLines.length" class="server-logs__state">
          <SvgIcon :src="icon.infrastructure.logs" size="22" aria-hidden="true" />
          <span>{{ t('serverManagement.logsEmpty') }}</span>
        </div>
        <template v-else>
          <p v-if="logsTruncated" class="server-logs__notice">{{ t('serverManagement.logsTruncated') }}</p>
          <pre><code>{{ logLines.join('\n') }}</code></pre>
        </template>
      </div>
    </BModal>

    <AdminRiskActionModal
      v-model:visible="actionVisible"
      :title="selectedAction ? actionDialogTitle(selectedAction) : t('serverManagement.actionTitle')"
      :impact="selectedAction ? actionImpact(selectedAction.action) : ''"
      :confirm-label="selectedAction ? actionLabel(selectedAction.action) : ''"
      :loading="actionLoading"
      @confirm="confirmAction"
    />
  </main>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import router from '@/router';
  import { HOST_AGENT_ACTIONS } from '@lightnote/shared/host-agent-protocol';
  import type {
    HostAgentAction,
    HostAgentServiceId,
    HostAgentServiceSnapshot,
    HostAgentServiceState,
  } from '@lightnote/shared/host-agent-protocol';
  import { getInfraLogs } from '@/api/infraApi';
  import icon from '@/config/icon';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import MobileListSurface from '@/components/mobile/MobileListSurface.vue';
  import MobileListRow from '@/components/mobile/MobileListRow.vue';
  import AdminRiskActionModal from '@/components/admin/AdminRiskActionModal.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import ServerMetricChart from './ServerMetricChart.vue';
  import { useServerManagement } from './useServerManagement';

  type ChipTone = 'neutral' | 'success' | 'danger' | 'pending';
  type SelectedAction = { action: HostAgentAction; targetId: HostAgentServiceId; serviceName: string };

  const { t, locale } = useI18n();
  const { dashboard, agentStatus, agentCode, initialLoading, refreshing, refreshError, isOnline, refresh, runAction } =
    useServerManagement();
  const metrics = computed(() => dashboard.value?.metrics);
  const host = computed(() => dashboard.value?.host);
  const services = computed(() => dashboard.value?.services || []);
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
  const serviceColumns = computed(() => [
    { key: 'name', title: t('serverManagement.columns.service'), width: '1.5fr', ellipsis: false },
    { key: 'state', title: t('serverManagement.columns.state'), width: '120px', ellipsis: false },
    { key: 'detail', title: t('serverManagement.columns.detail'), width: '1fr' },
    { key: 'uptime', title: t('serverManagement.columns.uptime'), width: '130px', ellipsis: false },
    { key: 'actions', title: t('serverManagement.columns.actions'), width: '280px', ellipsis: false },
  ]);
  const serviceSummary = computed(() => {
    const running = services.value.filter((item) => item.state === 'running').length;
    return t('serverManagement.serviceSummary', { running, total: services.value.length });
  });

  const logsVisible = ref(false);
  const logsLoading = ref(false);
  const logsError = ref('');
  const logLines = ref<string[]>([]);
  const logsTruncated = ref(false);
  const selectedLogService = ref<HostAgentServiceSnapshot | null>(null);
  const actionVisible = ref(false);
  const actionLoading = ref(false);
  const selectedAction = ref<SelectedAction | null>(null);

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
    const date = new Date(String(value || ''));
    if (!Number.isFinite(date.getTime())) return '—';
    return new Intl.DateTimeFormat(locale.value, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(
      date,
    );
  }

  function serviceName(id: HostAgentServiceId) {
    return t(`serverManagement.serviceNames.${id}`);
  }

  function serviceTone(state: HostAgentServiceState): ChipTone {
    if (state === 'running') return 'success';
    if (state === 'stopped') return 'pending';
    if (state === 'degraded') return 'danger';
    return 'neutral';
  }

  function serviceStateLabel(state: HostAgentServiceState) {
    return t(`serverManagement.serviceStates.${state}`);
  }

  function actionLabel(action: HostAgentAction) {
    return action === HOST_AGENT_ACTIONS.NGINX_RELOAD
      ? t('serverManagement.reloadNginx')
      : t('serverManagement.restartService');
  }

  function actionAriaLabel(service: HostAgentServiceSnapshot, action: HostAgentAction) {
    return t('serverManagement.actionForService', { action: actionLabel(action), service: serviceName(service.id) });
  }

  function actionDialogTitle(action: SelectedAction) {
    return t('serverManagement.actionDialogTitle', { action: actionLabel(action.action), service: action.serviceName });
  }

  function actionImpact(action: HostAgentAction) {
    return action === HOST_AGENT_ACTIONS.NGINX_RELOAD
      ? t('serverManagement.nginxReloadImpact')
      : t('serverManagement.serviceRestartImpact');
  }

  function openAction(service: HostAgentServiceSnapshot, action: HostAgentAction) {
    selectedAction.value = { action, targetId: service.id, serviceName: serviceName(service.id) };
    actionVisible.value = true;
  }

  async function confirmAction(confirmation: { reason: string; confirmed: true; confirmText: string }) {
    if (!selectedAction.value || actionLoading.value) return;
    actionLoading.value = true;
    try {
      await runAction(selectedAction.value.action, selectedAction.value.targetId, confirmation);
      actionVisible.value = false;
      message.success(t('serverManagement.actionSucceeded'));
    } catch (error) {
      const detail = error && typeof error === 'object' && 'message' in error ? String(error.message || '') : '';
      message.error(detail || t('serverManagement.actionFailed'));
    } finally {
      actionLoading.value = false;
    }
  }

  function openLogs(service: HostAgentServiceSnapshot) {
    selectedLogService.value = service;
    logsVisible.value = true;
    void reloadLogs();
  }

  async function reloadLogs() {
    if (!selectedLogService.value || logsLoading.value) return;
    logsLoading.value = true;
    logsError.value = '';
    logLines.value = [];
    try {
      const response = await getInfraLogs(selectedLogService.value.id);
      logLines.value = response.data.lines || [];
      logsTruncated.value = response.data.truncated === true;
    } catch (error) {
      logsError.value =
        error && typeof error === 'object' && 'message' in error
          ? String(error.message || t('serverManagement.logsFailed'))
          : t('serverManagement.logsFailed');
    } finally {
      logsLoading.value = false;
    }
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
  .server-metric-card__heading,
  .server-service-name,
  .server-management-warning,
  .server-service-actions,
  .server-service-mobile-actions {
    display: flex;
    align-items: center;
  }
  .server-management-header__main {
    min-width: 0;
    gap: 12px;
  }
  .server-management-header__icon,
  .server-metric-card__icon,
  .server-service-mobile-icon {
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
  .server-management-status-dot,
  .server-service-state-dot {
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
  .server-management-sampled-at,
  .server-management-service-summary {
    color: var(--desc-color);
    font-size: 12px;
    font-weight: 400;
  }
  .server-service-name {
    gap: 8px;
  }
  .server-service-name svg {
    color: var(--primary-color);
  }
  .server-service-actions {
    flex-wrap: wrap;
    gap: 7px;
  }
  .server-service-actions :deep(.b_btn),
  .server-service-mobile-actions :deep(.b_btn) {
    gap: 5px;
  }
  .server-management-service-mobile {
    display: none;
  }
  .server-service-mobile-icon {
    width: 34px;
    height: 34px;
    border-radius: 10px;
  }
  .server-service-mobile-actions {
    gap: 6px;
  }
  .server-service-mobile-actions :deep(.b_btn) {
    width: 30px;
    padding: 0;
  }
  .server-logs {
    min-height: 260px;
  }
  .server-logs pre {
    max-height: min(65vh, 620px);
    margin: 0;
    overflow: auto;
    padding: 14px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    color: var(--text-color);
    background: var(--workspace-panel-bg-color, var(--background-color));
    font:
      12px/1.65 ui-monospace,
      SFMono-Regular,
      Menlo,
      Consolas,
      monospace;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .server-logs__state {
    min-height: 240px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: var(--desc-color);
  }
  .server-logs__state--error {
    color: var(--error-color, #d14343);
  }
  .server-logs__notice {
    margin: 0 0 10px;
    color: var(--warning-color, #ad6800);
    font-size: 12px;
  }
  html.light-note-mobile-rendering .server-management-header__icon,
  html.light-note-mobile-rendering .server-metric-card__icon,
  html.light-note-mobile-rendering .server-management-unavailable,
  html.light-note-mobile-rendering .server-management-warning {
    box-shadow: none;
  }
  @media (max-width: 1023px) {
    .server-management-metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .server-management-service-table {
      display: none;
    }
    .server-management-service-mobile {
      display: block;
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
    .server-management-sampled-at,
    .server-management-service-summary {
      display: none;
    }
    .server-logs__state {
      flex-direction: column;
      text-align: center;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .server-management-skeleton {
      animation: none;
    }
  }
</style>
