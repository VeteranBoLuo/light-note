<template>
  <div class="profile-background-surface" :class="{ 'is-decorated': background, 'is-night-art': background?.dark }">
    <ProfileBackgroundArt v-if="background" :background-id="backgroundId" />
    <div v-if="background" class="profile-background-surface__veil" aria-hidden="true" />
    <slot />
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import ProfileBackgroundArt from './ProfileBackgroundArt.vue';
  import { profileBackground } from '@/config/profileBackgrounds';
  const props = defineProps<{ backgroundId?: string | null }>();
  const background = computed(() => profileBackground(props.backgroundId));
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
  .is-night-art .profile-background-surface__veil {
    background: linear-gradient(
      90deg,
      rgba(17, 21, 44, 0.94),
      rgba(17, 21, 44, 0.76) 28%,
      rgba(17, 21, 44, 0.3) 48%,
      transparent 72%
    );
  }
  .profile-background-surface.is-night-art :deep(.chat-profile-content__identity-copy) {
    grid-template-columns: minmax(0, 1fr);
    max-width: var(--ui-layout-260, 260px);
    overflow-wrap: anywhere;
    text-shadow:
      0 1px 2px #11152c,
      0 0 6px #11152c;
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
</style>
