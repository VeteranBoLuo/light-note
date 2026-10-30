<template>
  <section class="note-detail-side-panel">
    <header class="note-detail-side-panel__head">
      <BTabs v-model:active-tab="tab" :options="tabs" variant="line">
        <template #label="{ tab: item }">
          <span class="note-detail-side-panel__tab">
            <SvgIcon :src="item.key === 'reference' ? icon.noteTree.reference : icon.ai.organize" size="14" aria-hidden="true" />
            <span class="note-detail-side-panel__tab-text" :data-text="item.label">{{ item.label }}</span>
          </span>
        </template>
      </BTabs>
      <BTooltip :title="`${t('note.hideSidePanel')} · ${getWorkspacePanelShortcutLabel('sidePanel')}`">
        <BButton class="note-detail-side-panel__collapse" :aria-label="t('note.hideSidePanel')" @click="emit('collapse')">
          <SvgIcon :src="icon.noteTree.panelRightClose" size="16" aria-hidden="true" />
        </BButton>
      </BTooltip>
    </header>
    <!-- 两个页签都保持挂载：切换时不丢 AI 草稿，也不丢参考内容的滚动位置。 -->
    <div v-show="tab === 'ai'" class="note-detail-side-panel__body">
      <slot name="ai" />
    </div>
    <div v-if="referenceMounted" v-show="tab === 'reference'" class="note-detail-side-panel__body">
      <slot name="reference" />
    </div>
  </section>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { getWorkspacePanelShortcutLabel } from '@/config/keyboardShortcuts';

  export type NoteDetailSidePanelTab = 'ai' | 'reference';

  const tab = defineModel<NoteDetailSidePanelTab>('tab', { default: 'ai' });
  const emit = defineEmits<{ collapse: [] }>();
  const { t } = useI18n();
  const tabs = computed(() => [
    { key: 'ai', label: t('note.reference.aiTab') },
    { key: 'reference', label: t('note.reference.tab') },
  ]);
  // 参考页签首次打开前不挂载，避免进入编辑页就加载选择器与预览组件。
  const referenceMounted = ref(tab.value === 'reference');
  watch(tab, (value) => {
    if (value === 'reference') referenceMounted.value = true;
  });
</script>

<style scoped lang="less">
  .note-detail-side-panel {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
  }

  .note-detail-side-panel__head {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: var(--ui-space-4, 4px);
    min-width: 0;
    height: var(--ui-control-42, 42px);
    padding: 0 var(--ui-space-8, 8px) 0 var(--ui-space-12, 12px);
    border-bottom: 1px solid var(--surface-border-color);
    box-sizing: border-box;
    background: var(--workspace-panel-bg-color);

    // 页签下划线直接落在标题行下边框上，不再叠一条页签自带的轨道线。
    :deep(.tab-container) {
      flex: 1 1 auto;
      align-self: stretch;
      align-items: center;
      gap: var(--ui-space-18, 18px);
      min-width: 0;
      /* ui-density-fixed: 下划线压住标题行 1px 边框 */
      margin: 0 0 -1px;
      padding: 0;
      border-bottom: 0;
    }
  }

  .note-detail-side-panel__tab {
    display: inline-flex;
    align-items: center;
    gap: var(--ui-space-5, 5px);
    white-space: nowrap;
  }

  // 激活页签会加粗；按加粗后的宽度预留空间，来回切换时页签不左右挪动。
  .note-detail-side-panel__tab-text {
    display: inline-flex;
    flex-direction: column;

    &::after {
      height: 0;
      overflow: hidden;
      font-weight: 600;
      content: attr(data-text);
      visibility: hidden;
      user-select: none;
      pointer-events: none;
    }
  }

  .note-detail-side-panel__collapse.b_btn {
    flex: 0 0 auto;
    width: var(--ui-control-28, 28px);
    min-width: var(--ui-control-28, 28px);
    height: var(--ui-control-28, 28px);
    padding: 0;
    border: 0;
    border-radius: var(--ui-space-8, 8px);
    color: var(--desc-color);
    background: transparent;

    &:hover,
    &:focus-visible {
      color: var(--primary-color);
      background: var(--workspace-hover, var(--surface-card-hover-bg));
    }
  }

  .note-detail-side-panel__body {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
</style>
