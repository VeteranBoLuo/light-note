<template>
  <article v-if="displayedActions.length" class="growth-next-action">
    <header class="growth-next-action__heading">
      <div>
        <strong>{{ t('growth.nextActionLabel') }}</strong>
        <span>{{ t('growth.nextActionSubtitle') }}</span>
      </div>
      <BButton
        class="growth-next-action__all"
        size="small"
        v-click-log="{ module: '成长', operation: '查看全部成长任务' }"
        @click="$emit('view-all')"
      >
        {{ t('growth.allTasks') }}
      </BButton>
    </header>

    <div class="growth-next-action__items" :class="{ 'is-single': displayedActions.length === 1 }">
      <div v-for="item in displayedActions" :key="`${item.type}:${item.key}`" class="growth-next-action__item">
        <span class="growth-next-action__icon" aria-hidden="true">
          <SvgIcon :src="actionIcon(item)" size="17" />
        </span>
        <div class="growth-next-action__copy">
          <strong>{{ actionTitle(item) }}</strong>
          <span>{{ actionDescription(item) }}</span>
        </div>
        <div class="growth-next-action__meta">
          <small v-if="Number(item.reward?.exp || 0) > 0" class="is-reward">
            {{ t('growth.nextActionExpRewardShort', { n: item.reward?.exp || 0 }) }}
          </small>
          <small v-if="Number(item.reward?.points || 0) > 0" class="is-reward">
            {{ t('growth.nextActionPointsRewardShort', { n: item.reward?.points || 0 }) }}
          </small>
          <small v-if="item.progress">
            {{
              t('growth.nextActionProgress', {
                current: item.progress.current,
                target: item.progress.target,
              })
            }}
          </small>
        </div>
        <BButton
          size="small"
          :disabled="readOnly"
          v-click-log="{ module: '成长', operation: `执行下一步建议-${item.action}` }"
          @click="$emit('action', growthNextActionCommand(item))"
        >
          {{ lowPressure ? t('growth.nextActionExplore') : t('growth.nextActionGo') }}
        </BButton>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { GrowthNextAction } from '@/composables/useGrowth.ts';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import { growthNextActionCommand } from '@/utils/growthNavigation';

  const props = withDefaults(
    defineProps<{
      nextAction: GrowthNextAction | null | undefined;
      additionalActions?: GrowthNextAction[];
      readOnly?: boolean;
      lowPressure?: boolean;
    }>(),
    { additionalActions: () => [], readOnly: false, lowPressure: false },
  );
  defineEmits<{ action: [action: string]; 'view-all': [] }>();
  const { t } = useI18n();

  const displayedActions = computed(() => {
    const unique = new Map<string, GrowthNextAction>();
    for (const item of [props.nextAction, ...props.additionalActions]) {
      if (!item) continue;
      unique.set(`${item.type}:${item.key}`, item);
      if (unique.size >= 2) break;
    }
    return [...unique.values()];
  });

  function actionIcon(item: GrowthNextAction) {
    if (item.type === 'weekly_challenge') return icon.growth.checkin;
    const action = item.action || '';
    if (action.includes('todo')) return icon.growth.action;
    if (action.includes('inbox')) return icon.contextMenu.inbox;
    if (action.includes('reuse')) return icon.noteTemplate.knowledge;
    if (action.includes('file')) return icon.resource.file;
    if (action.includes('bookmark')) return icon.resource.bookmark;
    if (action.includes('report')) return icon.noteDetail.history;
    return icon.growth.create;
  }

  function actionTitle(item: GrowthNextAction) {
    const key = `growth.nextActions.${item.key}`;
    const translated = t(key);
    return translated === key ? t(`growth.nextActionTypes.${item.type}`) : translated;
  }

  function actionDescription(item: GrowthNextAction) {
    const key = `growth.nextActionTypes.${item.type}`;
    const translated = t(key);
    return translated === key ? t('growth.nextActionSubtitle') : translated;
  }
</script>

<style scoped lang="less">
  .growth-next-action {
    min-width: 0;
    height: 100%;
    padding: 12px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 10px;
    border: 1px solid var(--card-border-color);
    border-radius: 16px;
    color: var(--text-color);
    background: var(--workbench-subcard-bg);
    box-shadow: 0 12px 28px -24px rgba(30, 35, 70, 0.35);
  }

  .growth-next-action__heading {
    min-width: 0;
    width: 100%;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }

  .growth-next-action__heading > div {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .growth-next-action__heading strong {
    font-size: 13px;
  }

  .growth-next-action__heading span {
    overflow: hidden;
    color: var(--desc-color);
    font-size: 10.5px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .growth-next-action__all {
    flex: 0 0 auto;
    color: var(--primary-color);
  }

  .growth-next-action__items {
    min-height: 0;
    width: 100%;
    display: grid;
    flex: 1 1 auto;
    grid-template-rows: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .growth-next-action__items.is-single {
    grid-template-rows: minmax(0, 1fr);
  }

  .growth-next-action__item {
    min-width: 0;
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 8px;
    padding: 9px;
    border: 1px solid var(--card-border-color);
    border-radius: 10px;
    background: var(--background-color);
  }

  .growth-next-action__icon {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border: 1px solid var(--primary-color);
    border-radius: 10px;
    color: var(--primary-color);
    background: var(--background-color);
  }

  .growth-next-action__copy {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .growth-next-action__copy strong {
    overflow: hidden;
    color: var(--text-color);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .growth-next-action__copy span,
  .growth-next-action__meta small {
    color: var(--desc-color);
    font-size: 10px;
  }

  .growth-next-action__copy span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .growth-next-action__meta {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 4px;
  }

  .growth-next-action__meta small {
    display: inline-flex;
    align-items: center;
    padding: 2px 6px;
    border: 1px solid var(--card-border-color);
    border-radius: 999px;
    white-space: nowrap;
  }

  .growth-next-action__meta .is-reward {
    border-color: color-mix(in srgb, var(--warning-color, #ad6800) 55%, var(--card-border-color));
    color: var(--warning-color, #ad6800);
    font-weight: 600;
  }

  @media (max-width: 640px) {
    .growth-next-action {
      padding: 12px;
    }

    .growth-next-action__item {
      grid-template-columns: 30px minmax(0, 1fr) auto;
    }

    .growth-next-action__meta {
      grid-column: 2 / -1;
      justify-content: flex-start;
    }
  }
</style>
