<template>
  <main class="infra-module-page">
    <div class="infra-module-content">
      <InfraModuleHeader
        :title="t('serverManagement.diagnosticsPage.title')"
        :subtitle="t('serverManagement.diagnosticsPage.subtitle')"
        :icon-src="icon.infrastructure.diagnostics"
        :cadence="t('serverManagement.diagnosticsPage.cadence')"
        :loading="refreshing"
        :refresh-label="t('serverManagement.diagnosticsPage.run')"
        @refresh="refresh"
      />

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

        <section class="diagnostics-summary">
          <BCard class="diagnostics-summary__status" :class="`is-${data.status}`">
            <span class="diagnostics-summary__status-icon">
              <SvgIcon
                :src="data.status === 'healthy' ? icon.infrastructure.security : icon.message.warning"
                size="28"
                aria-hidden="true"
              />
            </span>
            <div>
              <BChip :tone="statusTone(data.status)">{{ statusLabel(data.status) }}</BChip>
              <strong>{{ statusLabel(data.status) }}</strong>
              <p>{{ t(`serverManagement.diagnosticsPage.statusDescription.${data.status}`) }}</p>
              <small v-if="data.capturedAt">{{ formatCapturedAt(data.capturedAt) }}</small>
            </div>
          </BCard>
          <BCard v-for="item in summaryCards" :key="item.key" class="diagnostics-summary__item">
            <span>{{ item.label }}</span>
            <strong :class="`is-${item.key}`">{{ item.value }}</strong>
          </BCard>
        </section>

        <BCard :title="t('serverManagement.diagnosticsPage.sourcesTitle')">
          <div class="diagnostics-sources">
            <article v-for="source in data.sources" :key="source.domain" :class="`is-${source.state}`">
              <div>
                <SvgIcon :src="moduleIcon(source.domain)" size="17" aria-hidden="true" />
                <strong>{{ moduleLabel(source.domain) }}</strong>
              </div>
              <BChip :tone="source.state === 'available' ? 'success' : 'danger'">
                {{ t(`serverManagement.diagnosticsPage.sourceState.${source.state}`) }}
              </BChip>
              <small v-if="source.collectionErrorCount">
                {{ t('serverManagement.diagnosticsPage.partialSource', { count: source.collectionErrorCount }) }}
              </small>
              <small v-else-if="source.capturedAt">{{ formatTime(source.capturedAt) }}</small>
              <small v-else>{{ source.code || t('serverManagement.unknown') }}</small>
            </article>
          </div>
        </BCard>

        <BCard :title="t('serverManagement.diagnosticsPage.checklistTitle')">
          <template #extra>
            <div class="diagnostics-toolbar">
              <BSelect
                :value="filter"
                :options="filterOptions"
                :aria-label="t('serverManagement.diagnosticsPage.filterLabel')"
                @change="filter = String($event)"
              />
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

          <div v-if="!filteredChecks.length" class="diagnostics-empty">
            {{ t('serverManagement.diagnosticsPage.empty') }}
          </div>
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
                <small>{{ recommendationText(check) }}</small>
              </div>
              <BButton v-if="check.state !== 'pass'" size="small" @click="inspect(check)">
                {{ t('serverManagement.diagnosticsPage.inspect') }}
              </BButton>
            </article>
          </div>
          <p class="diagnostics-rerun-hint">{{ t('serverManagement.diagnosticsPage.rerunHint') }}</p>
        </BCard>
      </template>
    </div>
  </main>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
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
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { copyTextToClipboard } from '@/utils/clipboard';
  import { buildExportFileName, deliverGeneratedFile } from '@/utils/fileDelivery';
  import InfraModuleHeader from './InfraModuleHeader.vue';
  import { useInfraSnapshot } from './useInfraSnapshot';
  import { formatBytes, formatPercent } from './serverManagementFormat';

  type FilterValue = 'actionable' | 'all' | InfraDiagnosticState;
  type ChipTone = 'success' | 'danger' | 'pending' | 'neutral';

  const { t, locale } = useI18n();
  const router = useRouter();
  const { data, initialLoading, refreshing, error, refresh } = useInfraSnapshot(getInfraDiagnostics);
  const filter = ref<FilterValue>('actionable');
  const stateOrder: Record<InfraDiagnosticState, number> = { fail: 0, warning: 1, unknown: 2, pass: 3 };
  const filterOptions = computed(() =>
    (['actionable', 'all', 'fail', 'warning', 'unknown', 'pass'] as const).map((value) => ({
      value,
      label: t(`serverManagement.diagnosticsPage.filters.${value}`),
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
    if (findingId === 'firewall') return `${evidence.provider || '—'} · ${evidence.value || 'unknown'}`;
    return String(evidence.value ?? t('serverManagement.securityPage.notAvailable'));
  }
  function formatTime(value: string) {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleString(locale.value, { hour12: false }) : value;
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
  .diagnostics-state {
    min-height: 160px;
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .diagnostics-state div {
    flex: 1;
  }
  .diagnostics-state p {
    margin: 5px 0 0;
    color: var(--desc-color);
  }
  .diagnostics-stale {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border: 1px solid var(--warning-color, #ad6800);
    border-radius: 10px;
    color: var(--warning-color, #ad6800);
    background: var(--card-background);
  }
  .diagnostics-summary {
    display: grid;
    grid-template-columns: minmax(280px, 2fr) repeat(4, minmax(100px, 0.7fr));
    gap: 12px;
  }
  .diagnostics-summary__status {
    display: flex;
    align-items: center;
    gap: 14px;
    border-color: var(--success-color, #27965b);
  }
  .diagnostics-summary__status.is-attention {
    border-color: var(--warning-color, #ad6800);
  }
  .diagnostics-summary__status.is-critical {
    border-color: var(--error-color, #d14343);
  }
  .diagnostics-summary__status-icon {
    width: 50px;
    height: 50px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    border: 1px solid currentColor;
    border-radius: 50%;
    color: var(--success-color, #27965b);
  }
  .is-attention .diagnostics-summary__status-icon {
    color: var(--warning-color, #ad6800);
  }
  .is-critical .diagnostics-summary__status-icon {
    color: var(--error-color, #d14343);
  }
  .diagnostics-summary__status > div {
    min-width: 0;
    display: grid;
    gap: 5px;
  }
  .diagnostics-summary__status strong {
    font-size: 20px;
  }
  .diagnostics-summary__status p {
    margin: 0;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.5;
  }
  .diagnostics-summary__status small {
    color: var(--desc-color);
    font-size: 11px;
  }
  .diagnostics-summary__item {
    display: grid;
    align-content: center;
    gap: 8px;
  }
  .diagnostics-summary__item span {
    color: var(--desc-color);
    font-size: 12px;
  }
  .diagnostics-summary__item strong {
    font-size: 26px;
    font-variant-numeric: tabular-nums;
  }
  .diagnostics-summary__item strong.is-failed {
    color: var(--error-color, #d14343);
  }
  .diagnostics-summary__item strong.is-warning {
    color: var(--warning-color, #ad6800);
  }
  .diagnostics-summary__item strong.is-passed {
    color: var(--success-color, #27965b);
  }
  .diagnostics-sources {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }
  .diagnostics-sources article {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 7px;
    padding: 12px;
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
    gap: 7px;
  }
  .diagnostics-sources small {
    grid-column: 1 / 3;
    color: var(--desc-color);
  }
  .diagnostics-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .diagnostics-toolbar :deep(.b-select) {
    min-width: 132px;
  }
  .diagnostics-checks {
    display: grid;
    gap: 10px;
  }
  .diagnostics-check {
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding: 14px;
    border: 1px solid var(--surface-border-color);
    border-left-width: 3px;
    border-radius: 11px;
    background: var(--workspace-panel-bg-color);
  }
  .diagnostics-check.is-pass {
    border-left-color: var(--success-color, #27965b);
  }
  .diagnostics-check.is-warning {
    border-left-color: var(--warning-color, #ad6800);
  }
  .diagnostics-check.is-fail {
    border-left-color: var(--error-color, #d14343);
  }
  .diagnostics-check__marker {
    width: 34px;
    height: 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--surface-border-color);
    border-radius: 9px;
    color: var(--primary-color);
    background: var(--card-background);
  }
  .diagnostics-check__body {
    min-width: 0;
    display: grid;
    gap: 6px;
  }
  .diagnostics-check__meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }
  .diagnostics-check__meta > span:last-child {
    color: var(--desc-color);
    font-size: 11px;
  }
  .diagnostics-check__body p {
    margin: 0;
    font-size: 13px;
  }
  .diagnostics-check__body small {
    color: var(--desc-color);
    line-height: 1.5;
  }
  .diagnostics-empty {
    min-height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--desc-color);
  }
  .diagnostics-rerun-hint {
    margin: 14px 0 0;
    color: var(--desc-color);
    font-size: 12px;
    text-align: right;
  }
  html.light-note-mobile-rendering .diagnostics-summary__status-icon {
    box-shadow: none;
  }
  @media (max-width: 1050px) {
    .diagnostics-summary {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
    .diagnostics-summary__status {
      grid-column: 1 / 5;
    }
    .diagnostics-sources {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 760px) {
    .infra-module-content {
      width: calc(100% - 24px);
      padding: 18px 0 32px;
      gap: 14px;
    }
    .diagnostics-summary {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .diagnostics-summary__status {
      grid-column: 1 / 3;
      align-items: flex-start;
    }
    .diagnostics-sources {
      grid-template-columns: 1fr;
    }
    .diagnostics-toolbar {
      width: 100%;
      flex-wrap: wrap;
    }
    .diagnostics-toolbar :deep(.b-select) {
      width: 100%;
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
