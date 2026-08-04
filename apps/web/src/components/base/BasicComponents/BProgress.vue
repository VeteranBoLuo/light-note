<template>
  <div
    class="b-progress"
    :class="[`b-progress--${size}`, { 'b-progress--with-info': showInfo }]"
    role="progressbar"
    :aria-valuenow="clamped"
    aria-valuemin="0"
    :aria-valuemax="100"
    :aria-label="ariaLabel || undefined"
    :title="title || String(clamped)"
  >
    <div class="b-progress__trail" :style="trailStyle">
      <div class="b-progress__bar" :style="barStyle"></div>
    </div>
    <span v-if="showInfo" class="b-progress__info">{{ clamped }}%</span>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue';

  const props = withDefaults(
    defineProps<{
      /** 进度百分比，超出 0–100 会被夹取（评分类数据可能因统计口径越界） */
      percent?: number;
      size?: 'small' | 'default';
      /** 进度条颜色，通常按阈值区间取色 */
      strokeColor?: string;
      /** 未完成部分的底色 */
      trailColor?: string;
      showInfo?: boolean;
      title?: string;
      ariaLabel?: string;
    }>(),
    {
      percent: 0,
      size: 'default',
      strokeColor: '',
      trailColor: '',
      showInfo: false,
      title: '',
      ariaLabel: '',
    },
  );

  const clamped = computed(() => {
    const value = Number(props.percent);
    if (!Number.isFinite(value)) return 0;
    return Math.min(100, Math.max(0, Math.round(value)));
  });

  const barStyle = computed(() => ({
    width: `${clamped.value}%`,
    background: props.strokeColor || 'var(--primary-color)',
  }));

  const trailStyle = computed(() =>
    props.trailColor ? { background: props.trailColor } : { background: 'var(--surface-divider-color)' },
  );
</script>

<style lang="less" scoped>
  .b-progress {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    width: 100%;
  }

  .b-progress__trail {
    flex: 1;
    min-width: 0;
    height: 8px;
    border-radius: 999px;
    overflow: hidden;
  }

  .b-progress--small .b-progress__trail {
    height: 6px;
  }

  .b-progress__bar {
    height: 100%;
    border-radius: inherit;
    transition: width 0.3s ease;
  }

  .b-progress__info {
    flex: none;
    font-size: 12px;
    color: var(--desc-color);
    font-variant-numeric: tabular-nums;
  }
</style>
