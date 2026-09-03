<template>
  <Teleport to="body">
    <Transition name="resource-batch-action-bar">
      <MobileStickyActionBar
        v-if="open && mobile"
        class="resource-batch-action-bar--mobile"
        :above-navigation="aboveNavigation"
      >
        <div class="resource-batch-action-bar__selection">
          <span v-if="$slots.leading" class="resource-batch-action-bar__leading">
            <slot name="leading" />
          </span>
          <div class="resource-batch-action-bar__copy" role="status" aria-live="polite">
            <strong>{{ summary }}</strong>
            <small v-if="detail">{{ detail }}</small>
          </div>
        </div>
        <BButton v-if="showMore" class="resource-batch-action-bar__mobile-more" @click="emit('more')">
          <SvgIcon :src="icon.common.more" size="17" aria-hidden="true" />
          <span>{{ moreLabel }}</span>
        </BButton>
        <BTooltip v-if="showMobilePrimary" :title="primaryDisabledReason" :disabled="!primaryDisabledReason">
          <span class="resource-batch-action-bar__tooltip-anchor">
            <BButton
              class="resource-batch-action-bar__primary"
              type="primary"
              :disabled="primaryDisabled"
              :loading="primaryLoading"
              @click="emit('primary')"
            >
              <SvgIcon :src="icon.common.magicWand" size="17" aria-hidden="true" />
              <span>{{ primaryLabel }}</span>
            </BButton>
          </span>
        </BTooltip>
      </MobileStickyActionBar>

      <div v-else-if="open" class="resource-batch-action-bar" role="toolbar" :aria-label="ariaLabel">
        <div class="resource-batch-action-bar__selection">
          <span class="resource-batch-action-bar__leading" :aria-hidden="$slots.leading ? undefined : 'true'">
            <slot name="leading">
              <SvgIcon :src="icon.ai.materials" size="18" />
            </slot>
          </span>
          <div class="resource-batch-action-bar__copy" role="status" aria-live="polite">
            <strong>{{ summary }}</strong>
            <small v-if="detail">{{ detail }}</small>
          </div>
        </div>
        <div class="resource-batch-action-bar__actions">
          <slot name="actions" />
        </div>
        <BButton v-if="showClear" class="resource-batch-action-bar__clear" @click="emit('clear')">
          {{ clearLabel }}
        </BButton>
        <BTooltip :title="primaryDisabledReason" :disabled="!primaryDisabledReason">
          <span class="resource-batch-action-bar__tooltip-anchor">
            <BButton
              class="resource-batch-action-bar__primary"
              type="primary"
              :disabled="primaryDisabled"
              :loading="primaryLoading"
              @click="emit('primary')"
            >
              <SvgIcon :src="icon.common.magicWand" size="17" aria-hidden="true" />
              <span>{{ primaryLabel }}</span>
            </BButton>
          </span>
        </BTooltip>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import MobileStickyActionBar from '@/components/mobile/MobileStickyActionBar.vue';
  import icon from '@/config/icon';

  withDefaults(
    defineProps<{
      open: boolean;
      mobile?: boolean;
      summary: string;
      detail?: string;
      ariaLabel?: string;
      clearLabel: string;
      primaryLabel: string;
      moreLabel: string;
      showClear?: boolean;
      showMore?: boolean;
      showMobilePrimary?: boolean;
      primaryDisabled?: boolean;
      primaryDisabledReason?: string;
      primaryLoading?: boolean;
      aboveNavigation?: boolean;
    }>(),
    {
      mobile: false,
      detail: '',
      ariaLabel: '',
      showClear: true,
      showMore: true,
      showMobilePrimary: true,
      primaryDisabled: false,
      primaryDisabledReason: '',
      primaryLoading: false,
      aboveNavigation: true,
    },
  );

  const emit = defineEmits<{
    clear: [];
    more: [];
    primary: [];
  }>();
</script>

<style scoped lang="less">
  .resource-batch-action-bar {
    position: fixed;
    z-index: 180;
    right: 24px;
    bottom: max(24px, env(safe-area-inset-bottom));
    left: 50%;
    width: min(940px, calc(100vw - 48px));
    min-height: 70px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px 10px 16px;
    border: 1px solid var(--surface-border-color);
    border-radius: 18px;
    background: var(--card-background);
    box-shadow: var(--surface-raised-shadow);
    color: var(--text-color);
    transform: translateX(-50%);
  }

  .resource-batch-action-bar__selection {
    min-width: 176px;
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    gap: 10px;
  }

  .resource-batch-action-bar__leading {
    width: 36px;
    height: 36px;
    flex: 0 0 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--surface-border-color);
    border-radius: 11px;
    background: var(--workspace-panel-bg-color);
    color: var(--primary-color);
  }

  .resource-batch-action-bar__copy {
    min-width: 0;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 2px;
    line-height: 1.35;
  }

  .resource-batch-action-bar__copy strong,
  .resource-batch-action-bar__copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .resource-batch-action-bar__copy strong {
    font-size: 14px;
    font-weight: 700;
  }

  .resource-batch-action-bar__copy small {
    color: var(--desc-color);
    font-size: 12px;
  }

  .resource-batch-action-bar__actions {
    min-width: 0;
    display: flex;
    flex: 0 1 auto;
    align-items: center;
    gap: 8px;
  }

  .resource-batch-action-bar__actions :deep(.b_btn),
  .resource-batch-action-bar__clear,
  .resource-batch-action-bar__primary {
    min-height: 42px;
    border-radius: 11px;
    white-space: nowrap;
  }

  .resource-batch-action-bar__actions :deep(.batch-action-delete.b_btn) {
    color: var(--danger-color);
  }

  .resource-batch-action-bar__clear {
    background: var(--workspace-panel-bg-color);
  }

  .resource-batch-action-bar__primary {
    min-width: 142px;
    gap: 7px;
    font-weight: 700;
  }

  .resource-batch-action-bar__tooltip-anchor {
    display: inline-flex;
  }

  .resource-batch-action-bar__tooltip-anchor > :deep(.b_btn) {
    width: 100%;
  }

  .resource-batch-action-bar--mobile.resource-batch-action-bar--mobile {
    gap: 7px;
  }

  .resource-batch-action-bar--mobile .resource-batch-action-bar__selection {
    min-width: 0;
    gap: 4px;
  }

  .resource-batch-action-bar--mobile .resource-batch-action-bar__leading {
    width: 44px;
    height: 44px;
    flex-basis: 44px;
    border: 0;
    background: transparent;
  }

  .resource-batch-action-bar--mobile .resource-batch-action-bar__leading :deep(.b-checkbox) {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    justify-content: center;
    padding: 0;
  }

  .resource-batch-action-bar--mobile .resource-batch-action-bar__copy {
    max-width: none;
  }

  .resource-batch-action-bar--mobile .resource-batch-action-bar__copy strong {
    font-size: 13px;
  }

  .resource-batch-action-bar--mobile .resource-batch-action-bar__copy small {
    display: none;
  }

  .resource-batch-action-bar--mobile :deep(.b-tooltip-wrap) {
    min-width: 0;
    display: flex;
    flex: 1.25 1 0;
  }

  .resource-batch-action-bar--mobile .resource-batch-action-bar__tooltip-anchor {
    width: 100%;
  }

  .resource-batch-action-bar--mobile .resource-batch-action-bar__mobile-more {
    min-width: 96px;
    flex: 0 0 96px;
    gap: 5px;
  }

  .resource-batch-action-bar--mobile .resource-batch-action-bar__primary {
    min-width: 0;
    gap: 5px;
  }

  .resource-batch-action-bar-enter-active,
  .resource-batch-action-bar-leave-active {
    transition:
      opacity 0.18s ease,
      transform 0.2s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .resource-batch-action-bar-enter-from,
  .resource-batch-action-bar-leave-to {
    opacity: 0;
    transform: translate(-50%, 16px);
  }

  .resource-batch-action-bar--mobile.resource-batch-action-bar-enter-from,
  .resource-batch-action-bar--mobile.resource-batch-action-bar-leave-to {
    transform: translateY(16px);
  }

  @media (max-width: 900px) and (min-width: 768px) {
    .resource-batch-action-bar {
      width: calc(100vw - 32px);
      gap: 8px;
    }

    .resource-batch-action-bar__selection {
      min-width: 150px;
    }

    .resource-batch-action-bar__primary {
      min-width: 128px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .resource-batch-action-bar-enter-active,
    .resource-batch-action-bar-leave-active {
      transition-duration: 0.01ms;
    }
  }

  :global(html.light-note-mobile-rendering .resource-batch-action-bar--mobile) {
    border-color: var(--surface-border-color);
    background: var(--card-background);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  }
</style>
