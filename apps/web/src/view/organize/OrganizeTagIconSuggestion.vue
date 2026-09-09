<template>
  <section class="icon-suggestion" :aria-busy="busy">
    <div class="icon-suggestion-heading">
      <BCheckbox
        v-if="review.canReview(suggestion)"
        :model-value="review.selected.has(suggestion.id)"
        :controlled="true"
        :disabled="busy || !choice"
        @update:model-value="toggle"
        >{{ t('organizeIcons.selectNamed', { name: title }) }}</BCheckbox
      >
      <BChip tone="neutral">{{
        t(
          suggestion.status === 'no_suggestion'
            ? 'organizeIcons.noSuggestion'
            : suggestion.status === 'failed'
              ? 'organizeIcons.searchFailed'
              : `organizeWorkspace.status.${suggestion.status}`,
        )
      }}</BChip>
    </div>
    <div class="icon-comparison">
      <span class="icon-before"
        ><SvgIcon :src="icon.resource.tag" size="28" /><small>{{ t('organizeIcons.current') }}</small></span
      >
      <span aria-hidden="true">→</span>
      <span v-if="choice" class="icon-after"
        ><SvgIcon :src="choice.iconUrl" :color="previewColor" size="30" /><small>{{
          t(suggestion.status === 'applied' ? 'organizeIcons.applied' : 'organizeIcons.proposed')
        }}</small></span
      >
      <span v-else>{{ t(suggestion.status === 'failed' ? 'organizeIcons.failed' : 'organizeIcons.noMatch') }}</span>
    </div>
    <div v-if="review.canReview(suggestion)" class="icon-alternatives">
      <BButton
        v-for="candidate in suggestion.candidates || []"
        :key="candidate.iconName"
        :disabled="busy"
        :aria-label="candidate.iconName"
        :aria-pressed="choice?.iconName === candidate.iconName"
        :class="{ chosen: choice?.iconName === candidate.iconName }"
        @click="review.drafts.set(suggestion.id, candidate)"
      >
        <SvgIcon :src="candidate.iconUrl" size="24" />
      </BButton>
    </div>
    <p>{{ t('organizeIcons.sharedImpact') }}</p>
    <div v-if="review.canReview(suggestion)" class="icon-actions">
      <TagIconPicker
        :key="suggestion.id"
        v-model:value="pickerValue"
        :tag-name="title"
        :initial-icon-name="choice?.iconName"
        :disabled="busy"
        free-search
        library-only
        @choice="review.drafts.set(suggestion.id, $event)"
      />
      <BButton
        type="primary"
        :loading="review.busy.has(suggestion.id)"
        :disabled="busy || !choice"
        @click="review.act(suggestion, 'apply')"
        >{{ t('organizeWorkspace.apply') }}</BButton
      >
    </div>
    <p v-if="review.errors.has(suggestion.id)" class="icon-error" role="alert">{{
      review.errors.get(suggestion.id) || t('organize.actionFailed')
    }}</p>
  </section>
</template>
<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import TagIconPicker from '@/components/manage/tagEditMg/TagIconPicker.vue';
  import icon from '@/config/icon';
  import type { WorkspaceSuggestion } from '@/api/organizeSuggestionApi';
  import type { OrganizeIconReview } from '@/composables/useOrganizeIconReview';
  const props = defineProps<{ suggestion: WorkspaceSuggestion; title: string; review: OrganizeIconReview }>();
  const { t } = useI18n();
  const choice = computed(() => props.review.choice(props.suggestion));
  const busy = computed(() => props.review.busy.has(props.suggestion.id) || props.review.batchBusy.value);
  const previewColor = computed(() =>
    choice.value?.color === 'currentColor' ? 'var(--text-color)' : choice.value?.color,
  );
  // 选择器的图标值和结构化选择同时更新；真正的草稿以 choice 事件为准。
  const pickerValue = computed({ get: () => choice.value?.iconUrl || '', set: () => {} });
  function toggle(checked: boolean) {
    if (checked) props.review.selected.add(props.suggestion.id);
    else props.review.selected.delete(props.suggestion.id);
  }
</script>
<style scoped lang="less">
  .icon-suggestion {
    padding: 18px;
    display: grid;
    gap: 14px;
    min-width: 0;
  }
  .icon-suggestion-heading,
  .icon-actions,
  .icon-alternatives,
  .icon-comparison {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .icon-suggestion-heading {
    justify-content: space-between;
  }
  .icon-before,
  .icon-after {
    display: grid;
    justify-items: center;
    gap: 8px;
    padding: 12px;
    min-width: 72px;
    border: 1px solid var(--border-color);
    border-radius: 10px;
  }
  .icon-before {
    color: var(--text-secondary-color);
  }
  .icon-after {
    border-color: var(--primary-color);
  }
  .icon-alternatives :deep(.b_btn) {
    min-width: 44px;
    min-height: 44px;
  }
  .icon-alternatives .chosen {
    border: 1px solid var(--primary-color);
    color: var(--primary-color);
  }
  p,
  small {
    margin: 0;
    font-size: 12px;
    color: var(--text-secondary-color);
  }
  .icon-error {
    color: var(--danger-color, #d03050);
  }
  .icon-actions :deep(.picker-controls) {
    flex-wrap: wrap;
  }
  .icon-actions :deep(.icon-preview) {
    display: none;
  }
</style>
