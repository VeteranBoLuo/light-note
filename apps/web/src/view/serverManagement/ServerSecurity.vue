<template>
  <main class="infra-module-page">
    <div class="infra-module-content">
      <InfraModuleHeader
        :title="t('serverManagement.securityPage.title')"
        :subtitle="t('serverManagement.securityPage.subtitle')"
        :icon-src="icon.infrastructure.security"
        :cadence="t('serverManagement.securityPage.cadence')"
        :loading="refreshing"
        :refresh-label="t('common.refresh')"
        @refresh="refresh"
      />
      <BLoading v-if="initialLoading" inline :loading="true" :title="t('serverManagement.loading')" />
      <BCard v-else-if="!data" class="infra-state-card" variant="panel">
        <SvgIcon :src="icon.message.warning" size="24" /><div
          ><strong>{{ t('serverManagement.snapshotUnavailable') }}</strong
          ><p>{{ error }}</p></div
        >
        <BButton type="primary" @click="refresh">{{ t('serverManagement.retry') }}</BButton>
      </BCard>
      <template v-else>
        <div v-if="error" class="infra-stale-warning" role="status"
          ><SvgIcon :src="icon.message.warning" size="16" />{{ t('serverManagement.staleSnapshot') }}</div
        >
        <section class="security-summary">
          <BCard class="security-summary__main">
            <span class="security-summary__icon" :class="{ 'has-risk': data.summary.failed > 0 }">
              <SvgIcon :src="data.summary.failed > 0 ? icon.message.warning : icon.infrastructure.security" size="28" />
            </span>
            <div>
              <strong>{{
                data.summary.failed
                  ? t('serverManagement.securityPage.riskFound', { count: data.summary.failed })
                  : t('serverManagement.securityPage.noKnownRisk')
              }}</strong>
              <p>{{ t('serverManagement.securityPage.noScoreExplanation') }}</p>
            </div>
          </BCard>
          <BCard v-for="item in summaryCards" :key="item.key" class="security-summary__stat">
            <span>{{ item.label }}</span
            ><strong>{{ item.value }}</strong>
          </BCard>
        </section>

        <BCard :title="t('serverManagement.securityPage.checksTitle')">
          <template #extra>
            <BSelect
              class="security-filter"
              :value="filter"
              :options="filterOptions"
              @change="filter = String($event)"
            />
          </template>
          <div class="security-checks">
            <article
              v-for="finding in filteredFindings"
              :key="finding.id"
              class="security-check"
              :class="`is-${finding.state}`"
            >
              <div class="security-check__heading">
                <BChip :tone="findingTone(finding.state)">{{ findingStateLabel(finding.state) }}</BChip>
                <BChip v-if="finding.state === 'fail'" :tone="finding.severity === 'high' ? 'danger' : 'pending'">{{
                  severityLabel(finding.severity)
                }}</BChip>
              </div>
              <strong>{{ findingText(finding.id, 'title') }}</strong>
              <p>{{ evidenceText(finding) }}</p>
              <small>{{ findingText(finding.id, 'recommendation') }}</small>
            </article>
            <div v-if="!filteredFindings.length" class="security-empty">{{
              t('serverManagement.securityPage.filterEmpty')
            }}</div>
          </div>
        </BCard>

        <section class="security-detail-grid">
          <BCard :title="t('serverManagement.securityPage.sshActivityTitle')">
            <template #extra><span class="security-caption">24h</span></template>
            <div class="ssh-summary">
              <div
                ><span>{{ t('serverManagement.securityPage.successes') }}</span
                ><strong>{{ data.ssh.successes24h ?? '—' }}</strong></div
              >
              <div
                ><span>{{ t('serverManagement.securityPage.failures') }}</span
                ><strong class="is-danger">{{ data.ssh.failures24h ?? '—' }}</strong></div
              >
              <div
                ><span>{{ t('serverManagement.securityPage.sshPort') }}</span
                ><strong>{{ data.ssh.port ?? '—' }}</strong></div
              >
            </div>
            <div v-if="!data.ssh.recent.length" class="security-empty">{{
              t('serverManagement.securityPage.noLoginEvents')
            }}</div>
            <ul v-else class="ssh-events">
              <li
                v-for="entry in data.ssh.recent.slice(0, 8)"
                :key="`${entry.occurredAt}-${entry.sourceAddress}-${entry.user}`"
              >
                <BChip :tone="entry.outcome === 'succeeded' ? 'success' : 'danger'">{{
                  entry.outcome === 'succeeded'
                    ? t('serverManagement.securityPage.loginSucceeded')
                    : t('serverManagement.securityPage.loginFailed')
                }}</BChip>
                <span>{{ entry.sourceAddress || '—' }}</span
                ><span>{{ entry.user || '—' }}</span
                ><time>{{ formatTime(entry.occurredAt) }}</time>
              </li>
            </ul>
          </BCard>
          <BCard :title="t('serverManagement.securityPage.publicPortsTitle')">
            <template #extra
              ><span class="security-caption">{{ publicPorts.length }}</span></template
            >
            <div v-if="!publicPorts.length" class="security-empty">{{
              t('serverManagement.securityPage.noPublicPorts')
            }}</div>
            <ul v-else class="public-ports">
              <li v-for="port in publicPorts" :key="`${port.protocol}-${port.address}-${port.port}`">
                <span><SvgIcon :src="icon.infrastructure.network" size="15" />{{ port.protocol.toUpperCase() }}</span>
                <strong>{{ port.port }}</strong
                ><small>{{ port.address }}</small>
              </li>
            </ul>
          </BCard>
        </section>
      </template>
    </div>
  </main>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { getInfraSecurity, type InfraSecurityFinding, type InfraSecurityFindingState } from '@/api/infraApi';
  import icon from '@/config/icon';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import InfraModuleHeader from './InfraModuleHeader.vue';
  import { useInfraSnapshot } from './useInfraSnapshot';

  const { t, locale } = useI18n();
  const { data, initialLoading, refreshing, error, refresh } = useInfraSnapshot(getInfraSecurity);
  const filter = ref('all');
  const filterOptions = computed(() => [
    { value: 'all', label: t('serverManagement.securityPage.filters.all') },
    { value: 'fail', label: t('serverManagement.securityPage.filters.fail') },
    { value: 'pass', label: t('serverManagement.securityPage.filters.pass') },
    { value: 'unknown', label: t('serverManagement.securityPage.filters.unknown') },
  ]);
  const filteredFindings = computed(() =>
    (data.value?.findings || []).filter((item) => filter.value === 'all' || item.state === filter.value),
  );
  const publicPorts = computed(() => (data.value?.listeningPorts || []).filter((item) => item.exposure === 'public'));
  const summaryCards = computed(() => [
    { key: 'passed', label: t('serverManagement.securityPage.passed'), value: String(data.value?.summary.passed || 0) },
    {
      key: 'unknown',
      label: t('serverManagement.securityPage.unknown'),
      value: String(data.value?.summary.unknown || 0),
    },
    {
      key: 'updates',
      label: t('serverManagement.securityPage.securityUpdates'),
      value: String(data.value?.updates.security ?? '—'),
    },
  ]);
  function findingTone(state: InfraSecurityFindingState): 'success' | 'danger' | 'neutral' {
    return state === 'pass' ? 'success' : state === 'fail' ? 'danger' : 'neutral';
  }
  function findingStateLabel(state: InfraSecurityFindingState) {
    return t(`serverManagement.securityPage.states.${state}`);
  }
  function severityLabel(severity: string) {
    return t(`serverManagement.securityPage.severity.${severity}`);
  }
  function findingText(id: string, field: 'title' | 'recommendation') {
    return t(`serverManagement.securityPage.findings.${id}.${field}`);
  }
  function evidenceText(finding: InfraSecurityFinding) {
    const evidence = finding.evidence || {};
    if (finding.id === 'unexpected-public-ports')
      return (
        (evidence.ports as string[] | undefined)?.join(', ') || t('serverManagement.securityPage.noUnexpectedPorts')
      );
    if (finding.id === 'security-updates')
      return t('serverManagement.securityPage.updateEvidence', {
        pending: evidence.pending ?? '—',
        security: evidence.security ?? '—',
      });
    if (finding.id === 'ssh-login-failures')
      return t('serverManagement.securityPage.loginEvidence', {
        failed: evidence.failures24h ?? '—',
        succeeded: evidence.successes24h ?? '—',
      });
    if (finding.id === 'firewall') return `${evidence.provider || '—'} · ${evidence.value || 'unknown'}`;
    return String(evidence.value ?? t('serverManagement.securityPage.notAvailable'));
  }
  function formatTime(value: string) {
    const date = new Date(value);
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
  .security-summary {
    display: grid;
    grid-template-columns: minmax(0, 2fr) repeat(3, minmax(120px, 1fr));
    gap: 14px;
  }
  .security-summary__main {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .security-summary__main p {
    margin: 5px 0 0;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.5;
  }
  .security-summary__icon {
    width: 46px;
    height: 46px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--success-color, #27965b);
    border-radius: 50%;
    color: var(--success-color, #27965b);
  }
  .security-summary__icon.has-risk {
    border-color: var(--error-color, #d14343);
    color: var(--error-color, #d14343);
  }
  .security-summary__stat {
    display: grid;
    gap: 8px;
  }
  .security-summary__stat span {
    color: var(--desc-color);
    font-size: 12px;
  }
  .security-summary__stat strong {
    font-size: 25px;
  }
  .security-filter {
    width: 128px;
  }
  .security-checks {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  .security-check {
    min-width: 0;
    display: grid;
    gap: 8px;
    padding: 15px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--card-background);
  }
  .security-check.is-fail {
    border-color: var(--error-color, #d14343);
  }
  .security-check.is-pass {
    border-color: var(--success-color, #27965b);
  }
  .security-check__heading {
    display: flex;
    gap: 6px;
  }
  .security-check p,
  .security-check small {
    margin: 0;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.55;
  }
  .security-check small {
    padding-top: 7px;
    border-top: 1px solid var(--surface-divider-color);
  }
  .security-detail-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(300px, 1fr);
    gap: 18px;
  }
  .security-caption {
    color: var(--desc-color);
    font-size: 12px;
  }
  .ssh-summary {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    margin-bottom: 14px;
  }
  .ssh-summary div {
    display: grid;
    gap: 4px;
    padding: 0 14px;
    border-left: 1px solid var(--surface-divider-color);
  }
  .ssh-summary div:first-child {
    padding-left: 0;
    border-left: 0;
  }
  .ssh-summary span {
    color: var(--desc-color);
    font-size: 11px;
  }
  .ssh-summary strong {
    font-size: 18px;
  }
  .ssh-summary strong.is-danger {
    color: var(--error-color, #d14343);
  }
  .ssh-events,
  .public-ports {
    display: grid;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .ssh-events li {
    display: grid;
    grid-template-columns: 76px minmax(100px, 1fr) minmax(70px, 0.7fr) auto;
    align-items: center;
    gap: 8px;
    font-size: 12px;
  }
  .ssh-events time,
  .public-ports small {
    color: var(--desc-color);
  }
  .public-ports {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .public-ports li {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 4px 10px;
    padding: 10px 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
  }
  .public-ports span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--desc-color);
  }
  .public-ports small {
    grid-column: 1 / -1;
  }
  .security-empty {
    min-height: 90px;
    display: grid;
    place-items: center;
    color: var(--desc-color);
  }
  @media (max-width: 1000px) {
    .security-summary {
      grid-template-columns: repeat(3, 1fr);
    }
    .security-summary__main {
      grid-column: 1 / -1;
    }
    .security-detail-grid {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 760px) {
    .infra-module-content {
      width: calc(100% - 24px);
      padding: 18px 0 32px;
      gap: 14px;
    }
    .security-summary {
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
    }
    .security-checks {
      grid-template-columns: 1fr;
    }
    .ssh-events li {
      grid-template-columns: 72px minmax(0, 1fr);
    }
    .ssh-events li span:nth-of-type(2),
    .ssh-events time {
      grid-column: 2;
    }
    .public-ports {
      grid-template-columns: 1fr;
    }
  }
</style>
