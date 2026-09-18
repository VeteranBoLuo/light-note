<template>
  <section class="activity-trend" :aria-label="t('adminActivity.trendTitle')">
    <div class="activity-trend__value" aria-live="polite">
      <template v-if="focusedPoint && focusedPoint.total !== null">
        {{ t('adminActivity.point', { date: focusedPoint.date, count: focusedPoint.total }) }}
        <span v-if="focusedPoint.partial"> · {{ t('adminActivity.partialPoint') }}</span>
      </template>
      <template v-else-if="focusedPoint">{{ focusedPoint.date }} · {{ t('adminActivity.missing') }}</template>
      <template v-else>—</template>
    </div>
    <div class="activity-trend__plot">
      <div class="activity-trend__axis" aria-hidden="true"
        ><span>{{ maximum }}</span
        ><span>0</span></div
      >
      <svg
        viewBox="0 0 560 150"
        preserveAspectRatio="none"
        tabindex="0"
        role="group"
        :aria-label="t('adminActivity.chartHint')"
        @keydown.left.prevent="step(-1)"
        @keydown.right.prevent="step(1)"
        @mouseleave="hoverDate = ''"
        @blur="hoverDate = ''"
      >
        <line v-for="y in [10, 75, 140]" :key="y" x1="8" x2="552" :y1="y" :y2="y" class="activity-trend__grid" />
        <polyline
          v-for="(segment, index) in segments"
          :key="index"
          :points="segment"
          class="activity-trend__line"
          vector-effect="non-scaling-stroke"
        />
        <template v-for="(point, index) in points" :key="point.date">
          <line
            v-if="point.date === selectedDate"
            :x1="x(index)"
            :x2="x(index)"
            y1="7"
            y2="143"
            class="activity-trend__selected"
          />
          <circle
            v-if="point.total !== null"
            :cx="x(index)"
            :cy="y(point.total)"
            :r="point.date === selectedDate ? 4 : 2.5"
            class="activity-trend__dot"
            :class="{ 'is-partial': point.partial }"
          />
          <rect
            :x="Math.max(0, x(index) - 272 / Math.max(1, points.length - 1))"
            y="0"
            :width="544 / Math.max(1, points.length - 1)"
            height="150"
            class="activity-trend__hit"
            @mouseenter="hoverDate = point.date"
            @click="emit('select', point.date)"
          >
            <title>{{ point.date }} · {{ point.total ?? t('adminActivity.missing') }}</title>
          </rect>
        </template>
      </svg>
    </div>
    <div class="activity-trend__dates"
      ><span>{{ points[0]?.date.slice(5) }}</span
      ><span>{{ points.at(-1)?.date.slice(5) }}</span></div
    >
  </section>
</template>
<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { ActivityTrendPoint } from '@/api/userActivity';
  const props = defineProps<{ points: ActivityTrendPoint[]; selectedDate: string }>();
  const emit = defineEmits<{ select: [date: string] }>();
  const { t } = useI18n();
  const hoverDate = ref('');
  const maximum = computed(() => Math.max(1, ...props.points.map((p) => p.total ?? 0)));
  const focusedPoint = computed(() => props.points.find((p) => p.date === (hoverDate.value || props.selectedDate)));
  const x = (index: number) => 8 + (index * 544) / Math.max(1, props.points.length - 1);
  const y = (total: number) => 140 - (total / maximum.value) * 130;
  const segments = computed(() => {
    const result: string[] = [];
    let segment: string[] = [];
    for (const [index, point] of props.points.entries()) {
      if (point.total === null) {
        if (segment.length) result.push(segment.join(' '));
        segment = [];
      } else segment.push(`${x(index)},${y(point.total)}`);
    }
    if (segment.length) result.push(segment.join(' '));
    return result;
  });
  function step(direction: number) {
    if (!props.points.length) return;
    const current = props.points.findIndex((p) => p.date === props.selectedDate);
    const index =
      current < 0 ? props.points.length - 1 : Math.max(0, Math.min(props.points.length - 1, current + direction));
    hoverDate.value = '';
    emit('select', props.points[index].date);
  }
</script>
<style scoped lang="less">
  .activity-trend {
    flex: none;
    min-width: 0;
  }
  .activity-trend__value {
    min-height: 22px;
    font-size: 13px;
    font-weight: 600;
  }
  .activity-trend__plot {
    display: flex;
    height: 112px;
    gap: 8px;
  }
  .activity-trend__axis {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 6px 0;
    min-width: 24px;
  }
  .activity-trend svg {
    width: 100%;
    min-width: 0;
    overflow: hidden;
    border-radius: 4px;
  }
  .activity-trend svg:focus-visible {
    outline: 2px solid var(--primary-color);
  }
  .activity-trend__grid {
    stroke: var(--surface-border-color);
  }
  .activity-trend__line {
    fill: none;
    stroke: var(--primary-color);
    stroke-width: 2;
  }
  .activity-trend__dot {
    fill: var(--primary-color);
    stroke: var(--primary-color);
  }
  .activity-trend__dot.is-partial {
    fill: var(--surface-card-bg);
    stroke-width: 2;
  }
  .activity-trend__selected {
    stroke: var(--desc-color);
    stroke-dasharray: 4 4;
  }
  .activity-trend__hit {
    fill: transparent;
    cursor: pointer;
  }
  .activity-trend__dates {
    display: flex;
    justify-content: space-between;
    padding-left: 32px;
  }
  .activity-trend__axis,
  .activity-trend__dates {
    color: var(--desc-color);
    font-size: 12px;
  }
</style>
