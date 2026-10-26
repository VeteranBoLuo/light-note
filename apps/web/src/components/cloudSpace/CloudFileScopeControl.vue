<template>
  <BPopover v-model:open="open" trigger="click" placement="bottom-left" overlay-class-name="cloud-scope-popover">
    <BButton
      ref="trigger"
      class="cloud-scope-trigger"
      size="small"
      :aria-label="t('cloudSpace.scopeLabel')"
      :aria-expanded="open"
      aria-haspopup="menu"
      @keydown.down.prevent.stop="focusOptions"
    >
      <span class="cloud-scope-trigger-label">{{ t('cloudSpace.scopeTriggerLabel') }}</span>
      <span class="cloud-scope-trigger-value">{{
        t(
          allFiles
            ? 'cloudSpace.scopeAll'
            : includeDescendants
              ? 'cloudSpace.scopeDescendants'
              : 'cloudSpace.scopeCurrent',
        )
      }}</span>
      <SvgIcon :src="icon.pagination.chevron" size="12" aria-hidden="true" />
    </BButton>
    <template #content>
      <div
        ref="menu"
        class="cloud-scope-menu"
        role="menu"
        :aria-label="t('cloudSpace.scopeTitle')"
        @keydown="navigateOptions"
      >
        <strong class="cloud-scope-title">{{ t('cloudSpace.scopeTitle') }}</strong>
        <BButton
          v-for="value in [false, true]"
          :key="String(value)"
          class="cloud-scope-option"
          :class="{ 'is-selected': includeDescendants === value }"
          :disabled="disabled"
          role="menuitemradio"
          :aria-checked="includeDescendants === value"
          @click="choose(value)"
        >
          <span class="cloud-scope-copy">
            <span class="cloud-scope-option-title"
              >{{ t(value ? 'cloudSpace.scopeDesktopTreeTitle' : 'cloudSpace.scopeDirectTitle') }}
              <small v-if="counts">{{
                t('cloudSpace.fileCount', { count: value ? counts.total : counts.direct })
              }}</small>
            </span>
            <span class="cloud-scope-hint">{{
              t(value ? 'cloudSpace.scopeDesktopTreeHint' : 'cloudSpace.scopeDirectHint')
            }}</span>
          </span>
          <span class="cloud-scope-marker" aria-hidden="true">
            <SvgIcon v-if="includeDescendants === value" :src="icon.filterPanel.check" size="14" />
          </span>
        </BButton>
        <div v-if="error" class="cloud-scope-error" role="alert">
          <span>{{ t(error === 'load' ? 'cloudSpace.scopeLoadFailed' : 'cloudSpace.scopeSaveFailed') }}</span>
          <BButton type="text" :disabled="disabled && error !== 'load'" @click="emit('retry')">{{
            t('cloudSpace.scopeRetry')
          }}</BButton>
        </div>
        <div class="cloud-scope-footer">
          <p v-if="allFiles" class="cloud-scope-context">{{ t('cloudSpace.scopeDesktopAllHint') }}</p>
          <p>{{ t(localOnly ? 'cloudSpace.scopeLocal' : 'cloudSpace.scopeAccount') }}</p>
        </div>
      </div>
    </template>
  </BPopover>
</template>

<script setup lang="ts">
  import { nextTick, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  const props = defineProps<{
    includeDescendants: boolean;
    allFiles: boolean;
    counts: { direct: number; total: number } | null;
    disabled: boolean;
    localOnly: boolean;
    error: string;
  }>();
  const emit = defineEmits<{ change: [value: boolean]; retry: [] }>();
  const { t } = useI18n();
  const open = ref(false);
  const trigger = ref<InstanceType<typeof BButton> | null>(null);
  const menu = ref<HTMLElement | null>(null);
  async function focusOptions() {
    open.value = true;
    await nextTick();
    (
      menu.value?.querySelector<HTMLButtonElement>('button[aria-checked="true"]:not(:disabled)') ||
      menu.value?.querySelector<HTMLButtonElement>('button:not(:disabled)')
    )?.focus();
  }
  function navigateOptions(event: KeyboardEvent) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const options = [
      ...(menu.value?.querySelectorAll<HTMLButtonElement>('button[role="menuitemradio"]:not(:disabled)') || []),
    ];
    if (!options.length) return;
    event.preventDefault();
    const index = options.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? options.length - 1
          : (index + (event.key === 'ArrowUp' ? -1 : 1) + options.length) % options.length;
    options[next]?.focus();
  }
  watch(open, (value, previous) => {
    if (!value && previous && document.activeElement && menu.value?.contains(document.activeElement))
      void nextTick(() => (trigger.value?.$el as HTMLElement | undefined)?.focus());
  });
  function choose(value: boolean) {
    if (props.disabled) return;
    if (value === props.includeDescendants) open.value = false;
    else emit('change', value);
  }
  watch(
    () => props.includeDescendants,
    () => {
      open.value = false;
    },
  );
  watch(
    () => props.error,
    (error) => {
      if (error) open.value = true;
    },
  );
</script>

<style scoped lang="less">
  :global(.b-popover-panel.cloud-scope-popover) {
    border-color: var(--surface-border-color);
    border-radius: 10px;
    background: var(--menu-body-bg-color);
    box-shadow: var(--action-menu-shadow);
  }
  .cloud-scope-trigger.b_btn {
    display: inline-flex;
    align-items: center;
    gap: var(--ui-space-6, 6px);
    height: var(--ui-control-30, 30px);
    padding: 0 var(--ui-space-10, 10px);
    white-space: nowrap;
    font-size: var(--ui-font-12, 12px);
    line-height: 1.3;
    border: 1px solid var(--surface-border-color);
    border-radius: 8px;
    background: var(--menu-body-bg-color);
    color: var(--text-color);
  }
  .cloud-scope-trigger.b_btn:hover,
  .cloud-scope-trigger.b_btn[aria-expanded='true'] {
    background: var(--menu-body-bg-color);
    border-color: var(--desc-color);
  }
  .cloud-scope-trigger-label {
    color: var(--desc-color);
    font-weight: 400;
  }
  .cloud-scope-trigger-value {
    font-weight: 600;
  }
  .cloud-scope-menu {
    width: var(--ui-layout-320, 320px);
    max-width: calc(100vw - var(--ui-space-32, 32px));
    padding: var(--ui-space-8, 8px);
    color: var(--text-color);
  }
  .cloud-scope-title {
    display: block;
    padding: var(--ui-space-4, 4px) var(--ui-space-10, 10px) var(--ui-space-8, 8px);
    font-size: var(--ui-font-12, 12px);
    font-weight: 600;
  }
  .cloud-scope-option.b_btn {
    width: 100%;
    display: flex;
    align-items: flex-start;
    gap: var(--ui-space-10, 10px);
    height: auto;
    padding: var(--ui-space-10, 10px);
    text-align: left;
    white-space: normal;
    line-height: 1.5;
    border: 0;
    border-radius: 6px;
    background: transparent;
  }
  .cloud-scope-option.b_btn:hover {
    background: var(--menu-item-bg-color);
  }
  .cloud-scope-option.b_btn.is-selected,
  .cloud-scope-option.b_btn.is-selected:hover {
    color: var(--text-color);
    background: var(--workspace-file-selected);
  }
  .cloud-scope-marker {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--ui-layout-18, 18px);
    height: var(--ui-layout-18, 18px);
    flex-shrink: 0;
    color: var(--resource-file-color);
  }
  .cloud-scope-copy {
    display: flex;
    flex: 1;
    min-width: 0;
    flex-direction: column;
    gap: var(--ui-space-4, 4px);
  }
  .cloud-scope-option-title {
    display: flex;
    justify-content: space-between;
    gap: var(--ui-space-8, 8px);
    font-size: var(--ui-font-13, 13px);
    font-weight: 500;
  }
  .cloud-scope-option-title small {
    flex-shrink: 0;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    font-weight: 400;
  }
  .cloud-scope-hint {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.5;
  }
  .cloud-scope-footer {
    margin-top: var(--ui-space-6, 6px);
    padding: var(--ui-space-10, 10px) var(--ui-space-10, 10px) var(--ui-space-4, 4px);
    border-top: 1px solid var(--surface-divider-color);
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
    line-height: 1.5;
  }
  .cloud-scope-footer p {
    margin: 0;
  }
  .cloud-scope-footer .cloud-scope-context {
    margin-bottom: var(--ui-space-6, 6px);
  }
  .cloud-scope-error {
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    padding: var(--ui-space-8, 8px);
    color: var(--danger-color, var(--text-color));
    font-size: var(--ui-font-12, 12px);
  }
</style>
