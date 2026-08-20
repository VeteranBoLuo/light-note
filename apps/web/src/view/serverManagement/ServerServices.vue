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
                  <BButton size="small" @click="openLogs(record)">
                    <SvgIcon :src="icon.infrastructure.logs" size="14" />{{ t('serverManagement.viewLogs') }}
                  </BButton>
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
                <BButton
                  size="small"
                  :aria-label="t('serverManagement.viewServiceLogs', { service: serviceName(service.id) })"
                  @click="openLogs(service)"
                >
                  <SvgIcon :src="icon.infrastructure.logs" size="15" />
                </BButton>
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
        <BLoading v-if="logsLoading" inline :loading="true" :title="t('serverManagement.logsLoading')" />
        <div v-else-if="logsError" class="infra-state-card"
          ><span>{{ logsError }}</span
          ><BButton size="small" @click="loadLogs">{{ t('serverManagement.retry') }}</BButton></div
        >
        <p v-else-if="!logLines.length">{{ t('serverManagement.logsEmpty') }}</p>
        <pre v-else><code>{{ logLines.join('\n') }}</code></pre>
      </div>
    </BModal>
  </main>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type {
    HostAgentServiceId,
    HostAgentServiceSnapshot,
    HostAgentServiceState,
  } from '@lightnote/shared/host-agent-protocol';
  import { getInfraLogs, getInfraServices } from '@/api/infraApi';
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
  import InfraModuleHeader from './InfraModuleHeader.vue';
  import { useInfraSnapshot } from './useInfraSnapshot';
  import { formatBytes, formatDuration, formatPercent } from './serverManagementFormat';

  type ChipTone = 'neutral' | 'success' | 'danger' | 'pending';
  const { t } = useI18n();
  const { data, initialLoading, refreshing, error, refresh } = useInfraSnapshot(getInfraServices, 10_000);
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
    { key: 'actions', title: t('serverManagement.columns.actions'), width: '130px', ellipsis: false },
  ]);
  const logsVisible = ref(false);
  const logsLoading = ref(false);
  const logsError = ref('');
  const logLines = ref<string[]>([]);
  const selectedService = ref<HostAgentServiceSnapshot | null>(null);

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
    if (!selectedService.value || logsLoading.value) return;
    logsLoading.value = true;
    logsError.value = '';
    try {
      const response = await getInfraLogs(selectedService.value.id);
      logLines.value = response.data.lines || [];
    } catch (cause) {
      logsError.value =
        cause && typeof cause === 'object' && 'message' in cause
          ? String(cause.message || '')
          : t('serverManagement.logsFailed');
    } finally {
      logsLoading.value = false;
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
  .services-mobile {
    display: none;
  }
  .service-logs pre {
    max-height: 60vh;
    margin: 0;
    padding: 14px;
    overflow: auto;
    border-radius: 10px;
    background: #111827;
    color: #dbe7f5;
    font-size: 12px;
    line-height: 1.65;
    white-space: pre-wrap;
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
  }
</style>
