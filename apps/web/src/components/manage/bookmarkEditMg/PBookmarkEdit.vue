<template>
  <ResourcePageShell
    :title="pageTitle"
    :subtitle="$t('bookmarkEditor.subtitle')"
    accent="bookmark"
    show-back
    @back="requestCancel"
  >
    <template v-if="isEdit" #actions>
      <BButton size="small" @click="snapVisible = true">
        <SvgIcon :src="icon.bookmarkManage.snapshot" size="16" />
        {{ $t('bookmarkMg.snapshot') }}
      </BButton>
      <BButton size="small" :loading="refreshingIcon" @click="handleRefreshIcon">
        {{ $t('bookmarkMg.refreshIcon') }}
      </BButton>
    </template>
    <BLoading :loading="loading" style="height: unset">
      <BookmarkEditorForm
        v-model:bookmark-data="bookmarkData"
        v-model:save-snapshot="saveSnapshot"
        mobile
        :handle-type="handleType"
        :save-label="saveLabel"
        :saving="saving"
        :generating="generating"
        :errors="fieldErrors"
        :tag-options="tagOptions"
        @generate="generateBookmarkMeta"
        @submit="submit"
        @cancel="requestCancel"
        @add-tag="goAddTag"
      />
    </BLoading>
    <BookmarkSnapshotModal v-model:visible="snapVisible" :bookmark-id="bookmarkId" />
  </ResourcePageShell>
</template>

<script lang="ts" setup>
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import ResourcePageShell from '@/components/base/ResourcePageShell.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
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
