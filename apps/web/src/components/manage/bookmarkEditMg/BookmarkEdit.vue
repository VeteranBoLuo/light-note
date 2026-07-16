<template>
  <ResourcePageShell
    class="bookmark-edit-shell"
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
    <div class="bookmark-edit-page">
      <div class="bookmark-edit-page__scroll">
        <BLoading :loading="loading">
          <BookmarkEditorForm
            v-model:bookmark-data="bookmarkData"
            v-model:save-snapshot="saveSnapshot"
            :handle-type="handleType"
            :save-label="saveLabel"
            :saving="saving"
            :generating="generating"
            :errors="fieldErrors"
            :tag-options="tagOptions"
            :show-actions="false"
            @generate="generateBookmarkMeta"
            @submit="submit"
            @cancel="requestCancel"
            @add-tag="goAddTag"
          />
        </BLoading>
      </div>
      <footer class="bookmark-edit-page__footer">
        <div class="bookmark-edit-page__footer-inner">
          <BButton class="bookmark-edit-page__cancel" @click="requestCancel">
            {{ $t('common.cancel') }}
          </BButton>
          <BButton
            class="bookmark-edit-page__save"
            type="primary"
            :loading="saving"
            @click="submit"
          >
            {{ saveLabel }}
          </BButton>
        </div>
      </footer>
    </div>
    <BookmarkSnapshotModal v-model:visible="snapVisible" :bookmark-id="bookmarkId" />
  </ResourcePageShell>
</template>

<script lang="ts" setup>
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BookmarkEditorForm from '@/components/manage/bookmarkEditMg/BookmarkEditorForm.vue';
  import BookmarkSnapshotModal from '@/components/manage/bookmarkEditMg/BookmarkSnapshotModal.vue';
  import { useBookmarkEditor } from '@/composables/useBookmarkEditor';
  import ResourcePageShell from '@/components/base/ResourcePageShell.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';

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

<style lang="less" scoped>
  :global(.resource-page-shell.bookmark-edit-shell) {
    padding-bottom: 10px;
  }

  .bookmark-edit-page {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    overflow: hidden;
  }

  .bookmark-edit-page__scroll {
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .bookmark-edit-page__footer {
    padding-top: 6px;
    border-top: 1px solid color-mix(in srgb, var(--surface-border-color) 65%, transparent);
    background: var(--surface-page-bg, var(--background-color));
  }

  .bookmark-edit-page__footer-inner {
    width: min(800px, calc(100% - 48px));
    margin: 0 auto;
    display: flex;
    justify-content: center;
    gap: 8px;
  }

  .bookmark-edit-page__cancel,
  .bookmark-edit-page__save {
    min-width: 92px;
    height: 34px;
    border-radius: 8px;
  }
</style>
