<template>
  <div class="infra-attention" role="status">
    <span :class="{ danger: faults > 0 }">{{ t('serverManagement.workspace.serviceFaults', { count: faults }) }}</span>
    <span :class="{ danger: (data?.summary.failed || 0) > 0 }">{{
      t('serverManagement.workspace.securityRisks', { count: data?.summary.failed ?? '—' })
    }}</span>
    <span>{{ t('serverManagement.workspace.pendingChecks', { count: pending }) }}</span>
    <span v-if="error" class="infra-attention__warning">{{ t('serverManagement.workspace.securityUnavailable') }}</span>
    <BButton type="text" @click="router.push('/serverManagement/diagnostics')"
      >{{ t('serverManagement.workspace.viewDiagnostics') }} →</BButton
    >
  </div>
</template>
<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import type { HostAgentServiceSnapshot } from '@lightnote/shared/host-agent-protocol';
  import { getInfraSecurity } from '@/api/infraApi';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import { useInfraSnapshot } from './useInfraSnapshot';
  const props = defineProps<{ services: HostAgentServiceSnapshot[] }>();
  const { t } = useI18n();
  const router = useRouter();
  const { data, error } = useInfraSnapshot(getInfraSecurity, 60_000);
  const faults = computed(() => props.services.filter((s) => s.state !== 'running' && s.state !== 'unknown').length);
  const pending = computed(() => {
    if (!data.value || error.value) return '—';
    return (
      data.value.summary.unknown +
      props.services.filter((s) => s.state === 'unknown').length +
      (props.services.length ? 0 : 1)
    );
  });
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
  .infra-attention__warning {
    color: var(--warning-color);
    font-size: var(--ui-font-12, 12px);
  }
</style>
