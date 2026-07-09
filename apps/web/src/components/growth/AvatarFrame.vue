<template>
  <div class="af" :class="`af-tier-${tier}`" :style="{ '--af-grad': grad, width: box + 'px', height: box + 'px' }">
    <span v-if="tier >= 4" class="af-halo"></span>
    <div class="af-ring">
      <svg-icon :src="src || icon.navigation.user" :size="size" class="af-img" />
    </div>
    <span v-if="tier >= 4" class="af-crown">{{ tier === 5 ? '👑' : '⭐' }}</span>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import { tierOf, tierGradient } from '@/config/growthTier';

  const props = defineProps<{ src?: string; level?: number; size?: number }>();
  const tier = computed(() => tierOf(props.level || 1));
  const grad = computed(() => tierGradient(props.level || 1));
  const size = computed(() => props.size || 32);
  const box = computed(() => size.value + 8); // 框比头像大一圈(留出渐变环 + 光环)
</script>

<style scoped lang="less">
  .af {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  /* 渐变环:padding 形成的一圈 tier 色,内部头像用背景色抠出圆 */
  .af-ring {
    position: relative;
    z-index: 1;
    display: inline-flex;
    padding: 2.5px;
    border-radius: 50%;
    background: var(--af-grad);
  }
  .af-img {
    display: block;
    border-radius: 50%;
    background: var(--background-color);
    box-shadow: 0 0 0 1.5px var(--background-color);
  }
  /* Tier 4/5:发光 */
  .af-tier-4 .af-ring {
    box-shadow: 0 0 10px -1px rgba(251, 191, 36, 0.75);
  }
  .af-tier-5 .af-ring {
    box-shadow: 0 0 14px -1px rgba(244, 63, 94, 0.8);
  }
  /* Tier 4/5:角标 */
  .af-crown {
    position: absolute;
    z-index: 2;
    top: -5px;
    right: -3px;
    font-size: 13px;
    line-height: 1;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.4));
  }
  /* Tier 4/5:旋转光环(满级更亮) */
  .af-halo {
    position: absolute;
    inset: -2px;
    border-radius: 50%;
    background: conic-gradient(from 0deg, transparent, var(--af-grad), transparent 60%);
    opacity: 0.55;
    animation: af-spin 3.2s linear infinite;
  }
  .af-tier-5 .af-halo {
    opacity: 0.8;
    animation-duration: 2.4s;
  }
  @keyframes af-spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
