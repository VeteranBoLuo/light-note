<template>
  <div class="infra-service-actions">
    <BButton v-if="showLogs" type="text" size="small" @click="$emit('logs')">{{
      t('serverManagement.viewLogs')
    }}</BButton>
    <BActionMenu
      v-if="items.length"
      :items="items"
      placement="bottom-right"
      :disabled="loading"
      :aria-label="t('serverManagement.workspace.moreActions')"
      @select="select"
    >
      <BButton
        size="small"
        :disabled="loading"
        :aria-label="
          t('serverManagement.actionForService', {
            action: t('serverManagement.workspace.moreActions'),
            service: t(`serverManagement.serviceNames.${service.id}`),
          })
        "
        ><SvgIcon :src="icon.common.more" size="16"
      /></BButton>
    </BActionMenu>
  </div>
</template>
<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { isRestartableHostAgentServiceId } from '@lightnote/shared/host-agent-protocol';
  import type { HostAgentServiceSnapshot, HostAgentAction } from '@lightnote/shared/host-agent-protocol';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BActionMenu from '@/components/base/BasicComponents/BActionMenu.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  const props = withDefaults(
    defineProps<{ service: HostAgentServiceSnapshot; loading: boolean; showLogs?: boolean }>(),
    { showLogs: true },
  );
  const emit = defineEmits<{ logs: []; action: [action: HostAgentAction] }>();
  const { t } = useI18n();
  const items = computed(() =>
    props.service.actions
      .filter(
        (action) =>
          (action === 'service.restart' && isRestartableHostAgentServiceId(props.service.id)) ||
          (action === 'nginx.reload' && props.service.id === 'nginx'),
      )
      .map((action) => ({
        key: action,
        label: t(action === 'nginx.reload' ? 'serverManagement.reloadNginx' : 'serverManagement.restartService'),
        icon: icon.infrastructure.restart,
        danger: true,
        disabled: props.loading,
      })),
  );
  function select(key: string) {
    const item = items.value.find((item) => item.key === key);
    if (item) emit('action', item.key);
  }
</script>
<style scoped lang="less">
  .infra-service-actions {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: var(--ui-space-6, 6px);
    white-space: nowrap;
  }
  .infra-service-actions > :deep(button) {
    padding-left: 0;
  }
  .infra-service-actions :deep(.b-action-menu-anchor > button) {
    border-color: transparent;
    background: transparent;
  }
</style>
