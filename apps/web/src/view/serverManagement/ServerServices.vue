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
        <BCard
          v-if="lastActionResult"
          class="action-receipt"
          :title="t('serverManagement.servicesPage.actionReceiptTitle')"
        >
          <div class="action-receipt__summary">
            <span class="action-receipt__icon"><SvgIcon :src="icon.infrastructure.security" size="20" /></span>
            <div>
              <strong>{{ lastActionResult.actionLabel }} · {{ lastActionResult.serviceName }}</strong>
              <p>{{ lastActionResult.summary || t('serverManagement.actionSucceeded') }}</p>
            </div>
            <BChip tone="success">{{ t('serverManagement.actionSucceeded') }}</BChip>
          </div>
          <dl class="action-receipt__details">
            <div
              ><dt>{{ t('serverManagement.servicesPage.receiptState') }}</dt
              ><dd>{{ receiptStateLabel(lastActionResult.state) }}</dd></div
            >
            <div
              ><dt>{{ t('serverManagement.servicesPage.receiptJob') }}</dt
              ><dd>{{ lastActionResult.jobId || '—' }}</dd></div
            >
            <div>
              <dt>{{ t('serverManagement.servicesPage.receiptReplay') }}</dt>
              <dd>{{
                lastActionResult.replayed
                  ? t('serverManagement.servicesPage.receiptReplayYes')
                  : t('serverManagement.servicesPage.receiptReplayNo')
              }}</dd>
            </div>
            <div>
              <dt>{{ t('serverManagement.servicesPage.receiptVerification') }}</dt>
              <dd :class="lastActionResult.verified ? 'is-verified' : 'is-unverified'">{{
                lastActionResult.verified
                  ? t('serverManagement.servicesPage.receiptVerified')
                  : t('serverManagement.servicesPage.receiptUnverified')
              }}</dd>
            </div>
          </dl>
          <div class="action-receipt__actions">
            <BButton size="small" @click="router.push('/serverManagement/events')">{{
              t('serverManagement.servicesPage.viewAudit')
            }}</BButton>
            <BButton size="small" @click="lastActionResult = null">{{
              t('serverManagement.servicesPage.dismissReceipt')
            }}</BButton>
          </div>
        </BCard>
        <section class="service-summary-grid">
          <BCard v-for="item in summaryCards" :key="item.key" class="service-summary-card">
            <span>{{ item.label }}</span
            ><strong>{{ item.value }}</strong
            ><small>{{ item.hint }}</small>
          </BCard>
        </section>
        <BCard :title="t('serverManagement.servicesTitle')">
          <div class="services-toolbar">
            <BInput
              v-model:value="serviceKeyword"
              clearable
              :placeholder="t('serverManagement.servicesPage.searchPlaceholder')"
            >
              <template #prefix><SvgIcon :src="icon.navigation.search" size="15" /></template>
            </BInput>
            <BSelect
              :value="serviceStateFilter"
              :options="serviceStateOptions"
              :aria-label="t('serverManagement.servicesPage.stateFilterLabel')"
              @change="serviceStateFilter = String($event)"
            />
            <span>{{
              t('serverManagement.servicesPage.visibleCount', {
                visible: filteredServices.length,
                total: services.length,
              })
            }}</span>
          </div>
          <div v-if="!filteredServices.length" class="services-empty">{{
            t('serverManagement.servicesPage.filterEmpty')
          }}</div>
          <div v-if="filteredServices.length" class="services-table">
            <BTable :data="filteredServices" :columns="columns" row-key="id">
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
          <MobileListSurface v-if="filteredServices.length" class="services-mobile">
            <MobileListRow v-for="service in filteredServices" :key="service.id" complex>
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
              :disabled="logsLoading || logsRefreshing"
              @change="setLogLimit"
            />
            <BButton size="small" :loading="logsLoading || logsRefreshing" @click="loadLogs">
              <SvgIcon :src="icon.infrastructure.refresh" size="14" />{{ t('serverManagement.refreshLogs') }}
            </BButton>
          </div>
        </div>

        <div class="service-logs__filters">
          <BInput v-model:value="logKeyword" clearable :placeholder="t('serverManagement.logsSearchPlaceholder')">
            <template #prefix><SvgIcon :src="icon.navigation.search" size="15" /></template>
          </BInput>
          <BSelect
            :value="logLevel"
            :options="logLevelOptions"
            :aria-label="t('serverManagement.logsLevelLabel')"
            @change="logLevel = String($event)"
          />
          <BSelect
            :value="logRefreshInterval"
            :options="logRefreshOptions"
            :aria-label="t('serverManagement.logsAutoRefreshLabel')"
            @change="setLogRefreshInterval"
          />
          <BButton size="small" :disabled="!filteredLogEntries.length" @click="copyVisibleLogs">
            <SvgIcon :src="icon.infrastructure.copy" size="14" />{{ t('serverManagement.copyVisibleLogs') }}
          </BButton>
          <BButton size="small" :disabled="!filteredLogEntries.length" @click="exportVisibleLogs">
            <SvgIcon :src="icon.infrastructure.export" size="14" />{{ t('serverManagement.exportVisibleLogs') }}
          </BButton>
        </div>

        <div v-if="logLines.length && !logsLoading" class="service-logs__meta" role="status">
          <span>{{
            t('serverManagement.logsVisibleCount', { visible: filteredLogEntries.length, total: logLines.length })
          }}</span>
          <span v-if="logsCapturedAt">{{
            t('serverManagement.logsCapturedAt', { time: formatLogTime(logsCapturedAt) })
          }}</span>
          <span v-if="logsRefreshing">{{ t('serverManagement.refreshing') }}</span>
          <span v-if="logsError" class="is-warning">{{ logsError }}</span>
          <span v-if="logsTruncated" class="is-warning">{{ t('serverManagement.logsTruncated') }}</span>
        </div>

        <div v-if="logsLoading" class="service-logs__state">
          <BLoading inline :loading="true" :title="t('serverManagement.logsLoading')" />
        </div>
        <div v-else-if="logsError && !logLines.length" class="service-logs__state is-error">
          <SvgIcon :src="icon.message.warning" size="22" />
          <span>{{ logsError }}</span>
          <BButton size="small" @click="loadLogs">{{ t('serverManagement.retry') }}</BButton>
        </div>
        <div v-else-if="!logLines.length" class="service-logs__state">
          <SvgIcon :src="icon.infrastructure.logs" size="22" />
          <span>{{ t('serverManagement.logsEmpty') }}</span>
        </div>
        <div v-else-if="!filteredLogEntries.length" class="service-logs__state">
          <SvgIcon :src="icon.infrastructure.logs" size="22" />
          <span>{{ t('serverManagement.logsFilterEmpty') }}</span>
        </div>
        <div v-else class="service-log-viewer">
          <div class="service-log-viewer__header" aria-hidden="true">
            <span>{{ t('serverManagement.logsLineColumn') }}</span>
            <span>{{ t('serverManagement.logsOutputColumn') }}</span>
          </div>
          <ol :aria-label="logViewerLabel">
            <li v-for="entry in filteredLogEntries" :key="`${entry.index}-${entry.line}`" :class="`is-${entry.level}`">
              <span aria-hidden="true">{{ entry.index + 1 }}</span
              ><code>{{ entry.line || ' ' }}</code>
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
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import type {
    HostAgentAction,
    HostAgentServiceId,
    HostAgentServiceSnapshot,
    HostAgentServiceState,
  } from '@lightnote/shared/host-agent-protocol';
  import { HOST_AGENT_ACTIONS } from '@lightnote/shared/host-agent-protocol';
  import { getInfraLogs, getInfraServices, type InfraActionResultPayload } from '@/api/infraApi';
  import icon from '@/config/icon';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
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
  import { copyTextToClipboard } from '@/utils/clipboard';
  import { buildExportFileName, deliverGeneratedFile } from '@/utils/fileDelivery';

  type ChipTone = 'neutral' | 'success' | 'danger' | 'pending';
  type LogLimit = 80 | 160 | 300;
  type LogLevel = 'all' | 'error' | 'warning' | 'info' | 'other';
  type LogRefreshInterval = 0 | 3000 | 10000 | 30000;
  interface SelectedAction {
    action: HostAgentAction;
    targetId: HostAgentServiceId;
    serviceName: string;
  }
  interface LastActionResult {
    actionLabel: string;
    serviceName: string;
    targetId: HostAgentServiceId;
    state: string;
    jobId: string;
    summary: string;
    replayed: boolean;
    verified: boolean;
  }

  const { t, locale } = useI18n();
  const route = useRoute();
  const router = useRouter();
  const { data, initialLoading, refreshing, error, refresh } = useInfraSnapshot(getInfraServices, 10_000);
  const { runAction } = useInfraActions(refresh);
  const services = computed(() => data.value?.services || []);
  const serviceKeyword = ref('');
  const serviceStateFilter = ref('all');
  const serviceStateOptions = computed(() => [
    { value: 'all', label: t('serverManagement.servicesPage.stateFilter.all') },
    { value: 'running', label: t('serverManagement.servicesPage.stateFilter.running') },
    { value: 'abnormal', label: t('serverManagement.servicesPage.stateFilter.abnormal') },
  ]);
  const filteredServices = computed(() => {
    const keyword = serviceKeyword.value.trim().toLocaleLowerCase(locale.value);
    return services.value.filter((service) => {
      const matchesState =
        serviceStateFilter.value === 'all' ||
        (serviceStateFilter.value === 'running' ? service.state === 'running' : service.state !== 'running');
      const haystack =
        `${service.id} ${serviceName(service.id)} ${service.detail || ''} ${stateLabel(service.state)}`.toLocaleLowerCase(
          locale.value,
        );
      return matchesState && (!keyword || haystack.includes(keyword));
    });
  });
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
  const logsRefreshing = ref(false);
  const logsError = ref('');
  const logLines = ref<string[]>([]);
  const logsTruncated = ref(false);
  const logsCapturedAt = ref('');
  const logLimit = ref<LogLimit>(160);
  const logKeyword = ref('');
  const logLevel = ref<LogLevel>('all');
  const logRefreshInterval = ref<LogRefreshInterval>(0);
  const selectedService = ref<HostAgentServiceSnapshot | null>(null);
  const actionVisible = ref(false);
  const actionLoading = ref(false);
  const selectedAction = ref<SelectedAction | null>(null);
  const lastActionResult = ref<LastActionResult | null>(null);
  const logLimitLabelId = 'service-logs-limit-label';
  const logLimitOptions = computed(() => [
    { value: 80, label: t('serverManagement.logLimits.short') },
    { value: 160, label: t('serverManagement.logLimits.standard') },
    { value: 300, label: t('serverManagement.logLimits.extended') },
  ]);
  const logLevelOptions = computed(() =>
    (['all', 'error', 'warning', 'info', 'other'] as const).map((value) => ({
      value,
      label: t(`serverManagement.logLevels.${value}`),
    })),
  );
  const logRefreshOptions = computed(() => [
    { value: 0, label: t('serverManagement.logRefreshIntervals.off') },
    { value: 3000, label: t('serverManagement.logRefreshIntervals.threeSeconds') },
    { value: 10000, label: t('serverManagement.logRefreshIntervals.tenSeconds') },
    { value: 30000, label: t('serverManagement.logRefreshIntervals.thirtySeconds') },
  ]);
  const filteredLogEntries = computed(() => {
    const keyword = logKeyword.value.trim().toLocaleLowerCase(locale.value);
    return logLines.value
      .map((line, index) => ({ line, index, level: detectLogLevel(line) }))
      .filter(
        (entry) =>
          (logLevel.value === 'all' || entry.level === logLevel.value) &&
          (!keyword || entry.line.toLocaleLowerCase(locale.value).includes(keyword)),
      );
  });
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
  let logRefreshTimer: number | null = null;

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
    logKeyword.value = '';
    logLevel.value = 'all';
    logsVisible.value = true;
    void loadLogs();
  }
  async function loadLogs(preserveCurrent = false) {
    if (!selectedService.value || logsLoading.value || logsRefreshing.value) return;
    clearLogRefreshTimer();
    const requestId = ++logsRequestId;
    const serviceId = selectedService.value.id;
    const limit = logLimit.value;
    const backgroundRefresh = preserveCurrent && logLines.value.length > 0;
    if (backgroundRefresh) logsRefreshing.value = true;
    else logsLoading.value = true;
    logsError.value = '';
    if (!preserveCurrent) {
      logLines.value = [];
      logsTruncated.value = false;
      logsCapturedAt.value = '';
    }
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
      if (requestId === logsRequestId) {
        logsLoading.value = false;
        logsRefreshing.value = false;
        scheduleLogRefresh();
      }
    }
  }
  function setLogLimit(value: unknown) {
    const next = Number(value);
    if (![80, 160, 300].includes(next) || next === logLimit.value) return;
    logLimit.value = next as LogLimit;
    void loadLogs();
  }
  function setLogRefreshInterval(value: unknown) {
    const next = Number(value);
    if (![0, 3000, 10000, 30000].includes(next)) return;
    logRefreshInterval.value = next as LogRefreshInterval;
    scheduleLogRefresh();
  }
  function clearLogRefreshTimer() {
    if (logRefreshTimer !== null) window.clearTimeout(logRefreshTimer);
    logRefreshTimer = null;
  }
  function scheduleLogRefresh() {
    clearLogRefreshTimer();
    if (!logsVisible.value || !logRefreshInterval.value || document.visibilityState !== 'visible') return;
    logRefreshTimer = window.setTimeout(() => void loadLogs(true), logRefreshInterval.value);
  }
  function onVisibilityChange() {
    if (document.visibilityState === 'visible') scheduleLogRefresh();
    else clearLogRefreshTimer();
  }
  function detectLogLevel(line: string): Exclude<LogLevel, 'all'> {
    if (/\b(error|fatal|exception|panic|failed?)\b/i.test(line)) return 'error';
    if (/\b(warn(?:ing)?|deprecated|retry)\b/i.test(line)) return 'warning';
    if (/\b(info|notice|debug|trace|online|ready|started)\b/i.test(line)) return 'info';
    return 'other';
  }
  function visibleLogText() {
    return filteredLogEntries.value.map((entry) => entry.line).join('\n');
  }
  async function copyVisibleLogs() {
    const copied = await copyTextToClipboard(visibleLogText());
    copied ? message.success(t('serverManagement.logsCopied')) : message.error(t('serverManagement.logsCopyFailed'));
  }
  async function exportVisibleLogs() {
    if (!selectedService.value || !filteredLogEntries.value.length) return;
    try {
      const result = await deliverGeneratedFile({
        content: visibleLogText(),
        fileName: buildExportFileName(
          `lightnote-${selectedService.value.id}-${Date.now()}`,
          'lightnote-service-logs',
          'log',
        ),
        mimeType: 'text/plain',
        preferShare: true,
      });
      if (result === 'unavailable') {
        const copied = await copyTextToClipboard(visibleLogText());
        copied
          ? message.warning(t('serverManagement.logsExportUnavailable'))
          : message.error(t('serverManagement.logsCopyFailed'));
      } else if (result !== 'cancelled') {
        message.success(t('serverManagement.logsExported'));
      }
    } catch {
      message.error(t('serverManagement.logsCopyFailed'));
    }
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
  function receiptStateLabel(state: string) {
    return ['succeeded', 'failed', 'unknown'].includes(state)
      ? t(`serverManagement.servicesPage.receiptStates.${state}`)
      : state;
  }
  function openAction(service: HostAgentServiceSnapshot, action: HostAgentAction) {
    selectedAction.value = { action, targetId: service.id, serviceName: serviceName(service.id) };
    actionVisible.value = true;
  }
  async function confirmAction(confirmation: { reason: string; confirmed: true; confirmText: string }) {
    if (!selectedAction.value || actionLoading.value) return;
    actionLoading.value = true;
    try {
      const currentAction = selectedAction.value;
      const response = await runAction(currentAction.action, currentAction.targetId, confirmation);
      const result = response.data as InfraActionResultPayload;
      const updatedService = services.value.find((service) => service.id === currentAction.targetId);
      lastActionResult.value = {
        actionLabel: actionLabel(currentAction.action),
        serviceName: currentAction.serviceName,
        targetId: currentAction.targetId,
        state: String(result.receipt?.state || 'succeeded'),
        jobId: String(result.receipt?.jobId || ''),
        summary: String(result.receipt?.summary || ''),
        replayed: result.replayed === true,
        verified: updatedService?.state === 'running',
      };
      actionVisible.value = false;
      message.success(t('serverManagement.actionSucceeded'));
    } catch (cause) {
      const detail = cause && typeof cause === 'object' && 'message' in cause ? String(cause.message || '') : '';
      message.error(detail || t('serverManagement.actionFailed'));
    } finally {
      actionLoading.value = false;
    }
  }

  watch(
    () => route.query.service,
    (value) => {
      const serviceId = String(value || '');
      if (!serviceId) return;
      serviceKeyword.value = serviceId;
      serviceStateFilter.value = 'all';
    },
    { immediate: true },
  );
  watch(logsVisible, (visible) => {
    if (visible) {
      scheduleLogRefresh();
      return;
    }
    clearLogRefreshTimer();
    logsRequestId += 1;
    logsLoading.value = false;
    logsRefreshing.value = false;
  });
  onMounted(() => document.addEventListener('visibilitychange', onVisibilityChange));
  onBeforeUnmount(() => {
    clearLogRefreshTimer();
    document.removeEventListener('visibilitychange', onVisibilityChange);
  });
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
  .action-receipt {
    border-color: var(--success-color, #27965b);
  }
  .action-receipt__summary {
    display: grid;
    grid-template-columns: 38px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
  }
  .action-receipt__icon {
    width: 36px;
    height: 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--success-color, #27965b);
    border-radius: 50%;
    color: var(--success-color, #27965b);
  }
  .action-receipt__summary p {
    margin: 4px 0 0;
    color: var(--desc-color);
    font-size: 12px;
  }
  .action-receipt__details {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    margin: 14px 0 0;
  }
  .action-receipt__details > div {
    min-width: 0;
    display: grid;
    gap: 4px;
    padding: 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 9px;
    background: var(--workspace-panel-bg-color);
  }
  .action-receipt__details dt {
    color: var(--desc-color);
    font-size: 11px;
  }
  .action-receipt__details dd {
    min-width: 0;
    margin: 0;
    overflow-wrap: anywhere;
    font-size: 12px;
  }
  .action-receipt__details dd.is-verified {
    color: var(--success-color, #27965b);
  }
  .action-receipt__details dd.is-unverified {
    color: var(--warning-color, #ad6800);
  }
  .action-receipt__actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 12px;
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
  .services-toolbar {
    display: grid;
    grid-template-columns: minmax(220px, 1fr) 150px auto;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }
  .services-toolbar > span {
    color: var(--desc-color);
    font-size: 12px;
    text-align: right;
  }
  .services-empty {
    min-height: 100px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--desc-color);
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
    grid-template-rows: auto auto auto minmax(0, 1fr);
    gap: 12px;
  }
  .service-logs__toolbar,
  .service-logs__identity,
  .service-logs__identity > div,
  .service-logs__controls,
  .service-logs__filters,
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
  .service-logs__filters {
    display: grid;
    grid-template-columns: minmax(180px, 1fr) 120px 145px auto auto;
    align-items: center;
    gap: 8px;
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
  .service-log-viewer li.is-error code {
    color: var(--error-color, #d14343);
  }
  .service-log-viewer li.is-warning code {
    color: var(--warning-color, #ad6800);
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
    .service-logs__filters {
      grid-template-columns: minmax(180px, 1fr) repeat(2, 120px);
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
    .services-toolbar {
      grid-template-columns: 1fr;
    }
    .services-toolbar > span {
      text-align: left;
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
    .action-receipt__summary {
      grid-template-columns: 36px minmax(0, 1fr);
    }
    .action-receipt__summary > :deep(.b-chip) {
      grid-column: 2;
      justify-self: start;
    }
    .action-receipt__details {
      grid-template-columns: 1fr;
    }
    .action-receipt__actions {
      justify-content: stretch;
    }
    .action-receipt__actions :deep(.b_btn) {
      flex: 1;
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
    .service-logs__filters {
      grid-template-columns: 1fr 1fr;
    }
    .service-logs__filters > :first-child {
      grid-column: 1 / 3;
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
