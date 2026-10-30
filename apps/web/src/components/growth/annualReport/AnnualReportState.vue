<template>
  <section class="ar-state" :class="{ 'is-immersive': immersive }" :aria-busy="kind === 'loading' || undefined">
    <template v-if="kind === 'loading'">
      <span class="ars-dots" aria-hidden="true"><i /><i /><i /></span>
      <p role="status">{{ t('annualReport.states.loading', { year }) }}</p>
    </template>
    <template v-else>
      <span class="ars-icon"
        ><SvgIcon :src="kind === 'failed' ? icon.growth.lock : icon.todoWorkspace.star" size="26"
      /></span>
      <h3>{{ title }}</h3>
      <p>{{ body }}</p>
      <div class="ars-actions">
        <BButton v-if="kind === 'failed'" type="primary" @click="emit('retry')">{{
          t('annualReport.states.retry')
        }}</BButton>
        <BButton v-if="kind === 'empty'" type="primary" @click="emit('create')">
          {{ t('annualReport.states.emptyAction') }}
        </BButton>
        <BButton @click="emit('back')">{{ t('annualReport.states.back') }}</BButton>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';

  const props = defineProps<{
    kind: 'loading' | 'failed' | 'empty' | 'upcoming';
    year: number;
    openFrom?: string;
    immersive?: boolean;
  }>();
  const emit = defineEmits<{ retry: []; back: []; create: [] }>();
  const { t, locale } = useI18n();

  const openDate = computed(() =>
    props.openFrom
      ? new Intl.DateTimeFormat(locale.value, { month: 'short', day: 'numeric' }).format(Date.parse(props.openFrom))
      : '',
  );
  const title = computed(() => {
    if (props.kind === 'failed') return t('annualReport.states.failedTitle');
    if (props.kind === 'upcoming') return t('annualReport.states.upcomingTitle', { year: props.year });
    return t('annualReport.states.emptyTitle', { year: props.year });
  });
  const body = computed(() => {
    if (props.kind === 'failed') return t('annualReport.states.failedBody');
    if (props.kind === 'upcoming') return t('annualReport.states.upcomingBody', { date: openDate.value });
    return t('annualReport.states.emptyBody');
  });
</script>

<style scoped lang="less">
  .ar-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--ui-space-12, 12px);
    width: min(100%, var(--ui-layout-560, 560px));
    min-height: var(--ui-layout-420, 420px);
    box-sizing: border-box;
    padding: var(--ui-space-32, 32px);
    border: 1px solid var(--workspace-border);
    border-radius: 16px;
    background: var(--workspace-content);
    color: var(--text-color);
    text-align: center;
  }
  .ar-state.is-immersive {
    width: 100%;
    min-height: 100%;
    border: 0;
    border-radius: 0;
    background: var(--background-color);
  }
  .ar-state h3 {
    margin: var(--ui-space-6, 6px) 0 0;
    font-size: var(--ui-font-17, 17px);
  }
  .ar-state p {
    max-width: var(--ui-layout-320, 320px);
    margin: 0;
    color: var(--desc-color);
    font-size: var(--ui-font-14, 14px);
    line-height: 1.6;
  }
  .ars-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--ui-layout-52, 52px);
    height: var(--ui-layout-52, 52px);
    border: 1px solid currentColor;
    border-radius: 16px;
    color: var(--workspace-purple-text);
  }
  .ars-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--ui-space-10, 10px);
    margin-top: var(--ui-space-8, 8px);
  }
  .ars-dots {
    display: inline-flex;
    gap: var(--ui-space-6, 6px);
  }
  .ars-dots i {
    width: var(--ui-layout-8, 8px);
    height: var(--ui-layout-8, 8px);
    border-radius: 50%;
    background: var(--workspace-purple-text);
    animation: annual-dot 1s infinite ease-in-out;
  }
  .ars-dots i:nth-child(2) {
    animation-delay: 0.15s;
  }
  .ars-dots i:nth-child(3) {
    animation-delay: 0.3s;
  }
  @keyframes annual-dot {
    0%,
    80%,
    100% {
      opacity: 0.3;
      transform: scale(0.8);
    }
    40% {
      opacity: 1;
      transform: scale(1);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ars-dots i {
      animation: none;
      opacity: 0.7;
    }
  }
</style>
