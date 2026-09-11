<template>
  <div class="points-goal">
    <div v-if="loading && !summary" class="points-goal-state"><BLoading inline loading /></div>
    <div v-else-if="error" class="points-goal-state" role="alert">
      <span>{{ t('growth.pointsCenterLoadFailed') }}</span>
      <BButton size="small" :loading="loading" @click="load">{{ t('common.retry') }}</BButton>
    </div>
    <template v-if="summary">
      <section class="points-goal-card">
        <div class="points-center-heading">
          <div>
            <h3>{{ t('growth.pointsCenterGoal') }}</h3>
            <p>{{ t('growth.pointsCenterGoalHint') }}</p>
          </div>
        </div>
        <div class="points-goal-controls">
          <BSelect
            v-model:value="goalItemId"
            :options="goalOptions"
            :disabled="readOnly || saving || loading || error"
            :placeholder="t('growth.pointsCenterGoalChoose')"
            :aria-label="t('growth.pointsCenterGoalChoose')"
            show-search
            allow-clear
          />
          <BButton
            type="primary"
            :loading="saving"
            :disabled="readOnly || saving || loading || error || !goalItemId || !isAvailable(goalItemId)"
            @click="saveGoal(true)"
          >
            {{ t('growth.pointsCenterGoalSave') }}
          </BButton>
          <BButton
            v-if="summary.goal?.enabled"
            :disabled="readOnly || saving || loading || error"
            @click="saveGoal(false)"
          >
            {{ t('growth.pointsCenterGoalDisable') }}
          </BButton>
        </div>

        <div v-if="summary.goal?.enabled" class="points-goal-progress">
          <div class="points-goal-title">
            <strong>{{ goalName }}</strong>
            <span v-if="goalUnavailable" class="points-goal-unavailable">
              {{ t('growth.pointsCenterGoalUnavailable') }}
            </span>
            <span v-else>{{ formatNumber(summary.goal?.balance) }} / {{ formatNumber(summary.goal?.price) }}</span>
          </div>
          <BProgress v-if="!goalUnavailable" :percent="summary.goal?.progress || 0" size="small" />
          <div v-if="!goalUnavailable" class="points-goal-meta">
            <span>{{ t('growth.pointsCenterGoalShortfall', { n: formatNumber(summary.goal?.shortfall) }) }}</span>
            <span v-if="!goalUnavailable && summary.goal?.estimate">
              {{
                t('growth.pointsCenterGoalEstimate', {
                  min: summary.goal.estimate.minDays,
                  max: summary.goal.estimate.maxDays,
                })
              }}
            </span>
          </div>
          <p v-if="!goalUnavailable && summary.goal?.estimate" class="points-goal-disclaimer">
            {{ t('growth.pointsCenterGoalDisclaimer') }}
          </p>
          <p v-else-if="summary.lowPressureMode" class="points-goal-disclaimer">
            {{ t('growth.pointsCenterGoalLowPressure') }}
          </p>
        </div>
        <p v-else class="points-goal-empty">{{ t('growth.pointsCenterGoalEmpty') }}</p>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import type { ShopItem } from '@/composables/useGrowth';
  import { useI18n } from 'vue-i18n';
  import growthApi from '@/api/growthApi.ts';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BProgress from '@/components/base/BasicComponents/BProgress.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';

  const props = withDefaults(defineProps<{ readOnly?: boolean; refreshKey?: number; catalog?: ShopItem[] }>(), {
    readOnly: false,
    refreshKey: 0,
  });
  const { t, locale } = useI18n();
  const summary = ref<any>(null);
  const loading = ref(false);
  const saving = ref(false);
  const error = ref(false);
  const goalItemId = ref<string | null>(null);

  const goalOptions = computed(() =>
    (summary.value?.goalOptions || [])
      .filter((item: any) => isAvailable(item.id))
      .map((item: any) => ({
        value: item.id,
        label: `${item.name} · ${formatNumber(item.cost)} ${t('growth.points')}`,
      })),
  );
  function isAvailable(id: string) {
    if (!props.catalog) return true;
    const item = props.catalog.find((item) => item.id === id);
    return Boolean(
      item &&
      item.acquisition !== 'achievement' &&
      !item.limitReached &&
      !item.unavailableReasons?.includes('purchase_limit') &&
      !(item.purchaseLimit && Number(item.purchaseCount || 0) >= item.purchaseLimit) &&
      !(item.owned && !item.repeatable),
    );
  }
  const goalUnavailable = computed(() =>
    Boolean(
      summary.value?.goal?.unavailable || (summary.value?.goal?.enabled && !isAvailable(summary.value.goal.itemId)),
    ),
  );
  const goalName = computed(
    () =>
      summary.value?.goal?.item?.name ||
      goalOptions.value.find((item: any) => item.value === summary.value?.goal?.itemId)?.label ||
      t('growth.pointsCenterGoalUnavailable'),
  );
  function formatNumber(value: unknown) {
    return Number(value || 0).toLocaleString(locale.value);
  }
  let generation = 0;
  onBeforeUnmount(() => {
    generation++;
  });
  async function load() {
    const current = ++generation;
    loading.value = true;
    error.value = false;
    try {
      const response = await growthApi.getPointsSummary();
      if (current !== generation) return;
      if (response?.status !== 200 || !response.data || response.data.visitor)
        throw new Error('POINTS_CENTER_LOAD_FAILED');
      summary.value = response.data;
      goalItemId.value = response.data?.goal?.itemId || null;
    } catch (loadError) {
      if (current !== generation) return;
      error.value = true;
    } finally {
      if (current === generation) loading.value = false;
    }
  }

  async function saveGoal(enabled: boolean) {
    if (
      props.readOnly ||
      saving.value ||
      loading.value ||
      error.value ||
      (enabled && (!goalItemId.value || !isAvailable(goalItemId.value)))
    )
      return;
    saving.value = true;
    const current = generation;
    try {
      const response = await growthApi.updatePointsGoal({ itemId: goalItemId.value, enabled });
      if (current !== generation) return;
      if (response?.status !== 200 || !response.data?.ok) throw new Error('POINTS_GOAL_SAVE_FAILED');
      message.success(t('growth.pointsCenterGoalSaved'));
      await load();
    } catch (saveError) {
      if (current !== generation) return;
      message.error(t('growth.pointsCenterGoalSaveFailed'));
    } finally {
      saving.value = false;
    }
  }

  watch(() => props.refreshKey, load);
  onMounted(load);
</script>

<style scoped lang="less">
  .points-goal {
    margin: 16px 0;
    padding: 16px 0;
    border-block: 1px solid var(--card-border-color);
  }
  .points-goal-state {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--desc-color);
  }
  .points-goal-card {
    display: grid;
    gap: 12px;
    min-width: 0;
  }
  .points-center-heading h3 {
    margin: 0;
    font-size: 15px;
  }
  .points-center-heading p {
    margin: 4px 0 0;
    color: var(--desc-color);
    font-size: 12px;
  }
  .points-goal-controls {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 8px;
  }
  .points-goal-progress {
    display: grid;
    gap: 9px;
    padding: 13px;
    border: 1px solid var(--card-border-color);
    border-radius: 11px;
    background: var(--background-color);
  }
  .points-goal-title,
  .points-goal-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .points-goal-title span,
  .points-goal-meta {
    color: var(--desc-color);
    font-size: 13px;
  }
  .points-goal-unavailable {
    color: var(--danger-color) !important;
  }
  .points-goal-disclaimer,
  .points-goal-empty {
    margin: 0;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.55;
  }

  @media (max-width: 767px) {
    .points-goal-controls {
      grid-template-columns: 1fr 1fr;
    }
    .points-goal-controls > :first-child {
      grid-column: 1 / -1;
    }
    .points-goal-title,
    .points-goal-meta {
      flex-wrap: wrap;
    }
  }
</style>
