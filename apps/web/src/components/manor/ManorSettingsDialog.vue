<template>
  <BModal
    :visible="open"
    :title="title"
    :width="width"
    :initial-focus="initialFocus"
    :show-footer="Boolean($slots.footer)"
    modal-class="manor-settings-modal"
    mask-class="manor-settings-mask"
    @close="emit('close')"
  >
    <template #title>
      <span class="manor-settings-dialog__title">
        <span class="manor-settings-dialog__leaves is-left" aria-hidden="true"></span>
        {{ title }}
        <span class="manor-settings-dialog__leaves is-right" aria-hidden="true"></span>
      </span>
    </template>
    <slot />
    <template v-if="$slots.footer" #footer="{ close }">
      <slot name="footer" :close="close" />
    </template>
  </BModal>
</template>

<script setup lang="ts">
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';

  defineProps<{ open: boolean; title: string; width: string; initialFocus?: string }>();
  const emit = defineEmits<{ close: [] }>();
</script>

<style lang="less">
  // BModal teleports its surfaces; every selector belongs to manor settings.
  .manor-settings-mask {
    background: rgba(37, 45, 25, 0.48);
    backdrop-filter: blur(var(--ui-space-6, 6px));
  }
  .manor-settings-mask .modal-view.manor-settings-modal {
    --text-color: #634929;
    --desc-color: #806238;
    --primary-color: #65842e;
    --card-border-color: #c7b792;
    --error-color: #a03925;
    min-width: 0;
    max-width: calc(100% - var(--ui-space-40, 40px));
    max-height: calc(100% - var(--ui-space-40, 40px));
    border: var(--ui-space-3, 3px) solid #cfb378;
    border-radius: var(--ui-layout-24, 24px);
    background: linear-gradient(135deg, #fffaf0, #f5ebd5);
    box-shadow:
      inset 0 0 0 var(--ui-space-3, 3px) #fff9e8,
      0 var(--ui-space-6, 6px) 0 #9e7d48,
      0 var(--ui-space-16, 16px) var(--ui-space-40, 40px) #241b133d;
  }
  .manor-settings-modal .modal-header {
    justify-content: center;
    padding: var(--ui-space-24, 24px) var(--ui-space-28, 28px) var(--ui-space-16, 16px);
    border-bottom: 0;
  }
  .manor-settings-modal .modal-title {
    max-width: 100%;
    text-align: center;
  }
  .manor-settings-dialog__title {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: var(--ui-control-44, 44px);
    box-sizing: border-box;
    padding: var(--ui-space-6, 6px) var(--ui-space-32, 32px);
    border: 2px solid #c8a35a;
    border-radius: var(--ui-space-9, 9px);
    background: repeating-linear-gradient(
      1deg,
      #657e36 0,
      #657e36 var(--ui-space-5, 5px),
      #6c883c var(--ui-space-6, 6px),
      #739244 var(--ui-space-14, 14px)
    );
    box-shadow:
      inset 0 2px #afc96c,
      0 var(--ui-space-3, 3px) #486329;
    color: #fff9e1;
    font-size: var(--ui-font-22, 22px);
    font-weight: 700;
    line-height: 1.35;
    text-shadow: 0 2px #3e5225;
  }
  .manor-settings-dialog__leaves {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: var(--ui-layout-54, 54px);
    height: var(--ui-layout-54, 54px);
    pointer-events: none;
    // Existing decorative illustration atlas; percentages crop its native pixels.
    background-image: url('/manor/knowledge-garden-v19/farm/game-ui-r53.webp');
    background-repeat: no-repeat;
  }
  .manor-settings-dialog__leaves.is-left {
    left: calc(-1 * var(--ui-space-19, 19px));
    background-size: 647.4453% 323.7226%;
    background-position: 79.6% 99.6737%;
  }
  .manor-settings-dialog__leaves.is-right {
    right: calc(-1 * var(--ui-space-19, 19px));
    background-size: 645.0909% 322.5455%;
    background-position: 99.3329% 100%;
  }
  .manor-settings-modal .modal-close.b_btn {
    position: absolute;
    top: calc(-1 * var(--ui-space-12, 12px));
    right: calc(-1 * var(--ui-space-12, 12px));
    z-index: 1;
    width: var(--ui-control-44, 44px);
    height: var(--ui-control-44, 44px);
    padding: 0;
    border: 2px solid #fff4d8;
    border-radius: 50%;
    background: linear-gradient(#f3a56b, #d66d40);
    color: #fff9e8;
    box-shadow:
      0 0 0 2px #ba8351,
      0 var(--ui-space-3, 3px) #8e633c;
  }
  .manor-settings-modal .modal-content {
    padding: var(--ui-space-8, 8px) var(--ui-space-24, 24px) var(--ui-space-12, 12px);
    overflow-x: hidden;
    overscroll-behavior: contain;
  }
  .manor-settings-modal .b-switch__track {
    border: 1px solid #a59265;
    box-shadow: inset 0 1px var(--ui-space-2, 2px) #71572d30;
  }
  .manor-settings-modal .b-switch__thumb {
    background: #fffbe9;
  }
  .manor-settings-modal .b-switch:focus-visible {
    outline: 2px solid #526f2f;
    outline-offset: 2px;
    border-radius: var(--ui-space-8, 8px);
  }
  html.light-note-mobile-rendering {
    .manor-settings-modal .modal-header {
      padding: var(--ui-space-22, 22px) var(--ui-space-24, 24px) var(--ui-space-12, 12px);
    }
    .manor-settings-modal .modal-content {
      padding: var(--ui-space-8, 8px) var(--ui-space-12, 12px) var(--ui-space-10, 10px);
    }
  }
</style>
