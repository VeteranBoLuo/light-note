<template>
  <InfraPage>
    <template #header>
      <InfraModuleHeader
        :mobile-title="t('serverManagement.modules.diagnostics')"
        :title="t('serverManagement.diagnosticsPage.title')"
        :cadence="t('serverManagement.diagnosticsPage.cadence')"
        primary
        :loading="refreshing"
        :refresh-label="t('serverManagement.diagnosticsPage.run')"
        @refresh="refresh"
      />
    </template>

    <BLoading v-if="initialLoading" inline :loading="true" :title="t('serverManagement.diagnosticsPage.running')" />
    <BCard v-else-if="!data" class="diagnostics-state" variant="panel">
      <SvgIcon :src="icon.message.warning" size="25" aria-hidden="true" />
      <div>
        <strong>{{ t('serverManagement.diagnosticsPage.failed') }}</strong>
        <p>{{ error }}</p>
      </div>
      <BButton type="primary" @click="refresh">{{ t('serverManagement.diagnosticsPage.run') }}</BButton>
    </BCard>

    <template v-else>
      <div v-if="error" class="diagnostics-stale" role="status">
        <SvgIcon :src="icon.message.warning" size="16" />{{ t('serverManagement.staleSnapshot') }}
      </div>

      <div class="diagnostics-status-strip"
        ><BChip :tone="statusTone(data.status)">{{ statusLabel(data.status) }}</BChip
        ><span v-for="item in summaryCards" :key="item.key"
          >{{ item.label }} <strong :class="item.value > 0 ? `is-${item.key}` : undefined">{{ item.value }}</strong></span
        ><small>{{ formatCapturedAt(data.capturedAt || '') }}</small></div
      >
      <BCard :title="t('serverManagement.diagnosticsPage.checklistTitle')">
        <template #extra>
          <div class="diagnostics-toolbar">
            <BButton size="small" @click="copyReport">
              <SvgIcon :src="icon.infrastructure.copy" size="14" />{{
                t('serverManagement.diagnosticsPage.copyReport')
              }}
            </BButton>
            <BButton size="small" @click="exportReport">
              <SvgIcon :src="icon.infrastructure.export" size="14" />{{
                t('serverManagement.diagnosticsPage.exportReport')
              }}
            </BButton>
          </div>
        </template>

        <BTabs
          variant="segment"
          :active-tab="filter"
          :options="filterOptions.map((item) => ({ key: item.value, label: item.label }))"
          @change="filter = $event as FilterValue"
        />
        <div v-if="!filteredChecks.length" class="diagnostics-empty">
          {{ t('serverManagement.diagnosticsPage.empty') }}
        </div>
        <BTable
          class="diagnostics-table"
          v-else-if="!bookmark.isMobile"
          :data="filteredChecks"
          :columns="columns"
          row-key="id"
          ><template #bodyCell="{ column, record }">
            <BChip v-if="column.key === 'state'" :tone="checkTone(record.state)">{{ stateLabel(record.state) }}</BChip>
            <template v-else-if="column.key === 'domain'">{{ moduleLabel(record.domain) }}</template>
            <div v-else-if="column.key === 'finding'" class="diagnostics-finding-cell"
              ><strong>{{ checkTitle(record) }}</strong
              ><p>{{ evidenceText(record) }}</p
              ><BButton type="text" size="small" @click="toggleEvidence(record.id)"
                >{{ t('serverManagement.workspace.rawEvidence') }} {{ expanded.has(record.id) ? '⌃' : '›' }}</BButton
              ><pre v-if="expanded.has(record.id)">{{ JSON.stringify(record.evidence, null, 2) }}</pre>
            </div>
            <span v-else-if="column.key === 'recommendation'" class="diagnostics-recommendation">{{
              recommendationText(record)
            }}</span>
            <BButton
              v-else-if="column.key === 'actions' && record.state !== 'pass'"
              type="text"
              size="small"
              @click="inspect(record)"
              >{{
                t(
                  record.domain === 'services'
                    ? 'serverManagement.workspace.viewService'
                    : 'serverManagement.workspace.viewCheck',
                )
              }}
              →</BButton
            >
          </template></BTable
        >
        <div v-else class="diagnostics-checks">
          <article
            v-for="check in filteredChecks"
            :key="check.id"
            class="diagnostics-check"
            :class="`is-${check.state}`"
          >
            <span class="diagnostics-check__marker" aria-hidden="true">
              <SvgIcon :src="moduleIcon(check.domain)" size="18" />
            </span>
            <div class="diagnostics-check__body">
              <div class="diagnostics-check__meta">
                <BChip :tone="checkTone(check.state)">{{ stateLabel(check.state) }}</BChip>
                <BChip v-if="check.state !== 'pass'" tone="neutral">{{ severityLabel(check.severity) }}</BChip>
                <span>{{ moduleLabel(check.domain) }}</span>
              </div>
              <strong>{{ checkTitle(check) }}</strong>
              <p>{{ evidenceText(check) }}</p>
              <small>{{ recommendationText(check) }}</small
              ><BButton type="text" size="small" @click="toggleEvidence(check.id)"
                >{{ t('serverManagement.workspace.rawEvidence') }} {{ expanded.has(check.id) ? '⌃' : '›' }}</BButton
              ><pre v-if="expanded.has(check.id)">{{ JSON.stringify(check.evidence, null, 2) }}</pre>
            </div>
            <BButton v-if="check.state !== 'pass'" size="small" @click="inspect(check)">
              {{
                t(
                  check.domain === 'services'
                    ? 'serverManagement.workspace.viewService'
                    : 'serverManagement.workspace.viewCheck',
                )
              }}
            </BButton>
          </article>
        </div>
        <div class="diagnostics-collection"
          ><BButton type="text" size="small" @click="sourcesOpen = !sourcesOpen"
            >{{ t('serverManagement.workspace.collectionDetails') }} {{ sourcesOpen ? '⌃' : '›'
            }}<span
              v-if="data.sources.some((source) => source.state !== 'available' || source.collectionErrorCount)"
              class="is-warning"
            >
              · {{ t('serverManagement.partialCollectionTitle') }}</span
            ></BButton
          ><div v-if="sourcesOpen" class="diagnostics-sources"
            ><article v-for="source in data.sources" :key="source.domain"
              ><strong>{{ moduleLabel(source.domain) }}</strong
              ><BChip :tone="source.state === 'available' && !source.collectionErrorCount ? 'success' : 'pending'">{{
                t(`serverManagement.diagnosticsPage.sourceState.${source.state}`)
              }}</BChip
              ><small
                >{{ source.capturedAt ? formatTime(source.capturedAt) : source.code }} ·
                {{ source.collectionErrorCount }}</small
              ></article
            ></div
          ></div
        >
        <p class="diagnostics-rerun-hint">{{ t('serverManagement.diagnosticsPage.rerunHint') }}</p>
      </BCard>
    </template>
  </InfraPage>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { formatAdminDateTime } from '@/utils/adminDateTime';
  import { useRouter } from 'vue-router';
  import {
    getInfraDiagnostics,
    type InfraDiagnosticCheck,
    type InfraDiagnosticDomain,
    type InfraDiagnosticState,
  } from '@/api/infraApi';
  import icon from '@/config/icon';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import { bookmarkStore } from '@/store';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { copyTextToClipboard } from '@/utils/clipboard';
  import { buildExportFileName, deliverGeneratedFile } from '@/utils/fileDelivery';
  import InfraPage from './InfraPage.vue';
  import InfraModuleHeader from './InfraModuleHeader.vue';
  import { useInfraSnapshot } from './useInfraSnapshot';
  import { formatBytes, formatPercent } from './serverManagementFormat';

  type FilterValue = 'actionable' | 'all' | InfraDiagnosticState;
  type ChipTone = 'success' | 'danger' | 'pending' | 'neutral';

  const { t, locale } = useI18n();
  const router = useRouter();
  const bookmark = bookmarkStore();
  const columns = computed(() => [
    { key: 'state', title: t('serverManagement.columns.state'), width: 'var(--ui-layout-90,90px)', ellipsis: false },
    {
      key: 'domain',
      title: t('serverManagement.workspace.checkDomain'),
      width: 'var(--ui-layout-100,100px)',
      ellipsis: false,
    },
    {
      key: 'finding',
      title: t('serverManagement.workspace.finding'),
      width: 'minmax(var(--ui-layout-220,220px),1fr)',
      ellipsis: false,
    },
    {
      key: 'recommendation',
      title: t('serverManagement.workspace.recommendation'),
      width: 'minmax(var(--ui-layout-240,240px),1fr)',
      ellipsis: false,
    },
    {
      key: 'actions',
      title: t('serverManagement.columns.actions'),
      width: 'var(--ui-layout-130,130px)',
      ellipsis: false,
    },
  ]);
  const { data, initialLoading, refreshing, error, refresh } = useInfraSnapshot(getInfraDiagnostics);
  const filter = ref<FilterValue>('actionable');
  const sourcesOpen = ref(false);
  const expanded = ref(new Set<string>());
  function toggleEvidence(id: string) {
    const next = new Set(expanded.value);
    next.has(id) ? next.delete(id) : next.add(id);
    expanded.value = next;
  }
  const stateOrder: Record<InfraDiagnosticState, number> = { fail: 0, warning: 1, unknown: 2, pass: 3 };
  const filterOptions = computed(() =>
    (['actionable', 'all', 'fail', 'warning', 'unknown', 'pass'] as const).map((value) => ({
      value,
      label: `${t(`serverManagement.diagnosticsPage.filters.${value}`)} · ${(data.value?.checks || []).filter((check) => value === 'all' || (value === 'actionable' ? check.state !== 'pass' : check.state === value)).length}`,
    })),
  );
  const summaryCards = computed(() => [
    {
      key: 'failed',
      label: t('serverManagement.diagnosticsPage.summary.failed'),
      value: data.value?.summary.failed || 0,
    },
    {
      key: 'warning',
      label: t('serverManagement.diagnosticsPage.summary.warning'),
      value: data.value?.summary.warning || 0,
    },
    {
      key: 'unknown',
      label: t('serverManagement.diagnosticsPage.summary.unknown'),
      value: data.value?.summary.unknown || 0,
    },
    {
      key: 'passed',
      label: t('serverManagement.diagnosticsPage.summary.passed'),
      value: data.value?.summary.passed || 0,
    },
  ]);
  const filteredChecks = computed(() =>
    [...(data.value?.checks || [])]
      .filter((check) => {
        if (filter.value === 'all') return true;
        if (filter.value === 'actionable') return check.state !== 'pass';
        return check.state === filter.value;
      })
      .sort((left, right) => stateOrder[left.state] - stateOrder[right.state]),
  );

  function moduleIcon(domain: InfraDiagnosticDomain) {
    return domain === 'services'
      ? icon.infrastructure.service
      : domain === 'storage'
        ? icon.infrastructure.storage
        : domain === 'security'
          ? icon.infrastructure.security
          : icon.infrastructure.overview;
  }
  function moduleLabel(domain: InfraDiagnosticDomain) {
    return t(`serverManagement.modules.${domain}`);
  }
  function statusTone(status: 'healthy' | 'attention' | 'critical'): ChipTone {
    return status === 'healthy' ? 'success' : status === 'critical' ? 'danger' : 'pending';
  }
  function checkTone(state: InfraDiagnosticState): ChipTone {
    return state === 'pass' ? 'success' : state === 'fail' ? 'danger' : state === 'warning' ? 'pending' : 'neutral';
  }
  function statusLabel(status: 'healthy' | 'attention' | 'critical') {
    return t(`serverManagement.diagnosticsPage.status.${status}`);
  }
  function stateLabel(state: InfraDiagnosticState) {
    return t(`serverManagement.diagnosticsPage.states.${state}`);
  }
  function severityLabel(severity: string) {
    return t(`serverManagement.diagnosticsPage.severity.${severity}`);
  }
  function securityFindingId(check: InfraDiagnosticCheck) {
    return check.id.startsWith('security.') && check.id !== 'security.snapshot' ? check.id.slice(9) : '';
  }
  function checkTitle(check: InfraDiagnosticCheck) {
    const findingId = securityFindingId(check);
    return findingId
      ? t(`serverManagement.securityPage.findings.${findingId}.title`)
      : t(
          `serverManagement.diagnosticsPage.checks.${check.id.startsWith('collection.') ? 'collection' : check.id}.title`,
        );
  }
  function recommendationText(check: InfraDiagnosticCheck) {
    const findingId = securityFindingId(check);
    return findingId
      ? t(`serverManagement.securityPage.findings.${findingId}.recommendation`)
      : t(
          `serverManagement.diagnosticsPage.checks.${check.id.startsWith('collection.') ? 'collection' : check.id}.recommendation`,
        );
  }
  function percentValue(value: unknown) {
    if (value === null || value === undefined || value === '') return '—';
    return Number.isFinite(Number(value)) ? formatPercent(Number(value)) : '—';
  }
  function evidenceText(check: InfraDiagnosticCheck) {
    const evidence = check.evidence || {};
    if (check.state === 'unknown' && !Object.values(evidence).some((value) => value != null))
      return t('serverManagement.diagnosticsPage.evidence.unavailable');
    if (check.id === 'system.cpu' || check.id === 'storage.ioBusy')
      return t('serverManagement.diagnosticsPage.evidence.percent', {
        percent: percentValue(evidence.percent).replace('%', ''),
      });
    if (check.id === 'system.memory')
      return t('serverManagement.diagnosticsPage.evidence.memory', {
        percent: percentValue(evidence.percent).replace('%', ''),
        used: formatBytes(evidence.usedBytes),
        total: formatBytes(evidence.totalBytes),
      });
    if (check.id === 'storage.capacity')
      return t('serverManagement.diagnosticsPage.evidence.capacity', {
        mount: evidence.mountPoint || '—',
        percent: percentValue(evidence.percent).replace('%', ''),
        free: formatBytes(evidence.freeBytes),
      });
    if (check.id === 'storage.inodes')
      return t('serverManagement.diagnosticsPage.evidence.inodes', {
        mount: evidence.mountPoint || '—',
        percent: percentValue(evidence.percent).replace('%', ''),
        free: evidence.freeInodes ?? '—',
      });
    if (check.id === 'services.health') {
      const unhealthy = Array.isArray(evidence.unhealthy) ? (evidence.unhealthy as string[]) : [];
      if (check.state === 'unknown' && !Number(evidence.total || 0))
        return t('serverManagement.diagnosticsPage.evidence.unavailable');
      return unhealthy.length
        ? t('serverManagement.diagnosticsPage.evidence.servicesUnhealthy', {
            count: unhealthy.length,
            services: unhealthy.map((id) => t(`serverManagement.serviceNames.${id}`)).join('、'),
          })
        : t('serverManagement.diagnosticsPage.evidence.servicesHealthy', { total: evidence.total ?? 0 });
    }
    if (check.id.startsWith('collection.'))
      return t('serverManagement.diagnosticsPage.evidence.collection', { count: evidence.count ?? 0 });
    const findingId = securityFindingId(check);
    if (findingId === 'unexpected-public-ports')
      return (
        (evidence.ports as string[] | undefined)?.join(', ') || t('serverManagement.securityPage.noUnexpectedPorts')
      );
    if (findingId === 'security-updates')
      return t('serverManagement.securityPage.updateEvidence', {
        pending: evidence.pending ?? '—',
        security: evidence.security ?? '—',
      });
    if (findingId === 'ssh-login-failures')
      return t('serverManagement.securityPage.loginEvidence', {
        failed: evidence.failures24h ?? '—',
        succeeded: evidence.successes24h ?? '—',
      });
    if (check.state === 'unknown') return t('serverManagement.workspace.evidenceUnknown');
    if (findingId === 'firewall')
      return `${evidence.provider || '—'} · ${t(evidence.value === 'enabled' ? 'serverManagement.workspace.enabled' : 'serverManagement.workspace.disabled')}`;
    const value = evidence.value;
    if (value === 'not-installed') return t('serverManagement.workspace.notInstalled');
    if (value === true || value === 'true' || value === 'yes' || value === 'enabled')
      return t('serverManagement.workspace.enabled');
    if (value === false || value === 'false' || value === 'no' || value === 'disabled')
      return t('serverManagement.workspace.disabled');
    return String(value ?? t('serverManagement.securityPage.notAvailable'));
  }
  function formatTime(value: string) {
    return formatAdminDateTime(value, locale.value);
  }
  function formatCapturedAt(value: string) {
    return t('serverManagement.diagnosticsPage.capturedAt', { time: formatTime(value) });
  }
  function inspect(check: InfraDiagnosticCheck) {
    const query: Record<string, string> = {};
    if (check.target.serviceId) query.service = check.target.serviceId;
    if (check.target.findingId) query.finding = check.target.findingId;
    void router.push({ path: `/serverManagement/${check.target.module}`, query });
  }
  function textReport() {
    if (!data.value) return '';
    const lines = [
      `${t('serverManagement.diagnosticsPage.title')} · ${statusLabel(data.value.status)}`,
      data.value.capturedAt ? formatCapturedAt(data.value.capturedAt) : '',
      `${t('serverManagement.diagnosticsPage.summary.failed')}: ${data.value.summary.failed} · ${t('serverManagement.diagnosticsPage.summary.warning')}: ${data.value.summary.warning} · ${t('serverManagement.diagnosticsPage.summary.unknown')}: ${data.value.summary.unknown} · ${t('serverManagement.diagnosticsPage.summary.passed')}: ${data.value.summary.passed}`,
      '',
      ...[...data.value.checks]
        .sort((left, right) => stateOrder[left.state] - stateOrder[right.state])
        .map(
          (check) =>
            `[${stateLabel(check.state)}] ${checkTitle(check)}\n${evidenceText(check)}\n${recommendationText(check)}`,
        ),
    ];
    return lines.filter((line, index) => line || index > 2).join('\n');
  }
  async function copyReport() {
    const copied = await copyTextToClipboard(textReport());
    copied
      ? message.success(t('serverManagement.diagnosticsPage.copySucceeded'))
      : message.error(t('serverManagement.diagnosticsPage.copyFailed'));
  }
  async function exportReport() {
    if (!data.value) return;
    try {
      const result = await deliverGeneratedFile({
        content: JSON.stringify(data.value, null, 2),
        fileName: buildExportFileName('lightnote-server-diagnostics', 'lightnote-server-diagnostics', 'json'),
        mimeType: 'application/json',
        preferShare: true,
      });
      if (result === 'unavailable') {
        const copied = await copyTextToClipboard(textReport());
        copied
          ? message.warning(t('serverManagement.diagnosticsPage.exportUnavailable'))
          : message.error(t('serverManagement.diagnosticsPage.copyFailed'));
      } else if (result !== 'cancelled') {
        message.success(t('serverManagement.diagnosticsPage.exportSucceeded'));
      }
    } catch {
      message.error(t('serverManagement.diagnosticsPage.copyFailed'));
    }
  }
</script>

<style scoped lang="less">
  .diagnostics-finding-cell,
  .diagnostics-recommendation {
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .diagnostics-finding-cell {
    padding: var(--ui-space-6, 6px) 0;
    min-width: 0;
  }
  .diagnostics-finding-cell p {
    margin: var(--ui-space-5, 5px) 0 0;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
  .diagnostics-finding-cell :deep(button) {
    padding-left: 0;
  }
  .diagnostics-recommendation {
    font-size: var(--ui-font-13, 13px);
    color: var(--desc-color);
    line-height: 1.6;
  }
  .diagnostics-collection {
    margin-top: var(--ui-space-12, 12px);
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    padding: var(--ui-space-8, 8px);
  }

  .diagnostics-state {
    min-height: var(--ui-layout-160, 160px);
    display: flex;
    align-items: center;
    gap: var(--ui-space-14, 14px);
  }
  .diagnostics-state div {
    flex: 1;
  }
  .diagnostics-state p {
    margin: var(--ui-space-5, 5px) 0 0;
    color: var(--desc-color);
  }
  .diagnostics-stale {
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    padding: var(--ui-space-10, 10px) var(--ui-space-12, 12px);
    border: 1px solid var(--warning-color, #ad6800);
    border-radius: 10px;
    color: var(--warning-color, #ad6800);
    background: var(--card-background);
  }
  .diagnostics-sources {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--ui-space-10, 10px);
  }
  .diagnostics-sources article {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--ui-space-7, 7px);
    padding: var(--ui-space-12, 12px);
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    background: var(--workspace-panel-bg-color);
  }
  .diagnostics-sources article.is-unavailable {
    border-color: var(--error-color, #d14343);
  }
  .diagnostics-sources article > div {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--ui-space-7, 7px);
  }
  .diagnostics-sources small {
    grid-column: 1 / 3;
    color: var(--desc-color);
  }
  .diagnostics-toolbar {
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
  }
  .diagnostics-checks {
    display: grid;
    gap: var(--ui-space-10, 10px);
  }
  .diagnostics-check {
    display: flex;
    align-items: flex-start;
    gap: var(--ui-space-14, 14px);
    padding: var(--ui-space-16, 16px) 0;
    border-bottom: 1px solid var(--surface-divider-color);
  }
  .diagnostics-check__marker {
    display: none;
  }
  .diagnostics-check__body {
    flex: 1;
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--ui-space-6, 6px) var(--ui-space-24, 24px);
  }
  .diagnostics-check__meta {
    grid-column: 1/-1;
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .diagnostics-check__body > strong {
    font-size: var(--ui-font-14, 14px);
  }
  .diagnostics-check__body p {
    grid-column: 1;
    grid-row: 3;
    margin: 0;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    overflow-wrap: anywhere;
  }
  .diagnostics-check__body > small {
    grid-column: 2;
    grid-row: 2/4;
    line-height: 1.6;
    font-size: var(--ui-font-13, 13px);
    color: var(--desc-color);
  }
  .diagnostics-check__body > :deep(button) {
    justify-self: start;
  }
  pre {
    grid-column: 1/-1;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .diagnostics-status-strip {
    display: flex;
    align-items: center;
    gap: var(--ui-space-24, 24px);
    flex-wrap: wrap;
    padding: var(--ui-space-14, 14px) var(--ui-space-16, 16px);
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
  }
  .diagnostics-status-strip small {
    margin-left: auto;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .is-warning {
    color: var(--warning-color);
  }
  .diagnostics-status-strip .is-failed {
    color: var(--error-color);
  }
  .diagnostics-collection {
    font-size: var(--ui-font-12, 12px);
  }
  @media (max-width: 767px) {
    .diagnostics-check__body {
      display: flex;
      flex-direction: column;
    }
    .diagnostics-check {
      flex-wrap: wrap;
    }
    .diagnostics-status-strip {
      gap: var(--ui-space-12, 12px);
    }
  }
  .diagnostics-rerun-hint {
    margin: var(--ui-space-14, 14px) 0 0;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    text-align: right;
  }
  @media (max-width: 1050px) {
    .diagnostics-sources {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 767px) {
    .diagnostics-sources {
      grid-template-columns: 1fr;
    }
    .diagnostics-toolbar {
      width: 100%;
      flex-wrap: wrap;
    }
    .diagnostics-check {
      grid-template-columns: 34px minmax(0, 1fr);
      align-items: start;
    }
    .diagnostics-check > :deep(.b_btn) {
      grid-column: 2;
      justify-self: start;
    }
    .diagnostics-rerun-hint {
      text-align: left;
    }
  }
</style>
