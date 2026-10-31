<template>
  <BModal
    v-model:visible="visible"
    :title="t('featureShortcut.manager.title')"
    width="min(var(--ui-layout-560, 560px), calc(100vw - var(--ui-space-32, 32px)))"
    :close-disabled="saving"
  >
    <div class="featured-manager">
      <p class="featured-manager__subtitle">
        {{ t('featureShortcut.manager.subtitle', { max: FEATURED_FEATURES_MAX_ITEMS }) }}
      </p>
      <p v-if="loadFailed" class="featured-manager__error" role="alert">{{ t('featureShortcut.manager.loadFailed') }}</p>

      <div class="featured-manager__label">
        {{ t('featureShortcut.manager.current', { count: draft.length, max: FEATURED_FEATURES_MAX_ITEMS }) }}
      </div>
      <p v-if="!draft.length" class="featured-manager__empty">{{ t('featureShortcut.manager.empty') }}</p>
      <ul v-else class="featured-manager__list">
        <li v-for="(item, index) in draft" :key="item.featureId" class="featured-manager__item">
          <span class="featured-manager__icon"><SvgIcon :src="featureOf(item)?.icon || ''" size="15" /></span>
          <span class="featured-manager__item-main">
            <strong>{{ titleOf(item.featureId) }}</strong>
            <span>{{ item.description || descriptionOf(item.featureId) }} · {{ item.publishDate }}</span>
          </span>
          <span class="featured-manager__ops">
            <BButton type="text" :disabled="index === 0 || saving" @click="moveUp(index)">
              {{ t('featureShortcut.manager.moveUp') }}
            </BButton>
            <BButton type="text" class="featured-manager__remove" :disabled="saving" @click="remove(index)">
              {{ t('featureShortcut.manager.remove') }}
            </BButton>
          </span>
        </li>
      </ul>

      <div class="featured-manager__label">{{ t('featureShortcut.manager.add') }}</div>
      <label class="featured-manager__field">
        <span>{{ t('featureShortcut.manager.feature') }}</span>
        <BSelect
          v-model:value="selectedFeatureId"
          :options="featureOptions"
          :placeholder="t('featureShortcut.manager.featurePlaceholder')"
          :aria-label="t('featureShortcut.manager.feature')"
          :disabled="saving || draft.length >= FEATURED_FEATURES_MAX_ITEMS"
          show-search
          allow-clear
        />
      </label>
      <label class="featured-manager__field">
        <span>{{ t('featureShortcut.manager.description') }}</span>
        <BInput
          v-model:value="description"
          :maxlength="FEATURED_FEATURE_DESCRIPTION_MAX"
          :placeholder="selectedFeatureId ? descriptionOf(selectedFeatureId) : t('featureShortcut.manager.descriptionPlaceholder')"
          :disabled="saving || !selectedFeatureId"
        >
          <template #suffix>
            <small class="featured-manager__count">
              {{ Array.from(description).length }} / {{ FEATURED_FEATURE_DESCRIPTION_MAX }}
            </small>
          </template>
        </BInput>
      </label>
      <label class="featured-manager__field featured-manager__date">
        <span>{{ t('featureShortcut.manager.publishDate') }}</span>
        <BDateTimePicker v-model:value="publishDate" :show-time="false" :disabled="saving || !selectedFeatureId" />
      </label>
      <p class="featured-manager__tip">{{ t('featureShortcut.manager.tip') }}</p>
    </div>
    <template #footer>
      <div class="featured-manager__footer">
        <BButton :disabled="saving" @click="visible = false">{{ t('common.cancel') }}</BButton>
        <BButton type="primary" :loading="saving" :disabled="loadFailed" @click="save">{{ t('common.save') }}</BButton>
      </div>
    </template>
  </BModal>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BDateTimePicker from '@/components/base/BasicComponents/BDateTimePicker.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { FEATURE_SHORTCUTS, getFeatureShortcut } from '@/config/featureShortcuts';
  import { useFeaturedFeatures } from '@/composables/useFeatureShortcuts';
  import {
    FEATURED_FEATURE_DESCRIPTION_MAX,
    FEATURED_FEATURES_MAX_ITEMS,
    localDateKey,
    type FeaturedFeatureItem,
  } from '@/utils/featureShortcuts';

  const visible = defineModel<boolean>('visible', { default: false });
  const { t } = useI18n();
  const featured = useFeaturedFeatures();

  const draft = ref<FeaturedFeatureItem[]>([]);
  const loadFailed = ref(false);
  const saving = ref(false);
  const selectedFeatureId = ref('');
  const description = ref('');
  const publishDate = ref(localDateKey());

  const featureOf = (item: FeaturedFeatureItem) => getFeatureShortcut(item.featureId);
  function titleOf(featureId: string) {
    const feature = getFeatureShortcut(featureId);
    return feature ? t(`featureShortcut.items.${feature.key}.title`) : featureId;
  }
  function descriptionOf(featureId: string) {
    const feature = getFeatureShortcut(featureId);
    return feature ? t(`featureShortcut.items.${feature.key}.description`) : '';
  }

  const featureOptions = computed(() =>
    FEATURE_SHORTCUTS.filter((feature) => !draft.value.some((item) => item.featureId === feature.id)).map(
      (feature) => ({
        label: `${t(`featureShortcut.items.${feature.key}.title`)}（${t(`featureShortcut.items.${feature.key}.location`)}）`,
        value: feature.id,
      }),
    ),
  );

  // 换功能时清掉上一项手写的说明，避免误用到新功能上。
  watch(selectedFeatureId, () => {
    description.value = '';
  });

  onMounted(async () => {
    await featured.ensure(true);
    loadFailed.value = featured.state.failed;
    // 功能清单里已删除的项用户看不到，编辑时直接去掉，不占名额。
    draft.value = featured.state.items
      .filter((item) => getFeatureShortcut(item.featureId))
      .map((item) => ({ ...item }));
  });

  function moveUp(index: number) {
    if (index <= 0) return;
    const next = [...draft.value];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    draft.value = next;
  }

  function remove(index: number) {
    draft.value = draft.value.filter((_, itemIndex) => itemIndex !== index);
  }

  async function save() {
    const items = draft.value.map((item) => ({ ...item }));
    if (selectedFeatureId.value) {
      if (items.length >= FEATURED_FEATURES_MAX_ITEMS) {
        message.warning(t('featureShortcut.manager.full', { max: FEATURED_FEATURES_MAX_ITEMS }));
        return;
      }
      items.push({
        featureId: selectedFeatureId.value,
        description: description.value.trim(),
        publishDate: publishDate.value || localDateKey(),
      });
    }
    saving.value = true;
    try {
      const ok = await featured.save(items);
      if (!ok) {
        message.error(t('featureShortcut.manager.saveFailed'));
        return;
      }
      message.success(t('featureShortcut.manager.saved'));
      visible.value = false;
    } catch {
      message.error(t('featureShortcut.manager.saveFailed'));
    } finally {
      saving.value = false;
    }
  }
</script>

<style scoped lang="less">
  .featured-manager {
    display: grid;
    gap: var(--ui-space-10, 10px);
    color: var(--text-color);
    font-size: var(--ui-font-13, 13px);
  }

  .featured-manager__subtitle,
  .featured-manager__tip,
  .featured-manager__empty {
    margin: 0;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.6;
  }

  .featured-manager__error {
    margin: 0;
    color: var(--warning-color);
    font-size: var(--ui-font-12, 12px);
  }

  .featured-manager__label {
    margin-top: var(--ui-space-4, 4px);
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    font-weight: 650;
  }

  .featured-manager__list {
    margin: 0;
    padding: 0;
    display: grid;
    gap: var(--ui-space-8, 8px);
    list-style: none;
  }

  .featured-manager__item {
    padding: var(--ui-space-8, 8px) var(--ui-space-10, 10px);
    display: grid;
    grid-template-columns: var(--ui-layout-28, 28px) minmax(0, 1fr) max-content;
    gap: var(--ui-space-10, 10px);
    align-items: center;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
  }

  .featured-manager__icon {
    width: var(--ui-layout-28, 28px);
    height: var(--ui-layout-28, 28px);
    display: grid;
    place-items: center;
    border-radius: 8px;
    color: var(--workspace-purple-text);
    background: var(--workspace-purple-selected);
  }

  .featured-manager__item-main {
    min-width: 0;
    display: grid;
    gap: var(--ui-space-2, 2px);
  }

  .featured-manager__item-main span {
    overflow: hidden;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .featured-manager__ops {
    display: flex;
    gap: var(--ui-space-2, 2px);
  }

  .featured-manager__ops .b_btn {
    height: var(--ui-control-28, 28px);
    padding: 0 var(--ui-space-6, 6px);
    font-size: var(--ui-font-12, 12px);
  }

  .featured-manager__ops .featured-manager__remove {
    color: var(--danger-color, #e5484d);
  }

  .featured-manager__field {
    display: grid;
    gap: var(--ui-space-6, 6px);
  }

  .featured-manager__field > span {
    font-size: var(--ui-font-12, 12px);
    font-weight: 600;
  }

  .featured-manager__date {
    max-width: var(--ui-layout-240, 240px);
  }

  .featured-manager__count {
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
    white-space: nowrap;
  }

  // 与 BModal 默认页脚留白一致。
  .featured-manager__footer {
    padding: 0 var(--ui-space-20, 20px) var(--ui-space-16, 16px);
    display: flex;
    justify-content: flex-end;
    gap: var(--ui-space-8, 8px);
  }
</style>
