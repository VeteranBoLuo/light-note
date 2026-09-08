<template>
  <BChip tone="neutral" class="growth-level-chip" :style="palette">
    Lv.{{ level }} {{ name }}
  </BChip>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import { tierOf, TIER_CHIP_COLORS } from '@/config/growthTier';

  const props = defineProps<{ level: number; name: string }>();
  const palette = computed(() => {
    const colors = TIER_CHIP_COLORS[tierOf(props.level)];
    return { '--tier-light': colors.light, '--tier-dark': colors.dark };
  });
</script>

<style scoped lang="less">
  .growth-level-chip {
    --b-chip-fg: var(--tier-light);
    --b-chip-border: var(--tier-light);
    --b-chip-bg: var(--card-background);
    --b-chip-bg: color-mix(in srgb, var(--b-chip-fg) 7%, var(--card-background));
    min-height: 0;
    padding: 1px 6px;
    font-size: 9px;
    line-height: 14px;
    font-weight: 700;
  }

  html[data-theme='night'] .growth-level-chip {
    --b-chip-fg: var(--tier-dark);
    --b-chip-border: var(--tier-dark);
  }
</style>
