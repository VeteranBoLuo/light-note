<template>
  <div class="comparison-setup">
    <label for="comparison-question">{{ t('comparisonTable.question') }}</label>
    <BInput
      id="comparison-question"
      v-model:value="question"
      type="textarea"
      :rows="3"
      :maxlength="TOOLBOX_PROCESSING_REQUIREMENT_MAX_CHARS"
      :disabled="disabled"
      :placeholder="t('comparisonTable.placeholder')"
    />
    <BButton type="text" size="small" :disabled="disabled" @click="question = t('comparisonTable.example')">{{
      t('comparisonTable.exampleLabel')
    }}</BButton>
    <section v-if="columns.length" class="comparison-columns">
      <header
        ><strong>{{ t('comparisonTable.columns') }}</strong
        ><BButton type="text" size="small" :disabled="disabled" @click="suggest">{{
          t('comparisonTable.suggest')
        }}</BButton></header
      >
      <p>{{ t('comparisonTable.columnsHint') }}</p>
      <div class="comparison-columns__list">
        <div v-for="(column, index) in columns" :key="index" class="comparison-column">
          <label class="comparison-sr-label" :for="`comparison-column-${index}`">{{
            t('comparisonTable.columnName', { index: index + 1 })
          }}</label>
          <BInput
            :id="`comparison-column-${index}`"
            :value="column.label"
            :maxlength="40"
            :disabled="disabled"
            @update:value="update(index, 'label', String($event))"
          />
          <BButton
            :disabled="disabled"
            :aria-label="t('comparisonTable.remove', { name: column.label })"
            @click="columns = columns.filter((_, i) => i !== index)"
            ><SvgIcon :src="icon.toolbox.delete" size="16"
          /></BButton>
        </div>
      </div>
      <BButton
        size="small"
        :disabled="disabled || columns.length >= COMPARISON_MAX_COLUMNS"
        @click="columns = [...columns, { label: '', type: 'auto', rule: '' }]"
        >{{ t('comparisonTable.add') }}</BButton
      >
      <div class="comparison-advanced">
        <BButton type="text" :aria-expanded="advanced" @click="advanced = !advanced">{{
          t('comparisonTable.advanced')
        }}</BButton>
        <div v-if="advanced" class="comparison-rules">
          <div v-for="(column, index) in columns" :key="index">
            <label :id="`comparison-rule-${index}`">{{
              column.label || t('comparisonTable.columnName', { index: index + 1 })
            }}</label>
            <BSelect
              :value="column.type"
              :options="types"
              :disabled="disabled"
              :aria-labelledby="`comparison-rule-${index}`"
              @update:value="update(index, 'type', String($event))"
            />
            <BInput
              :value="column.rule"
              :disabled="disabled"
              :maxlength="200"
              :placeholder="t('comparisonTable.rule')"
              :aria-label="`${column.label} · ${t('comparisonTable.rule')}`"
              @update:value="update(index, 'rule', String($event))"
            />
          </div>
        </div>
      </div>
      <p>{{ t('comparisonTable.suggestHint') }}</p>
    </section>
  </div>
</template>
<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { TOOLBOX_PROCESSING_REQUIREMENT_MAX_CHARS } from '@lightnote/shared/toolbox-protocol';
  import { COMPARISON_MAX_COLUMNS, type ComparisonColumn } from '@lightnote/shared/comparison-table';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { suggestComparisonColumns } from '@/utils/comparisonTable';
  defineProps<{ disabled?: boolean }>();
  const question = defineModel<string>('question', { required: true });
  const columns = defineModel<ComparisonColumn[]>('columns', { required: true });
  const { t } = useI18n();
  const advanced = ref(false);
  const types = computed(() =>
    ['auto', 'text', 'number', 'date'].map((value) => ({ value, label: t(`comparisonTable.${value}`) })),
  );
  function suggest() {
    columns.value = suggestComparisonColumns(question.value, t('comparisonTable.defaultColumns'));
  }
  function update(index: number, key: keyof ComparisonColumn, value: string) {
    columns.value = columns.value.map((column, i) => (i === index ? { ...column, [key]: value } : column));
  }
  defineExpose({ suggest });
</script>
<style scoped lang="less">
  @import (reference) '@/assets/css/ui-density.less';
  .comparison-setup {
    display: grid;
    gap: .ui-space(12px) [];
    min-width: 0;
  }
  .comparison-columns {
    display: grid;
    gap: .ui-space(12px) [];
  }
  .comparison-columns header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: .ui-space(8px) [];
    flex-wrap: wrap;
  }
  .comparison-columns p {
    margin: 0;
    color: var(--desc-color);
    font-size: .ui-font(13px) [];
  }
  .comparison-columns__list {
    display: grid;
    gap: .ui-space(8px) [];
  }
  .comparison-column {
    display: flex;
    gap: .ui-space(8px) [];
    min-width: 0;
  }
  .comparison-column :deep(.input-container) {
    min-width: 0;
    flex: 1;
  }
  .comparison-advanced {
    border-top: 1px solid var(--surface-border-color);
    padding-top: .ui-space(12px) [];
  }
  .comparison-rules,
  .comparison-rules > div {
    display: grid;
    gap: .ui-space(8px) [];
  }
  .comparison-rules {
    gap: .ui-space(16px) [];
  }
</style>

<style scoped>
  .comparison-sr-label {
    position: absolute;
    /* ui-density-fixed: screen-reader-only label must remain visually clipped at every density */
    width: 1px;
    /* ui-density-fixed: screen-reader-only label must remain visually clipped at every density */
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
