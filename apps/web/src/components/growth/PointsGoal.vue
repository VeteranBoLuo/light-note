<template>
  <section ref="root" class="points-goal" :class="{ 'is-mobile': mobile }" :aria-busy="loading || saving">
    <div v-if="loading && !summary" class="points-goal-state"><BLoading inline loading /></div>
    <div v-if="error" class="points-goal-state" role="alert">
      <span>{{ t('growth.pointsCenterLoadFailed') }}</span>
      <BButton :loading="loading" @click="load">{{ t('common.retry') }}</BButton>
    </div>
    <template v-if="summary">
      <header class="points-goal-heading">
        <div class="points-goal-heading__copy">
          <h3>{{ t('growth.pointsCenterGoal') }}</h3>
          <p>{{
            t(summary.goal?.enabled || editing ? 'growth.pointsCenterGoalHint' : 'growth.pointsCenterGoalEmpty')
          }}</p>
        </div>
        <div v-if="summary.goal?.enabled && !editing" class="points-goal-actions">
          <BButton type="text" data-goal-edit :disabled="actionDisabled" @click="startEditing">
            {{ t('growth.pointsCenterGoalChange') }}
          </BButton>
          <BButton type="text" :disabled="actionDisabled" :loading="saving" @click="saveGoal(false)">
            {{ t('growth.pointsCenterGoalDisable') }}
          </BButton>
        </div>
        <BButton v-else-if="!editing" type="primary" data-goal-edit :disabled="actionDisabled" @click="startEditing">
          {{ t('growth.pointsCenterGoalSet') }}
        </BButton>
      </header>

      <form v-if="editing" class="points-goal-editor" @submit.prevent="saveGoal(true)">
        <div class="points-goal-editor__field">
          <span class="points-goal-editor__label">{{ t('growth.pointsCenterGoalChoose') }}</span>
          <BSelect
            v-model:value="goalItemId"
            :options="goalOptions"
            :disabled="actionDisabled"
            :placeholder="t('growth.pointsCenterGoalChoose')"
            :aria-label="t('growth.pointsCenterGoalChoose')"
            show-search
            allow-clear
          />
        </div>
        <div class="points-goal-editor__actions">
          <BButton
            type="primary"
            native-type="submit"
            :loading="saving"
            :disabled="actionDisabled || !goalItemId || !isAvailable(goalItemId)"
          >
            {{ t('growth.pointsCenterGoalSave') }}
          </BButton>
          <BButton :disabled="saving" @click="cancelEditing">{{ t('common.cancel') }}</BButton>
        </div>
      </form>

      <div v-else-if="summary.goal?.enabled" class="points-goal-progress">
        <div class="points-goal-product-row">
          <div class="points-goal-product">
            <span class="points-goal-product__icon" aria-hidden="true"><SvgIcon :src="goalIcon" size="25" /></span>
            <div class="points-goal-product__copy">
              <strong>{{ goalName }}</strong>
              <p v-if="goalDescription">{{ goalDescription }}</p>
            </div>
          </div>
          <div v-if="goalUnavailable" class="points-goal-unavailable" role="status">
            <SvgIcon :src="icon.message.warning" size="16" aria-hidden="true" />
            {{ t('growth.pointsCenterGoalUnavailable') }}
          </div>
          <div v-else class="points-goal-balance">
            <strong v-if="goalReached" class="points-goal-reached" role="status">
              <SvgIcon :src="icon.growth.action" size="17" aria-hidden="true" />
              {{ t('growth.pointsCenterGoalReached') }}
            </strong>
            <strong v-else class="points-goal-shortfall">
              {{ t('growth.pointsCenterGoalShortfall', { n: formatNumber(shortfall) }) }}
            </strong>
            <span>{{
              t('growth.pointsCenterGoalBalance', { balance: formatNumber(balance), price: formatNumber(price) })
            }}</span>
          </div>
        </div>
        <BProgress
          v-if="!goalUnavailable"
          :percent="progress"
          :aria-label="t('growth.pointsCenterGoalProgress')"
          size="small"
          show-info
        />
        <div v-if="!goalUnavailable" class="points-goal-meta">
          <div class="points-goal-meta__copy">
            <template v-if="goalReached">
              <p>{{ redemptionRestriction || t('growth.pointsCenterGoalReachedHint') }}</p>
            </template>
            <template v-else-if="summary.lowPressureMode">
              <p>{{ t('growth.pointsCenterGoalLowPressure') }}</p>
            </template>
            <template v-else-if="estimate">
              <strong>{{
                t('growth.pointsCenterGoalEstimate', { min: estimate.minDays, max: estimate.maxDays })
              }}</strong>
              <p class="points-goal-disclaimer">{{ t('growth.pointsCenterGoalDisclaimer') }}</p>
            </template>
          </div>
          <BButton
            v-if="goalReached"
            type="text"
            :disabled="actionDisabled || !!redemptionRestriction"
            :title="redemptionRestriction"
            @click="locateReward"
          >
            {{ t('growth.pointsCenterGoalRedeem') }}
            <SvgIcon :src="icon.arrow_right" size="15" aria-hidden="true" />
          </BButton>
        </div>
      </div>
      <p v-if="saveError" class="points-goal-save-error" role="alert">{{ t('growth.pointsCenterGoalSaveFailed') }}</p>
    </template>
  </section>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import type { ShopItem } from '@/composables/useGrowth';
  import { useI18n } from 'vue-i18n';
  import growthApi from '@/api/growthApi.ts';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BProgress from '@/components/base/BasicComponents/BProgress.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';

  interface GoalOption {
    id: string;
    name: string;
    cost: number;
    effect?: string | null;
  }
  interface PointsGoalSummary {
    balance: number;
    lowPressureMode?: boolean;
    goal?: {
      enabled: boolean;
      itemId?: string | null;
      unavailable?: boolean;
      item?: GoalOption | null;
      balance?: number;
      price?: number;
      estimate?: { minDays: number; maxDays: number } | null;
    };
    goalOptions?: GoalOption[];
  }

  const props = withDefaults(
    defineProps<{
      readOnly?: boolean;
      refreshKey?: number;
      catalog?: ShopItem[];
      balance?: number;
      level?: number;
      purchaseEnabled?: boolean;
      mobile?: boolean;
    }>(),
    { readOnly: false, refreshKey: 0, level: 0, purchaseEnabled: true, mobile: false },
  );
  const emit = defineEmits<{ redeem: [itemId: string] }>();
  const { t, te, locale } = useI18n();
  const root = ref<HTMLElement | null>(null);
  const summary = ref<PointsGoalSummary | null>(null);
  const loading = ref(false);
  const saving = ref(false);
  const error = ref(false);
  const editing = ref(false);
  const saveError = ref(false);
  const goalItemId = ref<string | null>(null);
  const actionDisabled = computed(() => props.readOnly || saving.value || loading.value || error.value);
  const goalCatalogItem = computed(() => props.catalog?.find((item) => item.id === summary.value?.goal?.itemId));

  function itemName(item: { id: string; name: string; effect?: string | null }) {
    const key = item.effect === 'background' ? `profileBackgrounds.${item.id}` : `growth.shopItems.${item.id}.name`;
    return te(key) ? t(key) : item.name;
  }
  const goalOptions = computed(() =>
    (summary.value?.goalOptions || [])
      .filter((item) => isAvailable(item.id))
      .map((item) => ({
        value: item.id,
        label: `${itemName(item)} · ${formatNumber(item.cost)} ${t('growth.points')}`,
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
  const price = computed(() => Number(goalCatalogItem.value?.cost ?? summary.value?.goal?.price ?? 0));
  const goalUnavailable = computed(() =>
    Boolean(
      summary.value?.goal?.enabled &&
        (summary.value.goal.unavailable ||
          !summary.value.goal.itemId ||
          price.value <= 0 ||
          !isAvailable(summary.value.goal.itemId)),
    ),
  );
  const goalItem = computed(() => goalCatalogItem.value || summary.value?.goal?.item);
  const goalName = computed(() =>
    goalItem.value ? itemName(goalItem.value) : t('growth.pointsCenterGoalUnavailable'),
  );
  const goalDescription = computed(() => {
    const item = goalCatalogItem.value;
    if (!item) return '';
    const key =
      item.effect === 'background' ? `profileBackgrounds.${item.id}Description` : `growth.shopItems.${item.id}.desc`;
    return te(key) ? t(key) : item.desc;
  });
  const goalIcon = computed(() => {
    if (goalItem.value?.effect === 'storage') return icon.growth.storage;
    if (goalItem.value?.effect === 'ai_pack') return icon.growth.ai;
    return icon.growth.reward;
  });
  const balance = computed(() => Number(props.balance ?? summary.value?.goal?.balance ?? summary.value?.balance ?? 0));
  const shortfall = computed(() => Math.max(0, price.value - balance.value));
  const progress = computed(() =>
    price.value > 0 ? Math.max(0, Math.min(100, Math.round((balance.value / price.value) * 100))) : 0,
  );
  const goalReached = computed(() => !goalUnavailable.value && price.value > 0 && shortfall.value === 0);
  const estimate = computed(() => {
    if (goalReached.value || summary.value?.lowPressureMode) return null;
    if (balance.value !== Number(summary.value?.goal?.balance) || price.value !== Number(summary.value?.goal?.price))
      return null;
    return summary.value?.goal?.estimate;
  });
  const redemptionRestriction = computed(() => {
    if (props.readOnly) return t('growth.adminContextActionUnavailable');
    if (!props.purchaseEnabled) return t('growth.shopMaintenance');
    const minLevel = Number(goalCatalogItem.value?.minLevel || 0);
    return props.level < minLevel ? t('growth.shopLevelNeed', { n: minLevel }) : '';
  });
  function formatNumber(value: unknown) {
    return Number(value || 0).toLocaleString(locale.value);
  }
  async function startEditing() {
    if (actionDisabled.value) return;
    const id = summary.value?.goal?.itemId;
    goalItemId.value = id && isAvailable(id) ? id : null;
    saveError.value = false;
    editing.value = true;
    await nextTick();
    root.value?.querySelector<HTMLElement>('[role="combobox"]')?.focus();
  }
  async function cancelEditing() {
    if (saving.value) return;
    editing.value = false;
    saveError.value = false;
    goalItemId.value = summary.value?.goal?.itemId || null;
    await nextTick();
    root.value?.querySelector<HTMLButtonElement>('[data-goal-edit]')?.focus();
  }
  function locateReward() {
    if (actionDisabled.value || !goalReached.value || redemptionRestriction.value || !summary.value?.goal?.itemId)
      return;
    emit('redeem', summary.value.goal.itemId);
  }

  let generation = 0;
  let disposed = false;
  onBeforeUnmount(() => {
    disposed = true;
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
      if (!editing.value) goalItemId.value = response.data?.goal?.itemId || null;
    } catch {
      if (current === generation) error.value = true;
    } finally {
      if (current === generation) loading.value = false;
    }
  }
  async function saveGoal(enabled: boolean) {
    if (actionDisabled.value || (enabled && (!goalItemId.value || !isAvailable(goalItemId.value)))) return;
    saving.value = true;
    saveError.value = false;
    const current = generation;
    const itemId = enabled ? goalItemId.value : summary.value?.goal?.itemId || null;
    try {
      const response = await growthApi.updatePointsGoal({ itemId, enabled });
      if (current !== generation) return;
      if (response?.status !== 200 || !response.data?.ok) throw new Error('POINTS_GOAL_SAVE_FAILED');
      editing.value = false;
      message.success(t('growth.pointsCenterGoalSaved'));
      await load();
    } catch {
      if (current === generation) saveError.value = true;
    } finally {
      if (!disposed) saving.value = false;
    }
  }
  watch(
    () => props.refreshKey,
    () => {
      if (!saving.value) void load();
    },
  );
  watch(
    () => props.readOnly,
    (readOnly) => {
      if (readOnly) editing.value = false;
    },
  );
  onMounted(load);
</script>

<style scoped lang="less">
  .points-goal {
    display: grid;
    gap: var(--ui-space-16, 16px);
    min-width: 0;
    padding: var(--ui-space-18, 18px);
    border: 1px solid var(--surface-border-color);
    border-color: color-mix(in srgb, var(--primary-color) 25%, var(--surface-border-color));
    border-radius: 12px;
    background: var(--surface-card-bg);
  }
  .points-goal-state,
  .points-goal-actions,
  .points-goal-editor__actions {
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
  }
  .points-goal-state {
    flex-wrap: wrap;
    color: var(--desc-color);
    font-size: var(--ui-font-13, 13px);
  }
  .points-goal-heading,
  .points-goal-product-row,
  .points-goal-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--ui-space-10, 10px) var(--ui-space-16, 16px);
  }
  .points-goal-heading {
    align-items: center;
    gap: var(--ui-space-4, 4px) var(--ui-space-12, 12px);
  }
  .points-goal-heading__copy {
    display: contents;
  }
  .points-goal-heading h3 {
    flex: 1 1 min-content;
    min-width: 0;
    margin: 0;
    font-size: var(--ui-font-15, 15px);
    font-weight: 600;
    overflow-wrap: break-word;
  }
  .points-goal p {
    margin: var(--ui-space-4, 4px) 0 0;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.6;
    overflow-wrap: anywhere;
  }
  .points-goal-heading p {
    flex: 0 0 100%;
    order: 1;
    margin: 0;
  }
  .points-goal-heading > .points-goal-actions,
  .points-goal-heading > :deep(.b_btn) {
    flex: 0 0 auto;
  }
  .points-goal-actions {
    flex-wrap: wrap;
  }
  .points-goal-actions :deep(.b_btn),
  .points-goal-meta :deep(.b_btn) {
    gap: var(--ui-space-4, 4px);
    font-size: var(--ui-font-13, 13px);
  }
  .points-goal-editor {
    display: flex;
    align-items: flex-end;
    flex-wrap: wrap;
    gap: var(--ui-space-12, 12px);
  }
  .points-goal-editor__field {
    display: grid;
    flex: 1 1 var(--ui-layout-320, 320px);
    min-width: 0;
    gap: var(--ui-space-6, 6px);
  }
  .points-goal-editor__label {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .points-goal .points-goal-save-error {
    color: var(--danger-color);
  }
  .points-goal-progress {
    display: grid;
    gap: var(--ui-space-12, 12px);
    min-width: 0;
  }
  .points-goal-product {
    display: flex;
    align-items: center;
    flex: 1 1 var(--ui-layout-200, 200px);
    min-width: 0;
    gap: var(--ui-space-12, 12px);
  }
  .points-goal-product__icon {
    display: grid;
    place-items: center;
    flex: 0 0 var(--ui-layout-44, 44px);
    width: var(--ui-layout-44, 44px);
    height: var(--ui-layout-44, 44px);
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    color: var(--workspace-purple-text);
    background: var(--workspace-purple-selected);
  }
  .points-goal-product__copy {
    min-width: 0;
    font-size: var(--ui-font-14, 14px);
    overflow-wrap: anywhere;
  }
  .points-goal-balance {
    display: grid;
    gap: var(--ui-space-4, 4px);
    font-variant-numeric: tabular-nums;
  }
  .points-goal-balance > span {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .points-goal-shortfall {
    font-size: var(--ui-font-15, 15px);
    color: var(--warning-color);
  }
  .points-goal-reached,
  .points-goal-unavailable {
    display: inline-flex;
    align-items: center;
    gap: var(--ui-space-5, 5px);
    font-size: var(--ui-font-13, 13px);
  }
  .points-goal-reached {
    color: var(--success-color);
  }
  .points-goal-unavailable {
    color: var(--danger-color);
  }
  .points-goal-meta {
    align-items: flex-end;
  }
  .points-goal-meta__copy {
    flex: 1 1 var(--ui-layout-200, 200px);
    min-width: 0;
    font-size: var(--ui-font-13, 13px);
  }
  .points-goal-meta__copy strong {
    font-weight: 500;
  }
  .points-goal-meta__copy > p:first-child {
    margin-top: 0;
  }
  .points-goal.is-mobile {
    padding: var(--ui-space-14, 14px);
    gap: var(--ui-space-12, 12px);
  }
</style>
