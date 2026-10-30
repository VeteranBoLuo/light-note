<template>
  <div class="infra-attention" role="status">
    <BLoading v-if="initialLoading" inline :loading="true" :title="t('serverManagement.diagnosticsPage.running')" />
    <template v-else-if="data">
      <span :class="{ danger: data.summary.failed > 0 }">{{
        t('serverManagement.workspace.failedChecks', { count: data.summary.failed })
      }}</span>
      <span :class="{ warning: data.summary.warning > 0 }">{{
        t('serverManagement.workspace.warningChecks', { count: data.summary.warning })
      }}</span>
      <span>{{ t('serverManagement.workspace.pendingChecks', { count: data.summary.unknown }) }}</span>
    </template>
    <span v-if="error" class="infra-attention__warning">{{
      t(data ? 'serverManagement.workspace.diagnosticsStale' : 'serverManagement.diagnosticsPage.failed')
    }}</span>
    <BButton type="text" @click="router.push('/serverManagement/diagnostics')"
      >{{ t('serverManagement.workspace.viewDiagnostics') }} →</BButton
    >
  </div>
</template>
<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import { getInfraDiagnostics } from '@/api/infraApi';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import { useInfraSnapshot } from './useInfraSnapshot';

  // 与诊断页同源，避免概览、诊断、安全三处各自计数而对不上。
  const { t } = useI18n();
  const router = useRouter();
  const { data, initialLoading, error } = useInfraSnapshot(getInfraDiagnostics, 60_000);
</script>
<style scoped lang="less">
  .infra-attention {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--ui-space-18, 18px);
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    padding: var(--ui-space-12, 12px) var(--ui-space-16, 16px);
    font-size: var(--ui-font-14, 14px);
  }
  .infra-attention > :last-child {
    margin-left: auto;
  }
  .danger {
    color: var(--error-color);
    font-weight: 600;
  }
  .warning {
    color: var(--warning-color);
    font-weight: 600;
  }
  .infra-attention__warning {
    color: var(--warning-color);
    font-size: var(--ui-font-12, 12px);
  }
</style>
