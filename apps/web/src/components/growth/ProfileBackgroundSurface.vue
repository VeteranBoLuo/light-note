<template>
  <div
    class="profile-background-surface"
    :class="{ 'is-decorated': background, 'is-night-art': background?.dark }"
    :style="surfaceStyle"
  >
    <slot />
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { profileBackground } from '@/config/profileBackgrounds';
  const props = defineProps<{ backgroundId?: string | null }>();
  const background = computed(() => profileBackground(props.backgroundId));
  const veil = computed(() => (background.value?.dark ? 'rgba(22, 28, 61, .85)' : 'rgba(250, 249, 244, .85)'));
  const surfaceStyle = computed(() =>
    background.value
      ? {
          backgroundImage: `linear-gradient(90deg, ${veil.value} 0%, transparent 100%), url("${background.value.src}")`,
        }
      : undefined,
  );
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
    min-width: 0;
    border: 1px solid var(--surface-border-color);
    border-radius: 16px;
    background-color: #f4f5ee;
    background-size: cover;
    background-position: center;
    color: var(--text-color);
  }
  .profile-background-surface.is-night-art {
    --text-color: #f6f5ff;
    --desc-color: #d8dbf2;
    --primary-color: #d5ceff;
    --card-background: #252e56;
    --surface-border-color: #7783aa;
    background-color: #1b2348;
  }
</style>
