<template>
  <BPopover v-model:open="open" trigger="click" placement="bottom-left">
    <BButton
      ref="trigger"
      class="cloud-scope-trigger"
      size="small"
      :aria-label="t('cloudSpace.scopeLabel')"
      :aria-expanded="open"
      aria-haspopup="menu"
      @keydown.down.prevent.stop="focusOptions"
    >
      <span>{{
        t('cloudSpace.scopeTrigger', {
          scope: t(
            allFiles
              ? 'cloudSpace.scopeAll'
              : includeDescendants
                ? 'cloudSpace.scopeDescendants'
                : 'cloudSpace.scopeCurrent',
          ),
        })
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
        <p v-if="allFiles" class="cloud-scope-hint">{{ t('cloudSpace.scopeAllHint') }}</p>
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
          <span class="cloud-scope-marker" aria-hidden="true"
            ><SvgIcon v-if="includeDescendants === value" :src="icon.filterPanel.check" size="14"
          /></span>
          <span class="cloud-scope-copy">
            <span class="cloud-scope-option-title"
              >{{ t(value ? 'cloudSpace.scopeTreeTitle' : 'cloudSpace.scopeDirectTitle') }}
              <small v-if="counts">{{
                t('cloudSpace.fileCount', { count: value ? counts.total : counts.direct })
              }}</small>
            </span>
            <span class="cloud-scope-hint">{{
              t(value ? 'cloudSpace.scopeTreeHint' : 'cloudSpace.scopeDirectHint')
            }}</span>
          </span>
        </BButton>
        <div v-if="error" class="cloud-scope-error" role="alert">
          <span>{{ t(error === 'load' ? 'cloudSpace.scopeLoadFailed' : 'cloudSpace.scopeSaveFailed') }}</span>
          <BButton type="text" :disabled="disabled && error !== 'load'" @click="emit('retry')">{{
            t('cloudSpace.scopeRetry')
          }}</BButton>
        </div>
        <p class="cloud-scope-footer">{{ t(localOnly ? 'cloudSpace.scopeLocal' : 'cloudSpace.scopeAccount') }}</p>
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
  .cloud-scope-trigger {
    display: inline-flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    min-height: var(--ui-control-28, 28px);
    white-space: nowrap;
    font-size: var(--ui-font-12, 12px);
    border: 1px solid var(--card-border-color);
  }
  .cloud-scope-menu {
    width: var(--ui-layout-360, 360px);
    max-width: calc(100vw - var(--ui-space-32, 32px));
    padding: var(--ui-space-8, 8px);
    color: var(--text-color);
  }
  .cloud-scope-title {
    display: block;
    padding: var(--ui-space-8, 8px);
    font-size: var(--ui-font-14, 14px);
  }
  .cloud-scope-option {
    width: 100%;
    display: flex;
    align-items: flex-start;
    gap: var(--ui-space-10, 10px);
    height: auto;
    padding: var(--ui-space-10, 10px);
    text-align: left;
    white-space: normal;
    border: 1px solid transparent;
    background: transparent;
  }
  .cloud-scope-option.is-selected {
    border-color: var(--resource-file-color);
    color: var(--text-color);
    background: var(--workspace-hover);
  }
  .cloud-scope-marker {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--ui-layout-18, 18px);
    height: var(--ui-layout-18, 18px);
    flex-shrink: 0;
    border: 1px solid var(--desc-color);
    border-radius: 50%;
    color: var(--resource-file-color);
  }
  .is-selected .cloud-scope-marker {
    border-color: var(--resource-file-color);
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
    font-weight: 600;
  }
  .cloud-scope-option-title small {
    flex-shrink: 0;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    font-weight: 400;
  }
  .cloud-scope-hint,
  .cloud-scope-footer {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.5;
  }
  .cloud-scope-footer {
    margin: var(--ui-space-8, 8px) var(--ui-space-8, 8px) var(--ui-space-4, 4px);
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
