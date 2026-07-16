<template>
  <ResourcePageShell
    :title="pageTitle"
    :subtitle="$t('tagManage.editorDescription')"
    accent="tag"
    show-back
    @back="requestCancel"
  >
    <BLoading :loading="loading">
      <TagEditorForm
        v-model:tag="tag"
        v-model:active-resource-type="activeResourceType"
        :tag-options="tagOptions"
        :search-map="searchMap"
        :resource-sections="resourceSections"
        :active-resource-section="activeResourceSection"
        :total-selected-count="totalSelectedCount"
        :saving="saving"
        @toggle-resource="toggleResource"
        @submit="submit"
        @cancel="requestCancel"
      />
    </BLoading>
  </ResourcePageShell>
</template>

<script setup lang="ts">
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import ResourcePageShell from '@/components/base/ResourcePageShell.vue';
  import TagEditorForm from './TagEditorForm.vue';
  import { useTagEditor } from '@/composables/useTagEditor.ts';

  const {
    tag,
    loading,
    saving,
    tagOptions,
    activeResourceType,
    searchMap,
    pageTitle,
    totalSelectedCount,
    resourceSections,
    activeResourceSection,
    toggleResource,
    submit,
    requestCancel,
  } = useTagEditor();
</script>
