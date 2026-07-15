<template>
  <div class="bookmark-editor" :class="{ 'bookmark-editor--mobile': mobile }">
    <header v-if="!mobile" class="bookmark-editor__header">
      <div>
        <h1>{{ pageTitle }}</h1>
      </div>
      <div v-if="isEdit" class="bookmark-editor__header-actions">
        <BButton size="small" @click="$emit('openSnapshot')">📸 {{ $t('bookmarkMg.snapshot') }}</BButton>
        <BButton size="small" :loading="refreshingIcon" @click="$emit('refreshIcon')">
          {{ $t('bookmarkMg.refreshIcon') }}
        </BButton>
      </div>
    </header>

    <div v-if="mobile && isEdit" class="bookmark-editor__mobile-actions">
      <BButton size="small" @click="$emit('openSnapshot')">📸 {{ $t('bookmarkMg.snapshot') }}</BButton>
      <BButton size="small" :loading="refreshingIcon" @click="$emit('refreshIcon')">
        {{ $t('bookmarkMg.refreshIcon') }}
      </BButton>
    </div>

    <section class="bookmark-editor__card">
      <div class="bookmark-field bookmark-field--url" data-guide="bookmark-url" :class="{ 'is-error': errors.url }">
        <div class="bookmark-field__heading">
          <label for="bookmark-editor-url">
            {{ $t('bookmarkMg.bookmarkUrl') }} <span class="required-mark">*</span>
          </label>
        </div>
        <div class="bookmark-url-row">
          <BInput
            id="bookmark-editor-url"
            v-model:value="bookmarkData.url"
            class="bookmark-url-input"
            :placeholder="$t('bookmarkEditor.urlPlaceholder')"
            clearable
            @enter="$emit('generate')"
          />
          <BTooltip :title="$t('bookmarkMg.generateMetaDesc')">
            <BButton
              class="bookmark-generate-button"
              type="function"
              :loading="generating"
              @click="$emit('generate')"
              v-click-log="{ module: '书签详情', operation: '点击智能生成' }"
            >
              <SvgIcon :src="icon.common.magicWand" color="currentColor" />
              <span>{{ generating ? $t('bookmarkEditor.generating') : $t('bookmarkEditor.smartRecognize') }}</span>
            </BButton>
          </BTooltip>
        </div>
        <span v-if="errors.url" class="bookmark-field__error">{{ errors.url }}</span>
        <div class="bookmark-ai-note">{{ $t('bookmarkEditor.aiHint') }}</div>
      </div>

      <div class="bookmark-field" :class="{ 'is-error': errors.name }">
        <label for="bookmark-editor-name">
          {{ $t('bookmarkMg.bookmarkName') }} <span class="required-mark">*</span>
        </label>
        <BInput
          id="bookmark-editor-name"
          v-model:value="bookmarkData.name"
          :placeholder="$t('bookmarkEditor.namePlaceholder')"
          clearable
        />
        <span v-if="errors.name" class="bookmark-field__error">{{ errors.name }}</span>
      </div>

      <div class="bookmark-field" data-guide="bookmark-tags">
        <div class="bookmark-field__heading">
          <label>{{ $t('bookmarkMg.relatedTag') }}</label>
          <span class="bookmark-field__hint">{{ $t('bookmarkEditor.optional') }}</span>
        </div>
        <BSelect
          v-model:value="bookmarkData.relatedTags"
          mode="multiple"
          :max-tag-count="3"
          :options="tagOptions"
          :placeholder="$t('bookmarkEditor.tagPlaceholder')"
          :show-search="true"
          :filter-option="SelectionSearch"
        >
          <template #dropdown-footer>
            <BButton
              class="bookmark-add-tag"
              @click="$emit('addTag')"
              v-click-log="{ module: '书签详情', operation: '下拉里新增标签' }"
            >
              <span class="bookmark-add-tag__plus">+</span>
              <span>{{ $t('navigation.newTag') }}</span>
            </BButton>
          </template>
        </BSelect>
      </div>

      <div class="bookmark-field">
        <div class="bookmark-field__heading">
          <label for="bookmark-editor-description">{{ $t('bookmarkMg.description') }}</label>
          <span class="bookmark-field__hint">{{ $t('bookmarkEditor.optional') }}</span>
        </div>
        <BInput
          id="bookmark-editor-description"
          v-model:value="bookmarkData.description"
          type="textarea"
          :rows="2"
          :maxlength="1000"
          :placeholder="$t('bookmarkEditor.descriptionPlaceholder')"
        />
      </div>

      <div v-if="handleType === 'add'" class="bookmark-snapshot-setting">
        <div class="bookmark-snapshot-setting__icon">📄</div>
        <div class="bookmark-snapshot-setting__content">
          <strong>{{ $t('bookmarkMg.saveSnapshotOpt') }}</strong>
          <span>{{ $t('bookmarkMg.saveSnapshotOptDesc') }}</span>
        </div>
        <BSwitch v-model:checked="saveSnapshot" />
      </div>
    </section>

    <footer class="bookmark-editor__footer">
      <BButton @click="$emit('cancel')">{{ $t('common.cancel') }}</BButton>
      <BButton type="primary" data-guide="bookmark-save" :loading="saving" @click="$emit('submit')">
        {{ saveLabel }}
      </BButton>
    </footer>
  </div>
</template>

<script lang="ts" setup>
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BSwitch from '@/components/base/BasicComponents/BSwitch.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { SelectionSearch } from '@/components/base/BasicComponents/BForm/FormRenders.vue';
  import icon from '@/config/icon';
  import type {
    BookmarkEditorData,
    BookmarkEditorErrors,
    BookmarkTagOption,
  } from '@/composables/useBookmarkEditor';

  withDefaults(
    defineProps<{
      mobile?: boolean;
      handleType: 'add' | 'edit';
      isEdit: boolean;
      pageTitle: string;
      saveLabel: string;
      saving: boolean;
      generating: boolean;
      refreshingIcon: boolean;
      errors: BookmarkEditorErrors;
      tagOptions: BookmarkTagOption[];
    }>(),
    { mobile: false },
  );

  const bookmarkData = defineModel<BookmarkEditorData>('bookmarkData', { required: true });
  const saveSnapshot = defineModel<boolean>('saveSnapshot', { default: true });

  defineEmits<{
    generate: [];
    submit: [];
    cancel: [];
    addTag: [];
    openSnapshot: [];
    refreshIcon: [];
  }>();
</script>

<style lang="less" scoped>
  .bookmark-editor {
    width: min(780px, calc(100% - 48px));
    min-height: 100%;
    margin: 0 auto;
    padding: 12px 0 8px;
    box-sizing: border-box;
    color: var(--text-color);
  }

  .bookmark-editor__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 24px;
    margin-bottom: 8px;

    h1 {
      margin: 2px 0 0;
      font-size: 22px;
      line-height: 1.35;
    }
  }

  .bookmark-editor__header-actions,
  .bookmark-editor__mobile-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 0 0 auto;
  }

  .bookmark-editor__card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px 20px;
    border: 1px solid color-mix(in srgb, var(--resource-bookmark-color) 14%, var(--card-border-color));
    border-radius: 14px;
    background: var(--menu-body-bg-color);
    box-shadow: 0 10px 30px color-mix(in srgb, var(--resource-bookmark-color) 6%, transparent);
  }

  .bookmark-field {
    display: flex;
    flex-direction: column;
    gap: 6px;

    > label,
    .bookmark-field__heading label {
      font-size: 14px;
      font-weight: 650;
    }
  }

  .bookmark-field--url {
    padding: 12px 14px;
    border: 1px solid color-mix(in srgb, var(--resource-bookmark-color) 20%, var(--card-border-color));
    border-radius: 10px;
    background: color-mix(in srgb, var(--resource-bookmark-color) 4%, var(--menu-body-bg-color));
  }

  .bookmark-field__heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }

  .bookmark-field__hint,
  .bookmark-ai-note {
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.5;
  }

  .bookmark-url-row {
    display: flex;
    align-items: stretch;
    gap: 10px;
  }

  .bookmark-url-input {
    flex: 1 1 auto;
    min-width: 0;
  }

  .bookmark-generate-button {
    height: 32px;
    min-width: 150px;
    gap: 6px;
  }

  .required-mark,
  .bookmark-field__error {
    color: #fe2c55;
  }

  .bookmark-field__error {
    font-size: 12px;
  }

  .is-error :deep(.b-input),
  .is-error :deep(.b-textarea) {
    box-shadow: 0 0 0 1px color-mix(in srgb, #fe2c55 70%, transparent) !important;
  }

  :deep(.b-textarea) {
    min-height: 60px;
    resize: vertical;
    border-color: color-mix(in srgb, var(--card-border-color) 75%, transparent);
    background: var(--bl-input-noBorder-bg-color) !important;
    font-family: inherit;
    line-height: 1.65;
  }

  .bookmark-add-tag {
    width: 100%;
    height: 32px;
    justify-content: flex-start;
    color: var(--primary-color);
    background: transparent;
  }

  .bookmark-add-tag__plus {
    font-size: 17px;
    font-weight: 700;
  }

  .bookmark-snapshot-setting {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--bl-input-noBorder-bg-color);
  }

  .bookmark-snapshot-setting__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 9px;
    background: color-mix(in srgb, var(--resource-bookmark-color) 10%, var(--menu-body-bg-color));
  }

  .bookmark-snapshot-setting__content {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;

    strong {
      font-size: 14px;
    }

    span {
      color: var(--desc-color);
      font-size: 12px;
      line-height: 1.55;
    }
  }

  .bookmark-editor__footer {
    display: flex;
    justify-content: center;
    gap: 10px;
    margin-top: 6px;
    padding: 8px 0 2px;
  }

  .bookmark-editor--mobile {
    width: 100%;
    padding: 0 0 10px;

    .bookmark-editor__mobile-actions {
      justify-content: flex-end;
      margin-bottom: 12px;
    }

    .bookmark-editor__card {
      gap: 12px;
      padding: 14px 12px;
      border-radius: 12px;
      box-shadow: none;
    }

    .bookmark-field--url {
      padding: 12px;
    }

    .bookmark-url-row {
      flex-direction: column;
    }

    .bookmark-generate-button {
      width: 100%;
      justify-content: center;
    }

    .bookmark-snapshot-setting {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .bookmark-snapshot-setting__icon {
      display: none;
    }

    .bookmark-editor__footer {
      padding-bottom: 4px;
    }
  }

  @media (max-width: 900px) {
    .bookmark-editor {
      width: calc(100% - 32px);
    }

    .bookmark-editor__header {
      flex-direction: column;
    }

    .bookmark-editor__card {
      padding: 16px;
    }
  }
</style>
