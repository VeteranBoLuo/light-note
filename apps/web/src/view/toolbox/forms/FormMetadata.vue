<template>
  <div class="collection-metadata collection-stack">
    <section v-if="showBasic" class="collection-card collection-stack">
      <h3>{{ t('collectionForms.basicInfo') }}</h3>
      <label>{{ t('collectionForms.formTitle') }}<BInput v-model:value="model.title" :maxlength="200" /></label>
      <label
        >{{ t('collectionForms.description')
        }}<BInput v-model:value="model.description" type="textarea" :maxlength="5000"
      /></label>
    </section>
    <section class="collection-card collection-stack">
      <h3>{{ t('collectionForms.settings') }}</h3>
      <label
        >{{ t('collectionForms.tags')
        }}<BSelect
          v-model:value="tagIds"
          mode="multiple"
          :options="tags.map((t) => ({ value: t.id, label: t.name }))"
          :aria-label="t('collectionForms.tags')"
      /></label>
      <label
        >{{ t('collectionForms.successMessage')
        }}<BInput v-model:value="model.successMessage" type="textarea" :maxlength="1000"
      /></label>
    </section>
  </div>
</template>
<script setup lang="ts">
  import './forms.css';
  import { useI18n } from 'vue-i18n';
  import type { FormDefinition } from '@lightnote/shared/collection-forms';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  const { t } = useI18n();
  const model = defineModel<FormDefinition>({ required: true });
  const tagIds = defineModel<string[]>('tagIds', { required: true });
  withDefaults(defineProps<{ tags: { id: string; name: string }[]; showBasic?: boolean }>(), { showBasic: true });
</script>

<style scoped>
  .collection-metadata label {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-8, 8px);
    font-size: var(--ui-font-14, 14px);
  }
  .collection-metadata h3 {
    margin: 0;
    font-size: var(--ui-font-16, 16px);
  }
  .collection-metadata .input-container,
  .collection-metadata .b-select {
    width: 100%;
    min-width: 0;
  }
  @media (max-width: 1100px) and (min-width: 769px) {
    .collection-metadata {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
