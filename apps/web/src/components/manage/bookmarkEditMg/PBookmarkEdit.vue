<template>
  <CommonContainer :title="pageTitle" @back-click="requestCancel">
    <BLoading :loading="loading" style="height: unset">
      <BookmarkEditorForm
        v-model:bookmark-data="bookmarkData"
        v-model:save-snapshot="saveSnapshot"
        mobile
        :handle-type="handleType"
        :is-edit="isEdit"
        :page-title="pageTitle"
        :save-label="saveLabel"
        :saving="saving"
        :generating="generating"
        :refreshing-icon="refreshingIcon"
        :errors="fieldErrors"
        :tag-options="tagOptions"
        @generate="generateBookmarkMeta"
        @submit="submit"
        @cancel="requestCancel"
        @add-tag="goAddTag"
        @open-snapshot="snapVisible = true"
        @refresh-icon="handleRefreshIcon"
      />
    </BLoading>
    <BookmarkSnapshotModal v-model:visible="snapVisible" :bookmark-id="bookmarkId" />
  </CommonContainer>
</template>

<script lang="ts" setup>
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
  import BookmarkEditorForm from '@/components/manage/bookmarkEditMg/BookmarkEditorForm.vue';
  import BookmarkSnapshotModal from '@/components/manage/bookmarkEditMg/BookmarkSnapshotModal.vue';
  import { useBookmarkEditor } from '@/composables/useBookmarkEditor';

  const {
    bookmarkData,
    tagOptions,
    saveSnapshot,
    snapVisible,
    loading,
    generating,
    refreshingIcon,
    fieldErrors,
    handleType,
    isEdit,
    bookmarkId,
    pageTitle,
    saveLabel,
    saving,
    generateBookmarkMeta,
    submit,
    requestCancel,
    goAddTag,
    handleRefreshIcon,
  } = useBookmarkEditor();
</script>
