<template>
  <div class="today-growth" :aria-busy="loading">
    <div v-if="loading && !data" class="today-growth__skeleton" aria-hidden="true">
      <span></span><span></span><span></span>
    </div>
    <div v-else-if="error && !data" class="today-growth__error" role="alert">
      <SvgIcon :src="icon.message.warning" size="22" />
      <div><strong>{{ t('growth.todayLoadFailed') }}</strong><span>{{ t('growth.todayLoadFailedDesc') }}</span></div>
      <BButton size="small" @click="$emit('retry')">{{ t('common.retry') }}</BButton>
    </div>
    <template v-else>
      <header class="today-growth__header">
        <div>
          <span class="today-growth__eyebrow">{{ t('growth.todayEyebrow') }}</span>
          <h2>{{ t('growth.todayTitle') }}</h2>
        </div>
        <BButton
          v-if="Number(data?.count || 0) > 0"
          type="primary"
          size="small"
          :loading="claiming"
          :disabled="readOnly || claiming"
          @click="$emit('claim-all')"
        >
          {{ t('growth.claimAllCount', { n: data?.count || 0 }) }}
        </BButton>
      </header>

      <div class="today-growth__metrics">
        <div class="today-growth__metric">
          <SvgIcon :src="icon.growth.action" size="19" />
          <span>{{ t('growth.todayDailyProgress') }}</span>
          <strong>{{ data?.today?.completed || 0 }}/{{ data?.today?.total || 3 }}</strong>
        </div>
        <div class="today-growth__metric">
          <SvgIcon :src="icon.growth.level" size="19" />
          <span class="today-growth__metric-copy">
            <span>{{ t('growth.todayExpCap') }}</span>
            <small>{{ t('growth.todayExpCapHint') }}</small>
          </span>
          <strong>{{ growth?.dailyExp || 0 }}/{{ growth?.dailyCap || 200 }}</strong>
        </div>
        <div class="today-growth__metric">
          <SvgIcon :src="icon.growth.reward" size="19" />
          <span>{{ t('growth.todayClaimable') }}</span>
          <strong>{{ data?.count || 0 }}</strong>
        </div>
      </div>

      <div v-if="data?.nextAction" class="today-growth__next">
        <span class="today-growth__next-icon" aria-hidden="true"><SvgIcon :src="nextActionIcon" size="22" /></span>
        <div>
          <span class="today-growth__next-label">{{ t('growth.nextActionLabel') }}</span>
          <strong>{{ nextActionTitle }}</strong>
          <div class="today-growth__next-meta">
            <small v-if="Number(data.nextAction.reward?.exp || 0) > 0" class="is-reward">
              <SvgIcon :src="icon.growth.level" size="12" />
              {{ t('growth.nextActionExpReward', { n: data.nextAction.reward?.exp || 0 }) }}
            </small>
            <small v-if="Number(data.nextAction.reward?.points || 0) > 0" class="is-reward">
              <SvgIcon :src="icon.growth.coin" size="12" />
              {{ t('growth.nextActionPointsReward', { n: data.nextAction.reward?.points || 0 }) }}
            </small>
            <small v-if="data.nextAction.progress">
              {{
                t('growth.nextActionProgress', {
                  current: data.nextAction.progress.current,
                  target: data.nextAction.progress.target,
                })
              }}
            </small>
          </div>
        </div>
        <BButton
          size="small"
          :disabled="readOnly"
          v-click-log="{ module: '成长', operation: `执行下一步建议-${data.nextAction.action}` }"
          @click="$emit('action', data.nextAction.action)"
        >
          {{ lowPressure ? t('growth.nextActionExplore') : t('growth.nextActionGo') }}
        </BButton>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import type { Growth, GrowthClaimable } from '@/composables/useGrowth.ts';

  const props = withDefaults(
    defineProps<{
      data: GrowthClaimable | null;
      growth: Growth | null;
      loading?: boolean;
      error?: boolean;
      claiming?: boolean;
      readOnly?: boolean;
      lowPressure?: boolean;
    }>(),
    { loading: false, error: false, claiming: false, readOnly: false, lowPressure: false },
  );
  defineEmits<{
    retry: [];
    'claim-all': [];
    action: [action: string];
  }>();
  const { t } = useI18n();

  const nextActionIcon = computed(() => {
    const action = props.data?.nextAction?.action || '';
    if (action.includes('todo')) return icon.growth.action;
    if (action.includes('inbox')) return icon.contextMenu.inbox;
    if (action.includes('reuse')) return icon.noteTemplate.knowledge;
    if (action.includes('file')) return icon.resource.file;
    if (action.includes('bookmark')) return icon.resource.bookmark;
    if (action.includes('report')) return icon.noteDetail.history;
    return icon.growth.create;
  });

  const nextActionTitle = computed(() => {
    const next = props.data?.nextAction;
    if (!next) return '';
    const key = `growth.nextActions.${next.key}`;
    const translated = t(key);
    return translated === key ? t(`growth.nextActionTypes.${next.type}`) : translated;
  });
</script>

<style scoped lang="less">
  .today-growth {
    min-height: 150px;
    padding: 18px;
    border: 1px solid var(--card-border-color);
    border-radius: 16px;
    background: linear-gradient(135deg, color-mix(in srgb, var(--primary-color) 8%, var(--workbench-subcard-bg)), var(--workbench-subcard-bg));
  }
  .today-growth__header,
  .today-growth__next,
  .today-growth__error {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .today-growth__header { justify-content: space-between; }
  .today-growth__eyebrow { color: var(--primary-color); font-size: 11px; font-weight: 700; letter-spacing: 0.08em; }
  h2 { margin: 2px 0 0; color: var(--text-color); font-size: 18px; }
  .today-growth__metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 15px; }
  .today-growth__metric { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 7px; min-width: 0; padding: 10px; border: 1px solid var(--card-border-color); border-radius: 11px; background: var(--background-color); color: var(--primary-color); }
  .today-growth__metric > span { overflow: hidden; color: var(--desc-color); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
  .today-growth__metric-copy { display: flex; min-width: 0; flex-direction: column; gap: 2px; }
  .today-growth__metric-copy > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .today-growth__metric-copy small { color: var(--desc-color); font-size: 10px; line-height: 1.25; white-space: normal; }
  .today-growth__metric strong { color: var(--text-color); font-size: 13px; font-variant-numeric: tabular-nums; }
  .today-growth__next { margin-top: 12px; padding: 11px 12px; border: 1px solid var(--primary-color); border-radius: 11px; background: var(--background-color); }
  .today-growth__next-icon { display: grid; width: 38px; height: 38px; flex: 0 0 38px; place-items: center; border: 1px solid var(--primary-color); border-radius: 10px; background: var(--background-color); color: var(--primary-color); }
  .today-growth__next > div { display: flex; min-width: 0; flex: 1; flex-direction: column; }
  .today-growth__next-label { color: var(--desc-color); font-size: 11px; }
  .today-growth__next strong { overflow: hidden; color: var(--text-color); font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
  .today-growth__next small { color: var(--primary-color); font-size: 11px; }
  .today-growth__next-meta { display: flex; flex-wrap: wrap; gap: 4px 10px; margin-top: 2px; }
  .today-growth__next-meta small { display: inline-flex; align-items: center; gap: 3px; }
  .today-growth__next-meta .is-reward { color: var(--success-color, #168947); font-weight: 600; }
  .today-growth__error { min-height: 110px; justify-content: center; color: var(--warning-color, #b7791f); }
  .today-growth__error div { display: flex; flex-direction: column; }
  .today-growth__error span { color: var(--desc-color); font-size: 12px; }
  .today-growth__skeleton { display: grid; gap: 12px; }
  .today-growth__skeleton span { height: 26px; border-radius: 9px; background: linear-gradient(90deg, var(--hover-background), var(--card-border-color), var(--hover-background)); background-size: 200% 100%; animation: today-growth-shimmer 1.2s linear infinite; }
  .today-growth__skeleton span:nth-child(2) { height: 52px; }
  .today-growth__skeleton span:nth-child(3) { height: 44px; }
  @keyframes today-growth-shimmer { to { background-position: -200% 0; } }
  @media (max-width: 640px) {
    .today-growth { padding: 15px; }
    .today-growth__metrics { grid-template-columns: 1fr; }
    .today-growth__next { align-items: flex-start; flex-wrap: wrap; }
    .today-growth__next .b_btn { margin-left: 50px; }
  }
  @media (prefers-reduced-motion: reduce) { .today-growth__skeleton span { animation: none; } }
  html.light-note-mobile-rendering .today-growth__next { border-color: var(--primary-color); box-shadow: none; }
</style>
