<template>
  <main class="infra-module-page">
    <div class="infra-module-content">
      <InfraModuleHeader
        :title="t('serverManagement.servicesPage.title')"
        :subtitle="t('serverManagement.servicesPage.subtitle')"
        :icon-src="icon.infrastructure.service"
        :cadence="t('serverManagement.servicesPage.cadence')"
        :loading="refreshing"
        :refresh-label="t('common.refresh')"
        @refresh="refresh"
      />

      <BLoading v-if="initialLoading" inline :loading="true" :title="t('serverManagement.loading')" />
      <BCard v-else-if="!data" class="infra-state-card" variant="panel">
        <SvgIcon :src="icon.message.warning" size="24" aria-hidden="true" />
        <div
          ><strong>{{ t('serverManagement.snapshotUnavailable') }}</strong
          ><p>{{ error }}</p></div
        >
        <BButton type="primary" @click="refresh">{{ t('serverManagement.retry') }}</BButton>
      </BCard>
      <template v-else>
        <div v-if="error" class="infra-stale-warning" role="status">
          <SvgIcon :src="icon.message.warning" size="16" />{{ t('serverManagement.staleSnapshot') }}
        </div>
        <section class="service-summary-grid">
          <BCard v-for="item in summaryCards" :key="item.key" class="service-summary-card">
            <span>{{ item.label }}</span
            ><strong>{{ item.value }}</strong
            ><small>{{ item.hint }}</small>
          </BCard>
        </section>
        <BCard :title="t('serverManagement.servicesTitle')">
          <div class="services-table">
            <BTable :data="services" :columns="columns" row-key="id">
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'name'">
                  <span class="service-name"
                    ><SvgIcon :src="icon.infrastructure.service" size="16" />{{ serviceName(record.id) }}</span
                  >
                </template>
                <template v-else-if="column.key === 'state'">
                  <BChip :tone="tone(record.state)">{{ stateLabel(record.state) }}</BChip>
                </template>
                <template v-else-if="column.key === 'cpu'">{{ formatPercent(record.cpuPercent) }}</template>
                <template v-else-if="column.key === 'memory'">{{ formatBytes(record.memoryBytes) }}</template>
                <template v-else-if="column.key === 'restarts'">{{ record.restartCount ?? '—' }}</template>
                <template v-else-if="column.key === 'uptime'">{{ formatDuration(record.uptimeSeconds) }}</template>
                <template v-else-if="column.key === 'actions'">
                  <div class="service-actions">
                    <BButton size="small" @click="openLogs(record)">
                      <SvgIcon :src="icon.infrastructure.logs" size="14" />{{ t('serverManagement.viewLogs') }}
                    </BButton>
                    <BButton
                      v-for="action in record.actions"
                      :key="action"
                      type="danger"
                      size="small"
                      :disabled="actionLoading"
                      @click="openAction(record, action)"
                    >
                      <SvgIcon :src="icon.infrastructure.restart" size="14" />{{ actionLabel(action) }}
                    </BButton>
                  </div>
                </template>
              </template>
            </BTable>
          </div>
          <MobileListSurface class="services-mobile">
            <MobileListRow v-for="service in services" :key="service.id" complex>
              <template #leading><SvgIcon :src="icon.infrastructure.service" size="18" /></template>
              <template #title>{{ serviceName(service.id) }}</template>
              <template #subtitle>
                CPU {{ formatPercent(service.cpuPercent) }} · {{ formatBytes(service.memoryBytes) }} ·
                {{ formatDuration(service.uptimeSeconds) }}
              </template>
              <template #meta
                ><BChip :tone="tone(service.state)">{{ stateLabel(service.state) }}</BChip></template
              >
              <template #trailing>
                <div class="service-mobile-actions">
                  <BButton
                    size="small"
                    :aria-label="t('serverManagement.viewServiceLogs', { service: serviceName(service.id) })"
                    @click="openLogs(service)"
                  >
                    <SvgIcon :src="icon.infrastructure.logs" size="15" />
                  </BButton>
                  <BButton
                    v-for="action in service.actions"
                    :key="action"
                    type="danger"
                    size="small"
                    :disabled="actionLoading"
                    :aria-label="
                      t('serverManagement.actionForService', {
                        action: actionLabel(action),
                        service: serviceName(service.id),
                      })
                    "
                    @click="openAction(service, action)"
                  >
                    <SvgIcon :src="icon.infrastructure.restart" size="15" />
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
      :title="t('serverManagement.logsTitle', { service: selectedService ? serviceName(selectedService.id) : '' })"
      width="min(900px, 94vw)"
      :show-footer="false"
      fullscreen-mobile
    >
      <div class="service-logs">
        <div class="service-logs__toolbar">
          <div class="service-logs__identity">
            <span class="service-logs__icon"><SvgIcon :src="icon.infrastructure.service" size="18" /></span>
            <div>
              <strong>{{ selectedService ? serviceName(selectedService.id) : '—' }}</strong>
              <BChip tone="neutral">{{ t('serverManagement.logsReadOnly') }}</BChip>
            </div>
          </div>
          <div class="service-logs__controls">
            <label :id="logLimitLabelId">{{ t('serverManagement.logsLimitLabel') }}</label>
            <BSelect
              class="service-logs__limit"
              :value="logLimit"
              :options="logLimitOptions"
              :aria-labelledby="logLimitLabelId"
              :disabled="logsLoading"
              @change="setLogLimit"
            />
            <BButton size="small" :loading="logsLoading" @click="loadLogs">
              <SvgIcon :src="icon.infrastructure.refresh" size="14" />{{ t('serverManagement.refreshLogs') }}
            </BButton>
          </div>
        </div>

        <div v-if="logLines.length && !logsLoading" class="service-logs__meta" role="status">
          <span>{{ t('serverManagement.logsLineCount', { count: logLines.length }) }}</span>
          <span v-if="logsCapturedAt">{{
            t('serverManagement.logsCapturedAt', { time: formatLogTime(logsCapturedAt) })
          }}</span>
          <span v-if="logsTruncated" class="is-warning">{{ t('serverManagement.logsTruncated') }}</span>
        </div>

        <div v-if="logsLoading" class="service-logs__state">
          <BLoading inline :loading="true" :title="t('serverManagement.logsLoading')" />
        </div>
        <div v-else-if="logsError" class="service-logs__state is-error">
          <SvgIcon :src="icon.message.warning" size="22" />
          <span>{{ logsError }}</span>
          <BButton size="small" @click="loadLogs">{{ t('serverManagement.retry') }}</BButton>
        </div>
        <div v-else-if="!logLines.length" class="service-logs__state">
          <SvgIcon :src="icon.infrastructure.logs" size="22" />
          <span>{{ t('serverManagement.logsEmpty') }}</span>
        </div>
        <div v-else class="service-log-viewer">
          <div class="service-log-viewer__header" aria-hidden="true">
            <span>{{ t('serverManagement.logsLineColumn') }}</span>
            <span>{{ t('serverManagement.logsOutputColumn') }}</span>
          </div>
          <ol :aria-label="logViewerLabel">
            <li v-for="(line, index) in logLines" :key="`${index}-${line}`">
              <span aria-hidden="true">{{ index + 1 }}</span
              ><code>{{ line || ' ' }}</code>
            </li>
          </ol>
        </div>
      </div>
    </BModal>
    <AdminRiskActionModal
      v-model:visible="actionVisible"
      :title="actionDialogTitle"
      :impact="actionImpact"
      :confirm-phrase="actionConfirmPhrase"
      :confirm-label="actionConfirmLabel"
      :loading="actionLoading"
      @confirm="confirmAction"
    />
  </main>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type {
    HostAgentAction,
    HostAgentServiceId,
    HostAgentServiceSnapshot,
    HostAgentServiceState,
  } from '@lightnote/shared/host-agent-protocol';
  import { HOST_AGENT_ACTIONS } from '@lightnote/shared/host-agent-protocol';
  import { getInfraLogs, getInfraServices } from '@/api/infraApi';
  import icon from '@/config/icon';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import AdminRiskActionModal from '@/components/admin/AdminRiskActionModal.vue';
  import MobileListSurface from '@/components/mobile/MobileListSurface.vue';
  import MobileListRow from '@/components/mobile/MobileListRow.vue';
  import InfraModuleHeader from './InfraModuleHeader.vue';
  import { useInfraSnapshot } from './useInfraSnapshot';
  import { useInfraActions } from './useInfraActions';
  import { formatBytes, formatDuration, formatPercent } from './serverManagementFormat';

  type ChipTone = 'neutral' | 'success' | 'danger' | 'pending';
  type LogLimit = 80 | 160 | 300;
  interface SelectedAction {
    action: HostAgentAction;
    targetId: HostAgentServiceId;
    serviceName: string;
  }

  const { t, locale } = useI18n();
  const { data, initialLoading, refreshing, error, refresh } = useInfraSnapshot(getInfraServices, 10_000);
  const { runAction } = useInfraActions(refresh);
  const services = computed(() => data.value?.services || []);
  const summaryCards = computed(() => {
    const running = services.value.filter((item) => item.state === 'running').length;
    const restarts = services.value.reduce((sum, item) => sum + Number(item.restartCount || 0), 0);
    const memory = services.value.reduce((sum, item) => sum + Number(item.memoryBytes || 0), 0);
    return [
      {
        key: 'running',
        label: t('serverManagement.servicesPage.running'),
        value: `${running}/${services.value.length}`,
        hint: t('serverManagement.servicesPage.runningHint'),
      },
      {
        key: 'degraded',
        label: t('serverManagement.servicesPage.abnormal'),
        value: String(services.value.length - running),
        hint: t('serverManagement.servicesPage.abnormalHint'),
      },
      {
        key: 'memory',
        label: t('serverManagement.servicesPage.totalMemory'),
        value: formatBytes(memory),
        hint: t('serverManagement.servicesPage.memoryHint'),
      },
      {
        key: 'restarts',
        label: t('serverManagement.servicesPage.restarts'),
        value: String(restarts),
        hint: t('serverManagement.servicesPage.restartsHint'),
      },
    ];
  });
  const columns = computed(() => [
    { key: 'name', title: t('serverManagement.columns.service'), width: '1.5fr', ellipsis: false },
    { key: 'state', title: t('serverManagement.columns.state'), width: '110px', ellipsis: false },
    { key: 'cpu', title: 'CPU', width: '90px', ellipsis: false },
    { key: 'memory', title: t('serverManagement.memory'), width: '110px', ellipsis: false },
    { key: 'restarts', title: t('serverManagement.servicesPage.restarts'), width: '90px', ellipsis: false },
    { key: 'uptime', title: t('serverManagement.columns.uptime'), width: '110px', ellipsis: false },
    { key: 'actions', title: t('serverManagement.columns.actions'), width: 'minmax(180px, auto)', ellipsis: false },
  ]);
  const logsVisible = ref(false);
  const logsLoading = ref(false);
  const logsError = ref('');
  const logLines = ref<string[]>([]);
  const logsTruncated = ref(false);
  const logsCapturedAt = ref('');
  const logLimit = ref<LogLimit>(160);
  const selectedService = ref<HostAgentServiceSnapshot | null>(null);
  const actionVisible = ref(false);
  const actionLoading = ref(false);
  const selectedAction = ref<SelectedAction | null>(null);
  const logLimitLabelId = 'service-logs-limit-label';
  const logLimitOptions = computed(() => [
    { value: 80, label: t('serverManagement.logLimits.short') },
    { value: 160, label: t('serverManagement.logLimits.standard') },
    { value: 300, label: t('serverManagement.logLimits.extended') },
  ]);
  const logViewerLabel = computed(() =>
    selectedService.value
      ? t('serverManagement.logsTitle', { service: serviceName(selectedService.value.id) })
      : t('serverManagement.logsTitle', { service: '' }),
  );
  const actionDialogTitle = computed(() =>
    selectedAction.value
      ? t('serverManagement.actionDialogTitle', {
          action: actionLabel(selectedAction.value.action),
          service: selectedAction.value.serviceName,
        })
      : t('serverManagement.actionTitle'),
  );
  const actionImpact = computed(() =>
    selectedAction.value?.action === HOST_AGENT_ACTIONS.NGINX_RELOAD
      ? t('serverManagement.nginxReloadImpact')
      : t('serverManagement.serviceRestartImpact'),
  );
  const actionConfirmLabel = computed(() => (selectedAction.value ? actionLabel(selectedAction.value.action) : ''));
  const actionConfirmPhrase = '';
  let logsRequestId = 0;

  function serviceName(id: HostAgentServiceId) {
    return t(`serverManagement.serviceNames.${id}`);
  }
  function stateLabel(state: HostAgentServiceState) {
    return t(`serverManagement.serviceStates.${state}`);
  }
  function tone(state: HostAgentServiceState): ChipTone {
    return state === 'running'
      ? 'success'
      : state === 'degraded'
        ? 'danger'
        : state === 'stopped'
          ? 'pending'
          : 'neutral';
  }
  function openLogs(service: HostAgentServiceSnapshot) {
    selectedService.value = service;
    logsVisible.value = true;
    void loadLogs();
  }
  async function loadLogs() {
    if (!selectedService.value) return;
    const requestId = ++logsRequestId;
    const serviceId = selectedService.value.id;
    const limit = logLimit.value;
    logsLoading.value = true;
    logsError.value = '';
    logLines.value = [];
    logsTruncated.value = false;
    logsCapturedAt.value = '';
    try {
      const response = await getInfraLogs(serviceId, limit);
      if (requestId !== logsRequestId) return;
      logLines.value = response.data.lines || [];
      logsTruncated.value = Boolean(response.data.truncated);
      logsCapturedAt.value = response.data.capturedAt || '';
    } catch (cause) {
      if (requestId !== logsRequestId) return;
      logsError.value =
        cause && typeof cause === 'object' && 'message' in cause
          ? String(cause.message || '')
          : t('serverManagement.logsFailed');
    } finally {
      if (requestId === logsRequestId) logsLoading.value = false;
    }
  }
  function setLogLimit(value: unknown) {
    const next = Number(value);
    if (![80, 160, 300].includes(next) || next === logLimit.value) return;
    logLimit.value = next as LogLimit;
    void loadLogs();
  }
  function formatLogTime(value: string) {
    const date = new Date(String(value).replace(' ', 'T'));
    return Number.isFinite(date.getTime()) ? date.toLocaleString(locale.value, { hour12: false }) : value;
  }
  function actionLabel(action: HostAgentAction) {
    return action === HOST_AGENT_ACTIONS.NGINX_RELOAD
      ? t('serverManagement.reloadNginx')
      : t('serverManagement.restartService');
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
    } catch (cause) {
      const detail = cause && typeof cause === 'object' && 'message' in cause ? String(cause.message || '') : '';
      message.error(detail || t('serverManagement.actionFailed'));
    } finally {
      actionLoading.value = false;
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
  .service-summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
  }
  .service-summary-card {
    display: grid;
    gap: 8px;
  }
  .service-summary-card span,
  .service-summary-card small {
    color: var(--desc-color);
  }
  .service-summary-card strong {
    font-size: 25px;
    font-variant-numeric: tabular-nums;
  }
  .service-name {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-weight: 600;
  }
  .service-actions,
  .service-mobile-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 7px;
  }
  .service-actions :deep(.b_btn),
  .service-mobile-actions :deep(.b_btn) {
    gap: 5px;
  }
  .services-mobile {
    display: none;
  }
  .service-logs {
    min-height: 310px;
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    gap: 12px;
  }
  .service-logs__toolbar,
  .service-logs__identity,
  .service-logs__identity > div,
  .service-logs__controls,
  .service-logs__meta,
  .service-logs__state {
    display: flex;
    align-items: center;
  }
  .service-logs__toolbar {
    min-width: 0;
    justify-content: space-between;
    gap: 18px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--surface-divider-color);
  }
  .service-logs__identity {
    min-width: 0;
    gap: 10px;
  }
  .service-logs__identity > div {
    min-width: 0;
    flex-wrap: wrap;
    gap: 7px;
  }
  .service-logs__identity strong {
    overflow: hidden;
    color: var(--text-color);
    font-size: 14px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .service-logs__icon {
    width: 34px;
    height: 34px;
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    color: var(--primary-color);
    background: var(--workspace-panel-bg-color);
  }
  .service-logs__controls {
    flex: 0 0 auto;
    gap: 8px;
  }
  .service-logs__controls label {
    color: var(--desc-color);
    font-size: 12px;
  }
  .service-logs__limit {
    width: 132px;
  }
  .service-logs__meta {
    min-height: 18px;
    flex-wrap: wrap;
    gap: 6px 14px;
    color: var(--pre-muted-color, var(--desc-color));
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .service-logs__meta .is-warning {
    color: var(--warning-color, #ad6800);
  }
  .service-logs__state {
    min-height: 240px;
    justify-content: center;
    gap: 10px;
    border: 1px dashed var(--surface-border-color);
    border-radius: 12px;
    color: var(--desc-color);
    background: var(--workspace-panel-bg-color);
  }
  .service-logs__state.is-error {
    border-style: solid;
    border-color: var(--error-color, #d14343);
    color: var(--error-color, #d14343);
  }
  .service-log-viewer {
    max-height: min(58vh, 560px);
    overflow: auto;
    border: 1px solid var(--pre-border-color);
    border-radius: 12px;
    color: var(--pre-text-color);
    background: var(--pre-bg-color);
    box-shadow: inset 0 1px 0 var(--pre-highlight-color, transparent);
  }
  .service-log-viewer__header,
  .service-log-viewer li {
    min-width: max-content;
    display: grid;
    grid-template-columns: 58px minmax(660px, 1fr);
  }
  .service-log-viewer__header {
    position: sticky;
    z-index: 1;
    top: 0;
    border-bottom: 1px solid var(--pre-border-color);
    color: var(--pre-muted-color);
    background: var(--pre-bg-color);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
  }
  .service-log-viewer__header span {
    padding: 8px 12px;
  }
  .service-log-viewer__header span:first-child,
  .service-log-viewer li > span {
    border-right: 1px solid var(--pre-border-color);
    text-align: right;
  }
  .service-log-viewer ol {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .service-log-viewer li:not(:last-child) {
    border-bottom: 1px solid var(--pre-border-color);
  }
  .service-log-viewer li > span,
  .service-log-viewer code {
    padding: 5px 12px;
    font:
      11px/1.55 'Fira Code',
      ui-monospace,
      SFMono-Regular,
      Menlo,
      Consolas,
      monospace !important;
  }
  .service-log-viewer li > span {
    color: var(--pre-muted-color);
    font-variant-numeric: tabular-nums;
    user-select: none;
  }
  .service-log-viewer code {
    color: var(--pre-text-color);
    white-space: pre;
    text-shadow: none !important;
  }
  html.light-note-mobile-rendering .service-logs__icon,
  html.light-note-mobile-rendering .service-log-viewer {
    box-shadow: none;
  }
  @media (max-width: 900px) {
    .service-summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 760px) {
    .infra-module-content {
      width: calc(100% - 24px);
      padding: 18px 0 32px;
      gap: 14px;
    }
    .services-table {
      display: none;
    }
    .services-mobile {
      display: block;
    }
    .service-summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }
    .service-summary-card strong {
      font-size: 21px;
    }
    .service-mobile-actions {
      flex-wrap: nowrap;
    }
    .service-mobile-actions :deep(.b_btn) {
      width: 32px;
      padding: 0;
    }
    .service-logs {
      min-height: calc(100vh - 150px);
    }
    .service-logs__toolbar {
      align-items: stretch;
      flex-direction: column;
      gap: 12px;
    }
    .service-logs__controls {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .service-logs__controls label {
      grid-column: 1 / 3;
    }
    .service-logs__limit {
      width: 100%;
    }
    .service-logs__state {
      min-height: 220px;
      flex-direction: column;
      padding: 18px;
      text-align: center;
    }
    .service-log-viewer {
      max-height: calc(100vh - 330px);
    }
    .service-log-viewer__header,
    .service-log-viewer li {
      grid-template-columns: 46px minmax(560px, 1fr);
    }
    .service-log-viewer__header span,
    .service-log-viewer li > span,
    .service-log-viewer code {
      padding-right: 9px;
      padding-left: 9px;
    }
  }
</style>
