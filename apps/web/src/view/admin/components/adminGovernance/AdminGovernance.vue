<template>
  <AdminDataPage
    eyebrow="Admin / Governance"
    :title="t('adminGovernance.title')"
    :subtitle="t('adminGovernance.subtitle')"
    layout="scroll"
  >
    <template #actions>
      <BButton size="small" :loading="loading" @click="load">{{ t('common.refresh') }}</BButton>
    </template>

    <template #metrics>
      <li class="admin-stat-card">
        <span class="admin-stat-label">{{ t('adminGovernance.metrics.declaredRoutes') }}</span>
        <strong class="admin-stat-value">{{ n(data?.routePolicies.total) }}</strong>
        <span class="admin-stat-hint">{{ t('adminGovernance.metrics.declaredRoutesHint') }}</span>
      </li>
      <li class="admin-stat-card" :class="{ 'has-danger': dangerWarnings > 0 }">
        <span class="admin-stat-label">{{ t('adminGovernance.metrics.warnings') }}</span>
        <strong class="admin-stat-value">{{ n(data?.warnings.length) }}</strong>
        <span class="admin-stat-hint">{{ t('adminGovernance.metrics.dangerHint', { count: dangerWarnings }) }}</span>
      </li>
      <li class="admin-stat-card">
        <span class="admin-stat-label">{{ t('adminGovernance.metrics.preview') }}</span>
        <strong class="admin-stat-value">{{ boolLabel(data?.runtime.adminContext.previewEnabled) }}</strong>
        <span class="admin-stat-hint">{{
          data?.runtime.adminContext.maintenanceEnabled
            ? t('adminGovernance.metrics.maintenanceOn')
            : t('adminGovernance.metrics.maintenanceOff')
        }}</span>
      </li>
      <li class="admin-stat-card">
        <span class="admin-stat-label">{{ t('adminGovernance.metrics.logRetention') }}</span>
        <strong class="admin-stat-value">{{ n(data?.runtime.retention.operationalLogs.retentionDays) }}</strong>
        <span class="admin-stat-hint">{{ t('adminGovernance.metrics.days') }}</span>
      </li>
    </template>

    <div v-if="data?.warnings.length" class="admin-governance__warnings" role="status">
      <BCard
        v-for="warning in data.warnings"
        :key="warning.code"
        as="article"
        variant="panel"
        padding="12px"
        class="admin-governance__warning"
        :class="`is-${warning.severity}`"
      >
        <BChip :tone="warningTone(warning.severity)">{{ t(`adminGovernance.severity.${warning.severity}`) }}</BChip>
        <div>
          <strong>{{ t(`adminGovernance.warnings.${warning.code}.title`) }}</strong>
          <p>{{ t(`adminGovernance.warnings.${warning.code}.detail`) }}</p>
        </div>
      </BCard>
    </div>

    <BLoading v-if="loading && !data" loading :title="t('adminGovernance.loading')" />

    <template v-else-if="data">
      <section class="admin-governance__section" aria-labelledby="governance-runtime-title">
        <header class="admin-governance__section-header">
          <div>
            <h3 id="governance-runtime-title">{{ t('adminGovernance.runtime.title') }}</h3>
            <p>{{ t('adminGovernance.runtime.subtitle') }}</p>
          </div>
          <BChip tone="neutral">{{ t('adminGovernance.readOnly') }}</BChip>
        </header>

        <div class="admin-governance__runtime-grid">
          <BCard variant="panel" padding="14px" as="article">
            <template #title>{{ t('adminGovernance.runtime.adminContext.title') }}</template>
            <template #extra><BChip tone="neutral">ENV + CODE</BChip></template>
            <dl class="admin-governance__facts">
              <div>
                <dt>{{ t('adminGovernance.runtime.adminContext.preview') }}</dt>
                <dd
                  ><BChip :tone="boolTone(data.runtime.adminContext.previewEnabled)">{{
                    boolLabel(data.runtime.adminContext.previewEnabled)
                  }}</BChip></dd
                >
              </div>
              <div>
                <dt>{{ t('adminGovernance.runtime.adminContext.maintenance') }}</dt>
                <dd
                  ><BChip :tone="data.runtime.adminContext.maintenanceEnabled ? 'pending' : 'neutral'">{{
                    boolLabel(data.runtime.adminContext.maintenanceEnabled)
                  }}</BChip></dd
                >
              </div>
              <div>
                <dt>{{ t('adminGovernance.runtime.adminContext.readonlyTtl') }}</dt>
                <dd>{{ t('adminGovernance.minutes', { count: data.runtime.adminContext.readonlyTtlMinutes }) }}</dd>
              </div>
              <div>
                <dt>{{ t('adminGovernance.runtime.adminContext.maintenanceTtl') }}</dt>
                <dd>{{ t('adminGovernance.minutes', { count: data.runtime.adminContext.maintenanceTtlMinutes }) }}</dd>
              </div>
            </dl>
          </BCard>

          <BCard variant="panel" padding="14px" as="article">
            <template #title>{{ t('adminGovernance.runtime.security.title') }}</template>
            <template #extra><BChip tone="neutral">ENV + CODE</BChip></template>
            <dl class="admin-governance__facts">
              <div>
                <dt>{{ t('adminGovernance.runtime.security.blocking') }}</dt>
                <dd
                  ><BChip :tone="boolTone(data.runtime.security.requestBlockingEnabled)">{{
                    boolLabel(data.runtime.security.requestBlockingEnabled)
                  }}</BChip></dd
                >
              </div>
              <div>
                <dt>{{ t('adminGovernance.runtime.security.reputation') }}</dt>
                <dd
                  ><BChip :tone="boolTone(data.runtime.security.reputationDecisionEnabled)">{{
                    boolLabel(data.runtime.security.reputationDecisionEnabled)
                  }}</BChip></dd
                >
              </div>
              <div>
                <dt>{{ t('adminGovernance.runtime.security.autoBan') }}</dt>
                <dd
                  ><BChip :tone="boolTone(data.runtime.security.ipAutoBanEnabled)">{{
                    boolLabel(data.runtime.security.ipAutoBanEnabled)
                  }}</BChip></dd
                >
              </div>
              <div>
                <dt>{{ t('adminGovernance.runtime.security.thresholds') }}</dt>
                <dd>{{ data.runtime.security.logThreshold }} / {{ data.runtime.security.blockThreshold }}</dd>
              </div>
              <div>
                <dt>{{ t('adminGovernance.runtime.security.retention') }}</dt>
                <dd>{{ t('adminGovernance.daysValue', { count: data.runtime.security.eventRetentionDays }) }}</dd>
              </div>
            </dl>
          </BCard>

          <BCard variant="panel" padding="14px" as="article">
            <template #title>{{ t('adminGovernance.runtime.community.title') }}</template>
            <template #extra><BChip tone="neutral">ENV</BChip></template>
            <dl class="admin-governance__facts">
              <div>
                <dt>{{ t('adminGovernance.runtime.community.access') }}</dt>
                <dd
                  ><BChip tone="neutral">{{
                    t(`adminGovernance.runtime.community.modes.${data.runtime.community.accessMode}`)
                  }}</BChip></dd
                >
              </div>
              <div>
                <dt>{{ t('adminGovernance.runtime.community.messaging') }}</dt>
                <dd
                  ><BChip :tone="boolTone(data.runtime.community.messagingEnabled)">{{
                    boolLabel(data.runtime.community.messagingEnabled)
                  }}</BChip></dd
                >
              </div>
              <div>
                <dt>{{ t('adminGovernance.runtime.community.realtime') }}</dt>
                <dd
                  ><BChip :tone="boolTone(data.runtime.community.realtimeEnabled)">{{
                    boolLabel(data.runtime.community.realtimeEnabled)
                  }}</BChip></dd
                >
              </div>
              <div>
                <dt>{{ t('adminGovernance.runtime.community.readonly') }}</dt>
                <dd
                  ><BChip :tone="data.runtime.community.emergencyReadOnly ? 'pending' : 'neutral'">{{
                    boolLabel(data.runtime.community.emergencyReadOnly)
                  }}</BChip></dd
                >
              </div>
              <div>
                <dt>{{ t('adminGovernance.runtime.community.rules') }}</dt>
                <dd
                  ><code>{{ data.runtime.community.rulesVersion }}</code></dd
                >
              </div>
            </dl>
          </BCard>

          <BCard variant="panel" padding="14px" as="article">
            <template #title>{{ t('adminGovernance.runtime.retention.title') }}</template>
            <template #extra><BChip tone="neutral">ENV + DEFAULT</BChip></template>
            <dl class="admin-governance__facts">
              <div>
                <dt>{{ t('adminGovernance.runtime.retention.logs') }}</dt>
                <dd>{{
                  t('adminGovernance.daysValue', { count: data.runtime.retention.operationalLogs.retentionDays })
                }}</dd>
              </div>
              <div>
                <dt>{{ t('adminGovernance.runtime.retention.aiDigest') }}</dt>
                <dd>{{
                  t('adminGovernance.daysValue', { count: data.runtime.retention.operationalLogs.digestRetentionDays })
                }}</dd>
              </div>
              <div>
                <dt>{{ t('adminGovernance.runtime.retention.aiEvents') }}</dt>
                <dd>
                  {{ t('adminGovernance.daysValue', { count: data.runtime.retention.aiProductEvents.retentionDays }) }}
                  <BChip :tone="data.runtime.retention.aiProductEvents.state === 'invalid' ? 'danger' : 'neutral'">{{
                    t(`adminGovernance.runtime.retention.states.${data.runtime.retention.aiProductEvents.state}`)
                  }}</BChip>
                </dd>
              </div>
              <div>
                <dt>{{ t('adminGovernance.runtime.retention.changeSets') }}</dt>
                <dd
                  ><BChip
                    :tone="data.runtime.retention.aiArtifacts.domains.changeSet.enabled ? 'success' : 'neutral'"
                    >{{ artifactRetentionLabel }}</BChip
                  ></dd
                >
              </div>
              <div>
                <dt>{{ t('adminGovernance.runtime.retention.iconJobs') }}</dt>
                <dd
                  ><BChip :tone="boolTone(data.runtime.jobs.bookmarkIconBackgroundEnabled)">{{
                    boolLabel(data.runtime.jobs.bookmarkIconBackgroundEnabled)
                  }}</BChip></dd
                >
              </div>
            </dl>
          </BCard>
        </div>
      </section>

      <section class="admin-governance__section" aria-labelledby="governance-role-title">
        <header class="admin-governance__section-header">
          <div>
            <h3 id="governance-role-title">{{ t('adminGovernance.roles.title') }}</h3>
            <p>{{ t('adminGovernance.roles.subtitle') }}</p>
          </div>
        </header>

        <BTable
          v-if="!bookmark.isMobile"
          row-key="role"
          :data="data.roles"
          :columns="roleColumns"
          class="admin-governance__role-table"
        >
          <template #bodyCell="{ record, column }">
            <template v-if="column.key === 'role'">
              <BChip tone="neutral">{{ roleLabel(asRole(record).role) }}</BChip>
            </template>
            <template v-else-if="column.key === 'ownContent'">{{
              ownContentLabel(asRole(record).ownContent)
            }}</template>
            <template v-else-if="column.key === 'adminConsole'">{{ yesNo(asRole(record).adminConsole) }}</template>
            <template v-else-if="column.key === 'userPreview'">{{ yesNo(asRole(record).userPreview) }}</template>
            <template v-else-if="column.key === 'contentMaintenance'">{{
              yesNo(asRole(record).contentMaintenance)
            }}</template>
            <template v-else-if="column.key === 'highRiskOperations'">{{
              yesNo(asRole(record).highRiskOperations)
            }}</template>
            <template v-else-if="column.key === 'analyticsIncluded'">{{
              yesNo(asRole(record).analyticsIncluded)
            }}</template>
          </template>
        </BTable>

        <div v-else class="admin-governance__role-list">
          <BCard v-for="role in data.roles" :key="role.role" variant="panel" padding="14px" as="article">
            <header
              ><BChip tone="neutral">{{ roleLabel(role.role) }}</BChip></header
            >
            <dl class="admin-governance__facts">
              <div
                ><dt>{{ t('adminGovernance.roles.columns.ownContent') }}</dt
                ><dd>{{ ownContentLabel(role.ownContent) }}</dd></div
              >
              <div
                ><dt>{{ t('adminGovernance.roles.columns.adminConsole') }}</dt
                ><dd>{{ yesNo(role.adminConsole) }}</dd></div
              >
              <div
                ><dt>{{ t('adminGovernance.roles.columns.userPreview') }}</dt
                ><dd>{{ yesNo(role.userPreview) }}</dd></div
              >
              <div
                ><dt>{{ t('adminGovernance.roles.columns.maintenance') }}</dt
                ><dd>{{ yesNo(role.contentMaintenance) }}</dd></div
              >
              <div
                ><dt>{{ t('adminGovernance.roles.columns.highRisk') }}</dt
                ><dd>{{ yesNo(role.highRiskOperations) }}</dd></div
              >
              <div
                ><dt>{{ t('adminGovernance.roles.columns.analytics') }}</dt
                ><dd>{{ yesNo(role.analyticsIncluded) }}</dd></div
              >
            </dl>
          </BCard>
        </div>
      </section>

      <section class="admin-governance__section" aria-labelledby="governance-policy-title">
        <header class="admin-governance__section-header">
          <div>
            <h3 id="governance-policy-title">{{ t('adminGovernance.policies.title') }}</h3>
            <p>{{ t('adminGovernance.policies.subtitle') }}</p>
          </div>
        </header>
        <div class="admin-governance__policy-grid">
          <BCard v-for="policy in policyItems" :key="policy.key" variant="panel" padding="12px" as="article">
            <span>{{ t(`adminGovernance.policies.types.${policy.key}`) }}</span>
            <strong>{{ n(policy.count) }}</strong>
          </BCard>
        </div>
      </section>

      <BCard variant="panel" padding="14px" class="admin-governance__handoff">
        <div>
          <strong>{{ t('adminGovernance.handoff.title') }}</strong>
          <p>{{ t('adminGovernance.handoff.detail') }}</p>
        </div>
        <div class="admin-governance__handoff-actions">
          <BButton size="small" @click="go('audit')">{{ t('adminGovernance.handoff.audit') }}</BButton>
          <BButton size="small" @click="go('logs')">{{ t('adminGovernance.handoff.logs') }}</BButton>
          <BButton size="small" @click="go('security')">{{ t('adminGovernance.handoff.security') }}</BButton>
        </div>
      </BCard>
    </template>
  </AdminDataPage>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import router from '@/router';
  import AdminDataPage from '@/components/admin/AdminDataPage.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import type { Column } from '@/components/base/BasicComponents/BTable/config';
  import { getAdminGovernance } from '@/api/commonApi';
  import { bookmarkStore } from '@/store';

  type WarningSeverity = 'danger' | 'warning' | 'neutral';
  type RoleCapability = {
    role: string;
    authenticated: boolean;
    ownContent: 'preview' | 'full';
    adminConsole: boolean;
    userPreview: boolean;
    contentMaintenance: boolean;
    highRiskOperations: boolean;
    analyticsIncluded: boolean;
  };
  interface GovernanceData {
    generatedAt: string;
    roles: RoleCapability[];
    routePolicies: { total: number; counts: Record<string, number>; resources: Record<string, number> };
    runtime: {
      adminContext: {
        previewEnabled: boolean;
        maintenanceEnabled: boolean;
        readonlyTtlMinutes: number;
        maintenanceTtlMinutes: number;
      };
      security: {
        requestBlockingEnabled: boolean;
        reputationDecisionEnabled: boolean;
        ipAutoBanEnabled: boolean;
        blockThreshold: number;
        logThreshold: number;
        eventRetentionDays: number;
      };
      community: {
        accessMode: 'closed' | 'invite_only' | 'public';
        messagingEnabled: boolean;
        realtimeEnabled: boolean;
        emergencyReadOnly: boolean;
        rulesVersion: string;
      };
      jobs: { bookmarkIconBackgroundEnabled: boolean };
      retention: {
        operationalLogs: { retentionDays: number; digestRetentionDays: number };
        aiProductEvents: { retentionDays: number; state: 'default' | 'configured' | 'invalid' };
        aiArtifacts: {
          domains: { changeSet: { days: number | null; state: string; enabled: boolean } };
          invalidDomains: string[];
        };
      };
    };
    warnings: Array<{ code: string; severity: WarningSeverity }>;
  }

  const { t, locale } = useI18n();
  const bookmark = bookmarkStore();
  const loading = ref(false);
  const data = ref<GovernanceData | null>(null);

  const dangerWarnings = computed(() => data.value?.warnings.filter((item) => item.severity === 'danger').length || 0);
  const policyOrder = [
    'read',
    'content_write',
    'background_write',
    'ai_use',
    'ai_state_write',
    'content_destructive',
    'account_write',
    'entitlement_write',
    'admin_only',
  ];
  const policyItems = computed(() =>
    policyOrder.map((key) => ({ key, count: Number(data.value?.routePolicies.counts[key] || 0) })),
  );
  const roleColumns = computed<Column[]>(() => [
    { key: 'role', title: t('adminGovernance.roles.columns.role'), width: '130px' },
    { key: 'ownContent', title: t('adminGovernance.roles.columns.ownContent'), width: 'minmax(130px, 1fr)' },
    { key: 'adminConsole', title: t('adminGovernance.roles.columns.adminConsole'), width: '110px' },
    { key: 'userPreview', title: t('adminGovernance.roles.columns.userPreview'), width: '110px' },
    { key: 'contentMaintenance', title: t('adminGovernance.roles.columns.maintenance'), width: '110px' },
    { key: 'highRiskOperations', title: t('adminGovernance.roles.columns.highRisk'), width: '110px' },
    { key: 'analyticsIncluded', title: t('adminGovernance.roles.columns.analytics'), width: '110px' },
  ]);
  const artifactRetentionLabel = computed(() => {
    const config = data.value?.runtime.retention.aiArtifacts.domains.changeSet;
    if (!config?.enabled) return t(`adminGovernance.runtime.retention.states.${config?.state || 'disabled'}`);
    return t('adminGovernance.daysValue', { count: config.days });
  });

  function n(value: unknown) {
    return Number(value || 0).toLocaleString(locale.value);
  }
  function boolLabel(value: unknown) {
    return value ? t('adminGovernance.enabled') : t('adminGovernance.disabled');
  }
  function yesNo(value: boolean) {
    return value ? t('adminGovernance.yes') : t('adminGovernance.no');
  }
  function boolTone(value: boolean | undefined): 'success' | 'neutral' {
    return value ? 'success' : 'neutral';
  }
  function warningTone(value: WarningSeverity): 'danger' | 'pending' | 'neutral' {
    if (value === 'danger') return 'danger';
    if (value === 'warning') return 'pending';
    return 'neutral';
  }
  function roleLabel(role: string) {
    return t(`adminGovernance.roles.names.${role}`);
  }
  function ownContentLabel(value: RoleCapability['ownContent']) {
    return t(`adminGovernance.roles.contentModes.${value}`);
  }
  function asRole(value: unknown) {
    return value as RoleCapability;
  }
  function go(target: 'audit' | 'logs' | 'security') {
    const mobile = bookmark.isMobile;
    const paths = {
      audit: mobile ? '/adminAudit' : '/admin/adminAudit',
      logs: mobile ? '/logCleanup' : '/admin/logCleanup',
      security: mobile ? '/securityCenterMobile' : '/securityCenter/overview',
    };
    router.push(paths[target]);
  }

  async function load() {
    if (loading.value) return;
    loading.value = true;
    try {
      const response: any = await getAdminGovernance();
      if (response?.status !== 200) throw new Error(response?.msg || 'ADMIN_GOVERNANCE_FAILED');
      data.value = response.data;
    } catch {
      message.error(t('adminGovernance.loadFailed'));
    } finally {
      loading.value = false;
    }
  }

  onMounted(load);
</script>

<style scoped lang="less">
  .admin-governance__warnings,
  .admin-governance__section,
  .admin-governance__role-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .admin-governance__warning {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    border-width: 1px;
    border-style: solid;
  }

  .admin-governance__warning.is-danger {
    border-color: var(--danger-color, #e5484d);
  }

  .admin-governance__warning.is-warning {
    border-color: var(--warning-border-color, #e6a23c);
  }

  .admin-governance__warning strong,
  .admin-governance__warning p {
    margin: 0;
  }

  .admin-governance__warning p {
    margin-top: 2px;
    color: var(--sub-text-color);
    font-size: 11px;
    line-height: 1.5;
  }

  .admin-governance__section-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .admin-governance__section-header h3,
  .admin-governance__section-header p {
    margin: 0;
  }

  .admin-governance__section-header h3 {
    color: var(--text-color);
    font-size: 15px;
  }

  .admin-governance__section-header p {
    margin-top: 2px;
    color: var(--sub-text-color);
    font-size: 12px;
  }

  .admin-governance__runtime-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .admin-governance__facts {
    display: grid;
    gap: 8px;
    margin: 0;
  }

  .admin-governance__facts > div {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 26px;
    padding-bottom: 7px;
    border-bottom: 1px solid var(--surface-divider-color);
  }

  .admin-governance__facts > div:last-child {
    padding-bottom: 0;
    border-bottom: none;
  }

  .admin-governance__facts dt {
    color: var(--sub-text-color);
    font-size: 11px;
  }

  .admin-governance__facts dd {
    display: flex;
    align-items: center;
    gap: 5px;
    margin: 0;
    color: var(--text-color);
    font-size: 12px;
    text-align: right;
  }

  .admin-governance__role-table {
    min-height: 250px;
  }

  .admin-governance__role-list article > header {
    margin-bottom: 10px;
  }

  .admin-governance__policy-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 8px;
  }

  .admin-governance__policy-grid article {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .admin-governance__policy-grid span {
    color: var(--sub-text-color);
    font-size: 11px;
  }

  .admin-governance__policy-grid strong {
    font-size: 18px;
  }

  .admin-governance__handoff {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .admin-governance__handoff p {
    margin: 3px 0 0;
    color: var(--sub-text-color);
    font-size: 11px;
    line-height: 1.5;
  }

  .admin-governance__handoff-actions {
    display: flex;
    flex: none;
    gap: 8px;
  }

  @media (max-width: 900px) {
    .admin-governance__runtime-grid {
      grid-template-columns: 1fr;
    }

    .admin-governance__policy-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (max-width: 600px) {
    .admin-governance__policy-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .admin-governance__handoff {
      align-items: stretch;
      flex-direction: column;
    }

    .admin-governance__handoff-actions {
      flex-wrap: wrap;
    }

    .admin-governance__handoff-actions > * {
      flex: 1 1 100px;
    }
  }

  html.light-note-mobile-rendering .admin-governance__warning,
  html.light-note-mobile-rendering .admin-governance__runtime-grid article,
  html.light-note-mobile-rendering .admin-governance__role-list article {
    box-shadow: none;
    border-color: var(--surface-border-color);
  }

  html.light-note-mobile-rendering .admin-governance__warning.is-danger {
    border-color: var(--danger-color, #e5484d);
  }

  html.light-note-mobile-rendering .admin-governance__warning.is-warning {
    border-color: var(--warning-border-color, #e6a23c);
  }
</style>
