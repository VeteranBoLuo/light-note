<template>
  <div
    ref="toolbarRef"
    class="editor-toolbar-v2"
    :class="{ 'is-mobile': mobile, 'is-compact': compact && !mobile }"
    role="toolbar"
    :aria-label="ariaLabel"
    @pointerdown.capture="captureFontSizeSelection"
    @keydown.enter.capture="captureFontSizeSelection"
    @keydown.space.capture="captureFontSizeSelection"
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
        <ToolbarButton v-if="!minimal" :action="repeatAction" @run="emitAction" />
      </div>

      <span class="editor-toolbar-v2__divider" aria-hidden="true"></span>

      <div class="editor-toolbar-v2__group">
        <ToolbarMenu :action="headingAction" :items="headingActions" @run="emitAction" />
        <ToolbarMenu
          v-if="fontSizeAction && !narrow"
          :action="fontSizeAction"
          :items="fontSizeOptions || []"
          keyboard
          long-menu
          @run="emitAction"
        />
      </div>

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
        <slot name="image"
          ><BButton
            v-if="showImage"
            size="small"
            class="editor-toolbar-v2__button"
            :disabled="imageAction.disabled"
            :aria-label="imageAction.label"
            @click="emitAction(imageAction)"
            ><SvgIcon :src="imageAction.icon" size="16" /><span>{{ imageAction.label }}</span></BButton
          >
          <ToolbarButton v-else-if="!minimal" :action="imageAction" @run="emitAction"
        /></slot>
      </div>

      <span class="editor-toolbar-v2__divider" aria-hidden="true"></span>

      <ToolbarButton :action="linkAction" @run="emitAction" />

      <span class="editor-toolbar-v2__divider" aria-hidden="true"></span>

      <div class="editor-toolbar-v2__group editor-toolbar-v2__more-group">
        <ToolbarMenu v-if="!minimal" :action="insertAction" :items="insertActions" @run="emitAction" />
        <ToolbarMenu
          :action="moreAction"
          :items="desktopMoreActions"
          align="right"
          :keyboard="narrow"
          :long-menu="inFontSizeMenu"
          @open-change="resetMoreMenuOnOpen"
          @run="runMoreAction"
        />
        <ToolbarButton v-if="!minimal" :action="shortcutsAction" @run="emitAction" />
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
    :title="inFontSizeMenu ? fontSizeAction?.label : moreAction.label"
    :actions="mobileMoreActions"
    compact
    @action="runMoreAction"
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
    menuNavigation?: 'forward' | 'back';
  }
</script>

<script setup lang="ts">
  import { computed, defineComponent, h, ref, type PropType } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BDropdown from '@/components/base/BasicComponents/BDropdown.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import MobilePageActionsDrawer from '@/components/mobile/MobilePageActionsDrawer.vue';
  import type { MobilePageActionItem } from '@/components/mobile/MobilePageActionsDrawer.vue';
  import { useElementWidthClasses } from '@/composables/useElementWidthClasses';
  import { useUiDensity } from '@/composables/useUiDensity';
  import icon from '@/config/icon';

  const props = defineProps<{
    mobile: boolean;
    compact?: boolean;
    minimal?: boolean;
    showImage?: boolean;
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
    fontSizeAction?: EditorToolbarAction;
    fontSizeOptions?: EditorToolbarAction[];
  }>();
  const { t } = useI18n();

  const emit = defineEmits<{
    action: [action: EditorToolbarAction];
    'capture-font-size-selection': [];
  }>();

  function captureFontSizeSelection() {
    if (props.fontSizeAction) emit('capture-font-size-selection');
  }

  const headingDrawerOpen = ref(false);
  const listDrawerOpen = ref(false);
  const insertDrawerOpen = ref(false);
  const moreDrawerOpen = ref(false);
  const narrow = ref(false);
  const fontSizeMenuOpen = ref(false);
  const hasFontSize = computed(() => Boolean(props.fontSizeAction));
  const inFontSizeMenu = computed(() => fontSizeMenuOpen.value && hasFontSize.value && (props.mobile || narrow.value));
  const { dimension } = useUiDensity();
  const toolbarRef = useElementWidthClasses(
    () => [
      // 富文本完整工具栏需要容纳字号和两种语言的菜单标签。
      { className: 'is-note-toolbar-compact-width', maxWidth: hasFontSize.value ? dimension(1060, 'layout') : 0 },
      { className: 'is-narrow-840', maxWidth: 840 },
      { className: 'is-narrow-680', maxWidth: 680 },
    ],
    (classes) => {
      narrow.value = classes.has('is-note-toolbar-compact-width');
    },
  );

  const mobilePrimaryActions = computed(() =>
    props.minimal
      ? [
          props.undoAction,
          ...(props.showImage ? [] : [props.redoAction]),
          props.headingAction,
          props.boldAction,
          props.listAction,
          ...(props.showImage ? [props.imageAction] : []),
          props.moreAction,
        ]
      : [
          props.undoAction,
          props.headingAction,
          props.boldAction,
          props.listAction,
          props.insertAction,
          props.moreAction,
        ],
  );

  function moreActionsWithFontSize(actions: EditorToolbarAction[]) {
    if (!props.fontSizeAction) return actions;
    if (inFontSizeMenu.value) {
      return [
        {
          key: 'backFromFontSizeMenu',
          label: t('common.back'),
          icon: icon.arrow_left,
          menuNavigation: 'back' as const,
        },
        ...(props.fontSizeOptions ?? []),
      ];
    }
    return [{ ...props.fontSizeAction, menuNavigation: 'forward' as const }, ...actions];
  }

  const desktopMoreActions = computed(() =>
    narrow.value ? moreActionsWithFontSize(props.moreActions) : props.moreActions,
  );
  const mobileMoreActions = computed(() =>
    moreActionsWithFontSize(
      props.minimal && props.showImage ? [props.redoAction, ...props.moreActions] : props.moreActions,
    ),
  );

  function resetMoreMenuOnOpen(open: boolean) {
    if (open) fontSizeMenuOpen.value = false;
  }

  function runMoreAction(action: EditorToolbarAction | MobilePageActionItem) {
    if (action.menuNavigation) {
      fontSizeMenuOpen.value = action.menuNavigation === 'forward';
      return;
    }
    emitAction(action);
  }

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
    if (!props.minimal && action.key === props.insertAction.key) {
      insertDrawerOpen.value = true;
      return;
    }
    if (action.key === props.moreAction.key) {
      resetMoreMenuOnOpen(true);
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
            title: [componentProps.action.label, componentProps.action.description].filter(Boolean).join(' · '),
            shortcut: componentProps.action.shortcut,
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
      keyboard: Boolean,
      longMenu: Boolean,
    },
    emits: ['run', 'open-change'],
    setup(componentProps, { emit: componentEmit }) {
      const options = computed(() =>
        componentProps.items.flatMap((item) => [
          ...(item.dividerBefore ? [{ divider: true }] : []),
          {
            key: item.key,
            label: item.label,
            icon: item.icon,
            disabled: item.disabled,
            active: item.selected,
            menuNavigation: item.menuNavigation,
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
                  overlayClassName: componentProps.longMenu
                    ? 'editor-toolbar-v2__menu editor-toolbar-v2__font-size-menu'
                    : 'editor-toolbar-v2__menu',
                  keyboard: componentProps.keyboard,
                  onOpenChange: (open: boolean) => componentEmit('open-change', open),
                },
                {
                  default: ({ open }: { open: boolean }) =>
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
                        'aria-expanded': open,
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
    min-height: var(--ui-control-40, 40px);
    align-items: center;
    gap: var(--ui-space-6, 6px);
    padding: var(--ui-space-5, 5px) var(--ui-space-10, 10px);
    border-bottom: 1px solid var(--surface-border-color);
    background: var(--note-editor-header-bg, var(--surface-panel-bg, var(--background-color)));
    box-sizing: border-box;
    flex: 0 0 auto;
  }

  .editor-toolbar-v2__group {
    display: inline-flex;
    align-items: center;
    gap: var(--ui-space-4, 4px);
    flex: 0 0 auto;
  }

  .editor-toolbar-v2__divider {
    width: 1px;
    height: var(--ui-layout-18, 18px);
    margin: 0 var(--ui-space-2, 2px);
    background: var(--surface-divider-color, var(--surface-border-color));
    flex: 0 0 auto;
  }

  :deep(.editor-toolbar-v2__button) {
    min-width: var(--ui-control-30, 30px);
    padding: 0 var(--ui-space-7, 7px);
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
    gap: var(--ui-space-5, 5px);
    min-width: var(--ui-layout-74, 74px);
  }

  .editor-toolbar-v2__button-label {
    max-width: var(--ui-layout-90, 90px);
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .editor-toolbar-v2__chevron {
    font-size: var(--ui-font-12, 12px);
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
    min-height: var(--ui-control-36, 36px);
    gap: var(--ui-space-5, 5px);
    padding: var(--ui-space-3, 3px) var(--ui-space-8, 8px);

    .editor-toolbar-v2__divider {
      height: var(--ui-layout-16, 16px);
      margin-inline: var(--ui-space-1, 1px);
    }
  }

  .editor-toolbar-v2.is-mobile {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: var(--ui-space-6, 6px);
    min-height: 56px;
    padding: var(--ui-space-5, 5px) var(--ui-space-8, 8px);
    overflow: hidden;
  }

  :deep(.editor-toolbar-v2__mobile-button) {
    width: 100%;
    min-width: 0;
    min-height: 46px;
    height: 46px;
    flex-direction: column;
    gap: var(--ui-space-1, 1px);
    padding: var(--ui-space-3, 3px) var(--ui-space-2, 2px);
    border: 1px solid var(--surface-border-color) !important;
    background: transparent;
    color: var(--text-color);
    font-size: var(--ui-font-10, 10px);
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
  .editor-toolbar-v2.is-narrow-840 .editor-toolbar-v2__chevron,
  .editor-toolbar-v2.is-note-toolbar-compact-width :deep(.editor-toolbar-v2__button-label),
  .editor-toolbar-v2.is-note-toolbar-compact-width :deep(.editor-toolbar-v2__chevron),
  .editor-toolbar-v2:is(.is-narrow-840, .is-note-toolbar-compact-width) .editor-toolbar-v2__desktop-formats {
    display: none;
  }

  .editor-toolbar-v2:is(.is-narrow-840, .is-note-toolbar-compact-width) :deep(.editor-toolbar-v2__button.is-menu) {
    min-width: var(--ui-control-30, 30px);
  }

  .editor-toolbar-v2:is(.is-narrow-840, .is-note-toolbar-compact-width) .editor-toolbar-v2__divider {
    margin-inline: 0;
  }

  .editor-toolbar-v2.is-narrow-680 .editor-toolbar-v2__group {
    gap: var(--ui-space-2, 2px);
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
  .editor-toolbar-v2__font-size-menu {
    height: var(--ui-layout-460, 460px);
    overscroll-behavior: contain;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }

  .editor-toolbar-v2__menu .b-dropdown-item[aria-disabled='true'] {
    opacity: 0.45;
    pointer-events: none;
  }
</style>
