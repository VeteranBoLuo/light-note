<template>
  <div
    class="profile-background-surface"
    :class="{ 'is-decorated': background, 'is-night-art': background?.dark, 'is-animated': background?.animated }"
  >
    <ProfileBackgroundArt v-if="background" :background-id="backgroundId" />
    <div v-if="background" class="profile-background-surface__veil" aria-hidden="true" />
    <slot />
    <BButton
      v-if="background?.animated"
      class="profile-background-surface__motion"
      size="small"
      :aria-pressed="!paused"
      @click="toggle"
    >
      <SvgIcon :src="paused ? icon.ai.play : icon.ai.pause" size="13" aria-hidden="true" />
      {{ t(paused ? 'profileBackgrounds.playMotion' : 'profileBackgrounds.pauseMotion') }}
    </BButton>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import icon from '@/config/icon';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import ProfileBackgroundArt from './ProfileBackgroundArt.vue';
  import { useProfileBackgroundMotion } from '@/composables/useProfileBackgroundMotion';
  import { profileBackground } from '@/config/profileBackgrounds';
  const props = defineProps<{ backgroundId?: string | null }>();
  const background = computed(() => profileBackground(props.backgroundId));
  const { t } = useI18n();
  const { paused, toggle } = useProfileBackgroundMotion();
</script>

<style scoped lang="less">
  .profile-background-surface.is-decorated {
    --text-color: #263530;
    --desc-color: #4f625a;
    --primary-color: #365d56;
    --card-background: #fbfcfa;
    --surface-border-color: #b7c9c0;
    --primary-btn-bg-color: var(--card-background);
    --workspace-purple-text: var(--primary-color);
    position: relative;
    isolation: isolate;
    min-width: 0;
    border: 1px solid var(--surface-border-color);
    border-radius: 16px;
    background-color: #f4f5ee;
    color: var(--text-color);
  }
  .profile-background-surface__veil {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    pointer-events: none;
    background: linear-gradient(90deg, rgba(249, 248, 240, 0.85), rgba(249, 248, 240, 0.38) 56%, transparent 94%);
  }
  .is-decorated > :slotted(*) {
    position: relative;
    z-index: 1;
  }
  .profile-background-surface.is-animated > :slotted(*) {
    margin-bottom: var(--ui-space-24, 24px);
  }
  .profile-background-surface__motion.b_btn {
    position: absolute;
    right: var(--ui-space-8, 8px);
    bottom: var(--ui-space-8, 8px);
    z-index: 2;
    gap: var(--ui-space-4, 4px);
    font-size: var(--ui-font-11, 11px);
    border: 1px solid var(--surface-border-color);
  }
  .is-night-art .profile-background-surface__veil {
    background: linear-gradient(90deg, rgba(17, 21, 44, 0.94), rgba(17, 21, 44, 0.65) 48%, transparent 88%);
  }
  .profile-background-surface.is-night-art :deep(.chat-profile-content__identity-copy) {
    grid-template-columns: minmax(0, 1fr);
    max-width: var(--ui-layout-260, 260px);
    overflow-wrap: anywhere;
  }
  .profile-background-surface.is-night-art :deep(.growth-level-chip) {
    --b-chip-fg: var(--tier-dark);
    --b-chip-border: var(--tier-dark);
    --b-chip-bg: var(--card-background);
  }
  .profile-background-surface.is-night-art {
    --text-color: #f6f5ff;
    --desc-color: #d8dbf2;
    --primary-color: #d5ceff;
    --card-background: #252e56;
    --surface-border-color: #7783aa;
    background-color: #1b2348;
  }
  html.light-note-mobile-rendering .is-night-art .profile-background-surface__veil {
    background: linear-gradient(
      90deg,
      rgba(17, 21, 44, 0.96),
      rgba(17, 21, 44, 0.78) 56%,
      rgba(17, 21, 44, 0.4) 82%,
      transparent
    );
  }
  @media (prefers-reduced-motion: reduce) {
    .profile-background-surface__motion {
      display: none;
    }
  }
</style>
