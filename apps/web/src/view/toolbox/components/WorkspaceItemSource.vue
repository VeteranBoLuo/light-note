<template>
  <div class="item-source" :class="{ 'is-compact': compact }">
    <div class="item-source__caption"
      ><span>{{ t('toolbox.board.source') }}</span
      ><span>{{
        source ? t(`toolbox.board.sourceTypes.${kind}.${source.lane}`) : t('toolbox.board.sourceSnapshot')
      }}</span></div
    >
    <BButton v-if="!preview" type="text" class="item-source__link" :disabled="disabled" @click.stop="emit('open')">
      <strong>{{ source?.title || title || t('toolbox.board.source') }}</strong>
      <span class="item-source__open"
        ><span v-if="!compact">{{ t('toolbox.board.viewSource') }}</span
        ><SvgIcon :src="icon.arrow_right" size="14"
      /></span>
    </BButton>
    <strong v-else class="item-source__preview">{{ source?.title || title }}</strong>
    <p v-if="!compact">{{ t(preview ? 'toolbox.board.sourceCreationHint' : 'toolbox.board.sourceRelationHint') }}</p>
  </div>
</template>
<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import type { ToolboxWorkspace, ToolboxWorkspaceItem } from '@/api/toolbox';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  defineProps<{
    source?: ToolboxWorkspaceItem;
    title?: string | null;
    kind: ToolboxWorkspace['kind'];
    compact?: boolean;
    preview?: boolean;
    disabled?: boolean;
  }>();
  const emit = defineEmits<{ open: [] }>();
  const { t } = useI18n();
</script>
<style scoped lang="less">
  .item-source {
    padding: var(--ui-space-16, 16px);
    border: 1px solid var(--workspace-border);
    border-radius: 9px;
    background: var(--workspace-canvas);
    min-width: 0;
    display: grid;
    gap: var(--ui-space-8, 8px);
  }
  .item-source__caption {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .item-source__caption > span + span {
    border: 1px solid var(--workspace-border);
    border-radius: 4px;
    padding: var(--ui-space-2, 2px) var(--ui-space-6, 6px);
    color: var(--text-color);
    background: var(--workspace-content);
  }
  .item-source__link.b_btn {
    display: flex;
    justify-content: space-between;
    gap: var(--ui-space-12, 12px);
    min-width: 0;
    height: auto;
    width: 100%;
    line-height: 1.5;
    padding: var(--ui-space-2, 2px) 0;
    text-align: left;
    white-space: normal;
    background: transparent;
  }
  .item-source__link strong,
  .item-source__preview {
    min-width: 0;
    overflow-wrap: anywhere;
    font-size: var(--ui-font-14, 14px);
    font-weight: 500;
    line-height: 1.6;
    color: var(--text-color);
  }
  .item-source__open {
    display: flex;
    align-items: center;
    gap: var(--ui-space-4, 4px);
    flex-shrink: 0;
    font-size: var(--ui-font-12, 12px);
    color: var(--workspace-purple-text);
  }
  .item-source p {
    margin: 0;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.7;
  }
  .item-source.is-compact {
    background: transparent;
    border: 0;
    border-top: 1px solid var(--workspace-border);
    border-radius: 0;
    padding: var(--ui-space-8, 8px) 0 0;
    gap: var(--ui-space-4, 4px);
  }
  .is-compact .item-source__caption {
    font-size: var(--ui-font-11, 11px);
  }
  .is-compact .item-source__caption > span + span {
    border: 0;
    padding: 0;
    background: transparent;
    color: var(--desc-color);
  }
  .is-compact .item-source__caption > span + span::before {
    content: '·';
    margin-right: var(--ui-space-8, 8px);
  }
  .is-compact .item-source__link strong {
    font-size: var(--ui-font-12, 12px);
    color: var(--workspace-purple-text);
  }
</style>
