<template>
  <InfraPage>
    <template #header>
      <InfraModuleHeader
        :mobile-title="t('serverManagement.modules.security')"
        :title="t('serverManagement.securityPage.title')"
        :cadence="t('serverManagement.securityPage.cadence')"
        :loading="refreshing"
        :refresh-label="t('common.refresh')"
        @refresh="refresh"
      />
    </template>
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
      <div class="security-status-strip"
        ><strong :class="{ 'is-danger': data.summary.failed > 0 }">{{
          t('serverManagement.workspace.securityRisks', { count: data.summary.failed })
        }}</strong
        ><span>{{ t('serverManagement.workspace.pendingChecks', { count: data.summary.unknown }) }}</span
        ><span>{{ t('serverManagement.securityPage.passed') }} {{ data.summary.passed }}</span
        ><small>{{ formatTime(data.capturedAt) }}</small></div
      >
      <div v-if="data.collectionErrors.length" class="infra-stale-warning"
        >{{ t('serverManagement.partialCollectionTitle') }} ·
        {{ data.collectionErrors.map((item) => item.code).join(' · ') }}</div
      >
      <div class="security-workspace"
        ><BCard :title="t('serverManagement.securityPage.checksTitle')" class="security-findings">
          <BTabs variant="segment" :active-tab="filter" :options="securityFilters" @change="filter = $event" />
          <section v-for="group in findingGroups" :key="group.state">
            <div class="security-group-heading"
              ><BButton
                v-if="group.state === 'pass'"
                type="text"
                :aria-expanded="passedOpen"
                @click="passedOpen = !passedOpen"
                >{{ findingStateLabel(group.state) }} · {{ group.items.length }} {{ passedOpen ? '⌃' : '›' }}</BButton
              ><strong v-else
                >{{ group.state === 'unknown' ? '? ' : '' }}{{ findingStateLabel(group.state) }} ·
                {{ group.items.length }}</strong
              ></div
            >
            <template v-if="group.state !== 'pass' || passedOpen">
              <article
                v-for="finding in group.items"
                :key="finding.id"
                :id="`security-finding-${finding.id}`"
                class="security-finding-row"
              >
                <div class="security-finding-row__heading"
                  ><strong>{{ findingText(finding.id, 'title') }}</strong
                  ><BChip v-if="finding.state === 'fail'" :tone="finding.severity === 'high' ? 'danger' : 'pending'">{{
                    severityLabel(finding.severity)
                  }}</BChip
                  ><BChip v-if="finding.state === 'unknown'" tone="neutral"
                    >? {{ findingStateLabel(finding.state) }}</BChip
                  ></div
                >
                <p>{{ evidenceText(finding) }}</p
                ><p class="security-recommendation">{{ findingText(finding.id, 'recommendation') }}</p>
                <div class="security-finding-actions"
                  ><BButton type="text" size="small" @click="toggleEvidence(finding.id)"
                    >{{ t('serverManagement.workspace.rawEvidence') }}
                    {{ expanded.has(finding.id) ? '⌃' : '›' }}</BButton
                  ><BButton
                    v-if="finding.state !== 'pass'"
                    type="text"
                    size="small"
                    @click="copyRecommendation(finding)"
                    >{{ t('serverManagement.securityPage.copyRecommendation') }}</BButton
                  ></div
                >
                <pre v-if="expanded.has(finding.id)">{{ JSON.stringify(finding.evidence, null, 2) }}</pre>
              </article>
              <p v-if="!group.items.length" class="security-caption">{{
                t('serverManagement.securityPage.filterEmpty')
              }}</p>
            </template>
          </section>
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
            <BButton v-if="data.ssh.recent.length > 3" type="text" size="small" @click="allLogins = !allLogins">{{
              t(allLogins ? 'serverManagement.workspace.collapseList' : 'serverManagement.workspace.expandList')
            }}</BButton>
            <ul v-if="data.ssh.recent.length" class="ssh-events">
              <li
                v-for="entry in data.ssh.recent.slice(0, allLogins ? data.ssh.recent.length : 3)"
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
          <BCard :title="t('serverManagement.workspace.listeningInfo')">
            <BButton v-if="data.listeningPorts.length" type="text" size="small" @click="allPorts = !allPorts">{{
              t(allPorts ? 'serverManagement.workspace.collapseList' : 'serverManagement.workspace.expandList')
            }}</BButton>
            <template #extra
              ><span class="security-caption">{{ publicPorts.length }}</span></template
            >
            <div v-if="!publicPorts.length" class="security-empty">{{
              t('serverManagement.securityPage.noPublicPorts')
            }}</div>
            <BTable v-else class="port-table" :data="publicPorts" :columns="portColumns" row-key="key"
              ><template #bodyCell="{ column, record }">
                <span v-if="column.key === 'port'" class="port-table__port"
                  ><strong>{{ record.port }}</strong
                  ><small>{{ record.protocol.toUpperCase() }}</small></span
                >
                <code v-else-if="column.key === 'address'">{{ record.address }}</code>
                <BChip v-else-if="column.key === 'reach'" :tone="record.reach.tone">{{
                  t(`serverManagement.securityPage.portReach.${record.reach.key}`)
                }}</BChip>
              </template></BTable
            >
          </BCard>
        </section>
      </div>
    </template>
  </InfraPage>
</template>

<script setup lang="ts">
  import { computed, nextTick, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { formatAdminDateTime } from '@/utils/adminDateTime';
  import { useRoute } from 'vue-router';
  import type { HostAgentListeningPort } from '@lightnote/shared/host-agent-protocol';
  import { getInfraSecurity, type InfraSecurityFinding, type InfraSecurityFindingState } from '@/api/infraApi';
  import icon from '@/config/icon';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import InfraPage from './InfraPage.vue';
  import InfraModuleHeader from './InfraModuleHeader.vue';
  import { useInfraSnapshot } from './useInfraSnapshot';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { copyTextToClipboard } from '@/utils/clipboard';

  const { t, locale } = useI18n();
  const route = useRoute();
  const { data, initialLoading, refreshing, error, refresh } = useInfraSnapshot(getInfraSecurity);
  const filter = ref('all');
  const passedOpen = ref(false);
  const allLogins = ref(false);
  const allPorts = ref(false);
  const expanded = ref(new Set<string>());
  const findingGroups = computed(() =>
    (['fail', 'unknown', 'pass'] as const)
      .filter((state) => filter.value === 'all' || filter.value === state)
      .map((state) => ({ state, items: (data.value?.findings || []).filter((item) => item.state === state) }))
      .filter((group) => group.items.length > 0 || filter.value !== 'all'),
  );
  function toggleEvidence(id: string) {
    const next = new Set(expanded.value);
    next.has(id) ? next.delete(id) : next.add(id);
    expanded.value = next;
  }
  const securityFilters = computed(() =>
    (['fail', 'unknown', 'all'] as const).map((key) => ({
      key,
      label: `${t(`serverManagement.securityPage.filters.${key}`)} · ${key === 'all' ? data.value?.findings.length || 0 : data.value?.findings.filter((item) => item.state === key).length || 0}`,
    })),
  );
  type PortReachTone = 'neutral' | 'success' | 'danger' | 'pending';
  // “公网暴露”沿用后端安全检查的判定结果，前端不重复维护端口白名单。
  const exposedPortLabels = computed(
    () =>
      new Set(
        (data.value?.findings.find((item) => item.id === 'unexpected-public-ports')?.evidence.ports as
          | string[]
          | undefined) || [],
      ),
  );
  function portReach(port: HostAgentListeningPort): { key: string; tone: PortReachTone } {
    if (port.exposure !== 'public') return { key: port.exposure, tone: 'neutral' };
    if (exposedPortLabels.value.has(`${port.protocol}/${port.port}`)) return { key: 'exposed', tone: 'danger' };
    if (port.firewall === 'blocked') return { key: 'blocked', tone: 'success' };
    if (port.firewall === 'restricted') return { key: 'restricted', tone: 'pending' };
    return { key: port.firewall === 'allowed' ? 'allowed' : 'unknown', tone: 'neutral' };
  }
  const publicPorts = computed(() =>
    (data.value?.listeningPorts || [])
      .filter((item) => allPorts.value || item.exposure === 'public')
      .map((item) => ({ ...item, key: `${item.protocol}-${item.address}-${item.port}`, reach: portReach(item) }))
      .sort((left, right) => Number(right.reach.key === 'exposed') - Number(left.reach.key === 'exposed') || left.port - right.port),
  );
  const portColumns = computed(() => [
    {
      key: 'port',
      title: t('serverManagement.securityPage.portColumns.port'),
      width: 'var(--ui-layout-48, 48px)',
      ellipsis: false,
    },
    {
      key: 'address',
      title: t('serverManagement.securityPage.portColumns.address'),
      width: 'minmax(0, 1fr)',
      ellipsis: false,
    },
    {
      key: 'reach',
      title: t('serverManagement.securityPage.portColumns.reach'),
      width: 'var(--ui-layout-88, 88px)',
      ellipsis: false,
    },
  ]);
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
    if (finding.state === 'unknown') return t('serverManagement.workspace.evidenceUnknown');
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
    if (finding.id === 'firewall')
      return `${evidence.provider || '—'} · ${t(evidence.value === 'enabled' ? 'serverManagement.workspace.enabled' : evidence.value === 'disabled' ? 'serverManagement.workspace.disabled' : 'serverManagement.workspace.evidenceUnknown')}`;
    const value = evidence.value;
    if (value === 'not-installed') return t('serverManagement.workspace.notInstalled');
    if (value === true || value === 'true' || value === 'yes' || value === 'enabled')
      return t('serverManagement.workspace.enabled');
    if (value === false || value === 'false' || value === 'no' || value === 'disabled')
      return t('serverManagement.workspace.disabled');
    return String(value ?? t('serverManagement.securityPage.notAvailable'));
  }
  async function copyRecommendation(finding: InfraSecurityFinding) {
    const copied = await copyTextToClipboard(
      `${findingText(finding.id, 'title')}\n${evidenceText(finding)}\n${findingText(finding.id, 'recommendation')}`,
    );
    copied
      ? message.success(t('serverManagement.securityPage.recommendationCopied'))
      : message.error(t('serverManagement.securityPage.recommendationCopyFailed'));
  }
  function formatTime(value: string) {
    return formatAdminDateTime(value, locale.value);
  }
  watch(
    [() => route.query.finding, () => data.value],
    async ([findingId]) => {
      const id = String(findingId || '');
      if (!id || !data.value) return;
      filter.value = 'all';
      passedOpen.value = true;
      expanded.value = new Set([...expanded.value, id]);
      await nextTick();
      document.getElementById(`security-finding-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
    { immediate: true },
  );
</script>

<style scoped lang="less">
  .security-group-heading {
    margin-top: var(--ui-space-16, 16px);
    font-weight: 600;
  }

  .security-status-strip {
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--ui-space-24, 24px);
    padding: var(--ui-space-12, 12px) var(--ui-space-16, 16px);
  }
  .security-status-strip .is-danger {
    color: var(--error-color);
  }
  .security-status-strip small {
    margin-left: auto;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .security-workspace {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(var(--ui-layout-280, 280px), 1fr);
    gap: var(--ui-space-18, 18px);
    align-items: start;
  }
  .security-findings {
    display: grid;
    gap: var(--ui-space-14, 14px);
    min-width: 0;
  }
  .security-finding-row {
    padding: var(--ui-space-16, 16px) 0;
    border-bottom: 1px solid var(--surface-divider-color);
  }
  .security-finding-row:last-child {
    border: 0;
    padding-bottom: 0;
  }
  .security-finding-row__heading {
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    flex-wrap: wrap;
  }
  .security-finding-row p {
    margin: var(--ui-space-8, 8px) 0;
    line-height: 1.6;
    font-size: var(--ui-font-13, 13px);
  }
  .security-recommendation {
    color: var(--desc-color);
  }
  .security-finding-actions {
    display: flex;
    gap: var(--ui-space-14, 14px);
    flex-wrap: wrap;
  }
  pre {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: var(--ui-font-12, 12px);
    color: var(--desc-color);
  }
  .security-workspace .security-detail-grid {
    grid-template-columns: 1fr;
    gap: var(--ui-space-14, 14px);
    min-width: 0;
  }
  .security-workspace .ssh-events li {
    flex-wrap: wrap;
  }
  .security-workspace .ssh-events time {
    flex-basis: 100%;
  }
  @media (max-width: 1199px) {
    .security-workspace {
      grid-template-columns: 1fr;
    }
  }

  .infra-state-card {
    min-height: var(--ui-layout-150, 150px);
    display: flex;
    align-items: center;
    gap: var(--ui-space-14, 14px);
  }
  .infra-state-card div {
    flex: 1;
  }
  .infra-state-card p {
    margin: var(--ui-space-5, 5px) 0 0;
    color: var(--desc-color);
  }
  .infra-stale-warning {
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    padding: var(--ui-space-10, 10px) var(--ui-space-12, 12px);
    border: 1px solid var(--warning-color, #ad6800);
    border-radius: 10px;
    color: var(--warning-color, #ad6800);
    background: var(--card-background);
  }
  .security-detail-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(var(--ui-layout-300, 300px), 1fr);
    gap: var(--ui-space-18, 18px);
  }
  .security-caption {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .ssh-summary {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    margin-bottom: var(--ui-space-14, 14px);
  }
  .ssh-summary div {
    display: grid;
    gap: var(--ui-space-4, 4px);
    padding: 0 var(--ui-space-14, 14px);
    border-left: 1px solid var(--surface-divider-color);
  }
  .ssh-summary div:first-child {
    padding-left: 0;
    border-left: 0;
  }
  .ssh-summary span {
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
  }
  .ssh-summary strong {
    font-size: var(--ui-font-18, 18px);
  }
  .ssh-summary strong.is-danger {
    color: var(--error-color, #d14343);
  }
  .ssh-events {
    display: grid;
    gap: var(--ui-space-8, 8px);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .ssh-events li {
    display: grid;
    grid-template-columns:
      var(--ui-layout-76, 76px) minmax(var(--ui-layout-100, 100px), 1fr) minmax(var(--ui-layout-70, 70px), 0.7fr)
      auto;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    font-size: var(--ui-font-12, 12px);
  }
  .ssh-events time {
    color: var(--desc-color);
  }
  .port-table__port {
    display: grid;
    gap: var(--ui-space-2, 2px);
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
  }
  .port-table__port small,
  .port-table code {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .port-table code {
    display: block;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .security-empty {
    min-height: var(--ui-layout-90, 90px);
    display: grid;
    place-items: center;
    color: var(--desc-color);
  }
  @media (max-width: 1000px) {
    .security-detail-grid {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 767px) {
    .ssh-events li {
      grid-template-columns: 72px minmax(0, 1fr);
    }
    .ssh-events li span:nth-of-type(2),
    .ssh-events time {
      grid-column: 2;
    }
  }
</style>
