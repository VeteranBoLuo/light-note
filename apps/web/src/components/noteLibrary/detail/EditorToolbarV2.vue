<template>
  <div
    ref="toolbarRef"
    class="editor-toolbar-v2"
    :class="{ 'is-mobile': mobile, 'is-compact': compact && !mobile }"
    role="toolbar"
    :aria-label="ariaLabel"
  >
    <template v-if="mobile">
      <BButton
        v-for="action in mobilePrimaryActions"
        :key="action.key"
        class="editor-toolbar-v2__mobile-button"
        :class="{ 'is-active': action.selected }"
        :disabled="action.disabled"
        :aria-label="action.label"
        :aria-pressed="action.selected || undefined"
        @click="runMobileAction(action)"
      >
        <SvgIcon :src="action.icon" size="18" aria-hidden="true" />
        <span>{{ action.label }}</span>
      </BButton>
    </template>

    <template v-else>
      <div class="editor-toolbar-v2__group">
        <ToolbarButton :action="undoAction" @run="emitAction" />
        <ToolbarButton :action="redoAction" @run="emitAction" />
        <ToolbarButton :action="repeatAction" @run="emitAction" />
      </div>

      <span class="editor-toolbar-v2__divider" aria-hidden="true"></span>

      <ToolbarMenu :action="headingAction" :items="headingActions" @run="emitAction" />

      <span class="editor-toolbar-v2__divider" aria-hidden="true"></span>

      <div class="editor-toolbar-v2__group">
        <ToolbarButton :action="boldAction" @run="emitAction" />
        <ToolbarButton :action="italicAction" @run="emitAction" />
      </div>

      <div v-if="desktopFormatActions.length" class="editor-toolbar-v2__group editor-toolbar-v2__desktop-formats">
        <ToolbarButton v-for="action in desktopFormatActions" :key="action.key" :action="action" @run="emitAction" />
      </div>

      <span class="editor-toolbar-v2__divider" aria-hidden="true"></span>

      <div class="editor-toolbar-v2__group">
        <ToolbarMenu :action="listAction" :items="listActions" @run="emitAction" />
        <ToolbarButton :action="imageAction" @run="emitAction" />
      </div>

      <span class="editor-toolbar-v2__divider" aria-hidden="true"></span>

      <ToolbarButton :action="linkAction" @run="emitAction" />

      <span class="editor-toolbar-v2__divider" aria-hidden="true"></span>

      <div class="editor-toolbar-v2__group">
        <ToolbarMenu :action="insertAction" :items="insertActions" @run="emitAction" />
        <ToolbarMenu :action="moreAction" :items="moreActions" align="right" @run="emitAction" />
        <ToolbarButton :action="shortcutsAction" @run="emitAction" />
      </div>

      <div v-if="$slots.trailing" class="editor-toolbar-v2__trailing">
        <slot name="trailing" />
      </div>
    </template>
  </div>

  <MobilePageActionsDrawer
    v-if="mobile"
    v-model:open="headingDrawerOpen"
    :title="headingAction.label"
    :actions="headingActions"
    compact
    @action="emitAction"
  />
  <MobilePageActionsDrawer
    v-if="mobile"
    v-model:open="listDrawerOpen"
    :title="listAction.label"
    :actions="listActions"
    compact
    @action="emitAction"
  />
  <MobilePageActionsDrawer
    v-if="mobile"
    v-model:open="insertDrawerOpen"
    :title="insertAction.label"
    :actions="insertActions"
    compact
    @action="emitAction"
  />
  <MobilePageActionsDrawer
    v-if="mobile"
    v-model:open="moreDrawerOpen"
    :title="moreAction.label"
    :actions="moreActions"
    compact
    @action="emitAction"
  />
</template>

<script lang="ts">
  export interface EditorToolbarAction {
    key: string;
    label: string;
    icon: string;
    description?: string;
    shortcut?: string;
    dividerBefore?: boolean;
    disabled?: boolean;
    selected?: boolean;
  }
</script>

<script setup lang="ts">
  import { computed, defineComponent, h, ref, type PropType } from 'vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BDropdown from '@/components/base/BasicComponents/BDropdown.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import MobilePageActionsDrawer from '@/components/mobile/MobilePageActionsDrawer.vue';
  import type { MobilePageActionItem } from '@/components/mobile/MobilePageActionsDrawer.vue';
  import { useElementWidthClasses } from '@/composables/useElementWidthClasses';

  const props = defineProps<{
    mobile: boolean;
    compact?: boolean;
    ariaLabel: string;
    undoAction: EditorToolbarAction;
    redoAction: EditorToolbarAction;
    repeatAction: EditorToolbarAction;
    headingAction: EditorToolbarAction;
    boldAction: EditorToolbarAction;
    italicAction: EditorToolbarAction;
    listAction: EditorToolbarAction;
    imageAction: EditorToolbarAction;
    linkAction: EditorToolbarAction;
    insertAction: EditorToolbarAction;
    moreAction: EditorToolbarAction;
    shortcutsAction: EditorToolbarAction;
    headingActions: EditorToolbarAction[];
    listActions: EditorToolbarAction[];
    insertActions: EditorToolbarAction[];
    moreActions: EditorToolbarAction[];
    desktopFormatActions: EditorToolbarAction[];
  }>();

  const emit = defineEmits<{
    action: [action: EditorToolbarAction];
  }>();

  const headingDrawerOpen = ref(false);
  const listDrawerOpen = ref(false);
  const insertDrawerOpen = ref(false);
  const moreDrawerOpen = ref(false);
  const toolbarRef = useElementWidthClasses([
    { className: 'is-narrow-840', maxWidth: 840 },
    { className: 'is-narrow-680', maxWidth: 680 },
  ]);

  const mobilePrimaryActions = computed(() => [
    props.undoAction,
    props.headingAction,
    props.boldAction,
    props.listAction,
    props.insertAction,
    props.moreAction,
  ]);

  function emitAction(action: EditorToolbarAction | MobilePageActionItem) {
    emit('action', action as EditorToolbarAction);
  }

  function runMobileAction(action: EditorToolbarAction) {
    if (action.disabled) return;
    if (action.key === props.headingAction.key) {
      headingDrawerOpen.value = true;
      return;
    }
    if (action.key === props.listAction.key) {
      listDrawerOpen.value = true;
      return;
    }
    if (action.key === props.insertAction.key) {
      insertDrawerOpen.value = true;
      return;
    }
    if (action.key === props.moreAction.key) {
      moreDrawerOpen.value = true;
      return;
    }
    emitAction(action);
  }

  const ToolbarButton = defineComponent({
    name: 'EditorToolbarButton',
    props: {
      action: { type: Object as PropType<EditorToolbarAction>, required: true },
    },
    emits: ['run'],
    setup(componentProps, { emit: componentEmit }) {
      return () =>
        h(
          BTooltip,
          {
            title: [componentProps.action.label, componentProps.action.description, componentProps.action.shortcut]
              .filter(Boolean)
              .join(' · '),
          },
          {
            default: () =>
              h(
                BButton,
                {
                  size: 'small',
                  class: ['editor-toolbar-v2__button', { 'is-active': componentProps.action.selected }],
                  disabled: componentProps.action.disabled,
                  'aria-label': componentProps.action.label,
                  'aria-pressed': componentProps.action.selected || undefined,
                  onClick: () => componentEmit('run', componentProps.action),
                },
                { default: () => h(SvgIcon, { src: componentProps.action.icon, size: '16', 'aria-hidden': 'true' }) },
              ),
          },
        );
    },
  });

  const ToolbarMenu = defineComponent({
    name: 'EditorToolbarMenu',
    props: {
      action: { type: Object as PropType<EditorToolbarAction>, required: true },
      items: { type: Array as PropType<EditorToolbarAction[]>, required: true },
      align: { type: String as PropType<'left' | 'right'>, default: 'left' },
    },
    emits: ['run'],
    setup(componentProps, { emit: componentEmit }) {
      const options = computed(() =>
        componentProps.items.flatMap((item) => [
          ...(item.dividerBefore ? [{ divider: true }] : []),
          {
            key: item.key,
            label: item.label,
            icon: item.icon,
            disabled: item.disabled,
            function: () => {
              if (!item.disabled) componentEmit('run', item);
            },
          },
        ]),
      );
      return () =>
        h(
          BTooltip,
          { title: componentProps.action.label },
          {
            default: () =>
              h(
                BDropdown,
                {
                  trigger: 'click',
                  align: componentProps.align,
                  menuOptions: options.value,
                  overlayClassName: 'editor-toolbar-v2__menu',
                },
                {
                  default: () =>
                    h(
                      BButton,
                      {
                        size: 'small',
                        class: [
                          'editor-toolbar-v2__button',
                          'is-menu',
                          { 'is-active': componentProps.action.selected },
                        ],
                        disabled: componentProps.action.disabled,
                        'aria-label': componentProps.action.label,
                        'aria-haspopup': 'menu',
                      },
                      {
                        default: () => [
                          h(SvgIcon, { src: componentProps.action.icon, size: '16', 'aria-hidden': 'true' }),
                          h('span', { class: 'editor-toolbar-v2__button-label' }, componentProps.action.label),
                          h('span', { class: 'editor-toolbar-v2__chevron', 'aria-hidden': 'true' }, '⌄'),
                        ],
                      },
                    ),
                },
              ),
          },
        );
    },
  });
</script>

<style scoped lang="less">
  .editor-toolbar-v2 {
    display: flex;
    min-width: 0;
    min-height: 40px;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    border-bottom: 1px solid var(--surface-border-color);
    background: var(--note-editor-header-bg, var(--surface-panel-bg, var(--background-color)));
    box-sizing: border-box;
    flex: 0 0 auto;
  }

  .editor-toolbar-v2__group {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex: 0 0 auto;
  }

  .editor-toolbar-v2__divider {
    width: 1px;
    height: 18px;
    margin: 0 2px;
    background: var(--surface-divider-color, var(--surface-border-color));
    flex: 0 0 auto;
  }

  :deep(.editor-toolbar-v2__button) {
    min-width: 30px;
    padding: 0 7px;
    border: 1px solid var(--surface-border-color) !important;
    background: var(--surface-page-bg, var(--background-color));
    color: var(--text-color);
    opacity: 1;
  }

  :deep(.editor-toolbar-v2__button:hover:not(.disabled)) {
    border-color: var(--surface-border-color) !important;
    background: var(--hover-background);
    color: var(--text-color);
  }

  :deep(.editor-toolbar-v2__button.is-active) {
    border-color: var(--primary-color) !important;
    background: var(--mobile-selected-bg, var(--hover-background));
    color: var(--primary-color);
    font-weight: 650;
  }

  :deep(.editor-toolbar-v2__button.disabled) {
    border-color: var(--surface-divider-color, var(--surface-border-color)) !important;
    background: transparent;
    color: var(--desc-color);
    opacity: 0.4;
  }

  :deep(.editor-toolbar-v2__button.is-menu) {
    gap: 5px;
    min-width: 74px;
  }

  .editor-toolbar-v2__button-label {
    max-width: 90px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .editor-toolbar-v2__chevron {
    font-size: 12px;
    line-height: 1;
  }

  .editor-toolbar-v2__trailing {
    min-width: 0;
    margin-left: auto;
    flex: 0 1 auto;
  }

  /* 富文本没有右侧视图切换，桌面端压成 36px 即可；Markdown 保留 40px，
     避免分栏切换和格式按钮挤在一起。移动端仍使用独立的大触控尺寸。 */
  .editor-toolbar-v2.is-compact {
    min-height: 36px;
    gap: 5px;
    padding: 3px 8px;

    .editor-toolbar-v2__divider {
      height: 16px;
      margin-inline: 1px;
    }
  }

  .editor-toolbar-v2.is-mobile {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 6px;
    min-height: 56px;
    padding: 5px 8px;
    overflow: hidden;
  }

  :deep(.editor-toolbar-v2__mobile-button) {
    width: 100%;
    min-width: 0;
    min-height: 46px;
    height: 46px;
    flex-direction: column;
    gap: 1px;
    padding: 3px 2px;
    border: 1px solid var(--surface-border-color) !important;
    background: transparent;
    color: var(--text-color);
    font-size: 10px;
    line-height: 1.15;
  }

  :deep(.editor-toolbar-v2__mobile-button.is-active) {
    border-color: var(--primary-color) !important;
    color: var(--primary-color);
    background: var(--mobile-selected-bg, var(--hover-background));
    font-weight: 650;
  }

  :deep(.editor-toolbar-v2__mobile-button.disabled) {
    color: var(--desc-color);
    background: transparent;
    opacity: 0.4;
  }

  :deep(.editor-toolbar-v2__mobile-button span) {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .editor-toolbar-v2.is-narrow-840 .editor-toolbar-v2__button-label,
  .editor-toolbar-v2.is-narrow-840 .editor-toolbar-v2__chevron {
    display: none;
  }

  .editor-toolbar-v2.is-narrow-840 .editor-toolbar-v2__desktop-formats {
    display: none;
  }

  .editor-toolbar-v2.is-narrow-840 :deep(.editor-toolbar-v2__button.is-menu) {
    min-width: 30px;
  }

  .editor-toolbar-v2.is-narrow-840 .editor-toolbar-v2__divider {
    margin-inline: 0;
  }

  .editor-toolbar-v2.is-narrow-680 .editor-toolbar-v2__group {
    gap: 2px;
  }

  .editor-toolbar-v2.is-narrow-680 .editor-toolbar-v2__divider {
    display: none;
  }

  .editor-toolbar-v2.is-narrow-680 .editor-toolbar-v2__trailing {
    flex: 0 0 auto;
  }

  .editor-toolbar-v2.is-narrow-680 :deep(.editor-toolbar-v2__trailing .md-view-switch) {
    min-width: 0;
  }
</style>

<style lang="less">
  .editor-toolbar-v2__menu .b-dropdown-item[aria-disabled='true'] {
    opacity: 0.45;
    pointer-events: none;
  }
</style>
