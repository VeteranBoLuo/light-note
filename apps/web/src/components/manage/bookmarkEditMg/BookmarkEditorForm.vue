<template>
  <div class="bookmark-editor" :class="{ 'bookmark-editor--mobile': mobile }">
    <section class="bookmark-editor__form">
      <div class="bookmark-field bookmark-field--url" :class="{ 'is-error': errors.url }">
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
            theme="al-day"
            height="40px"
            :placeholder="$t('bookmarkEditor.urlPlaceholder')"
            clearable
            @enter="$emit('generate')"
          />
          <BTooltip
            :title="
              resolvingUrl
                ? $t('bookmarkEditor.checkingUrl')
                : generating
                  ? $t('bookmarkEditor.stopGenerating')
                  : $t('bookmarkMg.generateMetaDesc')
            "
          >
            <BButton
              class="bookmark-generate-button"
              :class="{ 'bookmark-generate-button--stop': generating }"
              :loading="resolvingUrl"
              :disabled="resolvingUrl"
              @click="handleGenerateClick"
              v-click-log="{
                module: '书签详情',
                operation: generating ? '停止智能生成' : '点击智能生成',
              }"
            >
              <SvgIcon
                v-if="!resolvingUrl"
                :src="generating ? icon.common.stop : icon.common.magicWand"
                color="currentColor"
              />
              <span>
                {{
                  resolvingUrl
                    ? $t('bookmarkEditor.checkingUrl')
                    : generating
                      ? $t('bookmarkEditor.stopGenerating')
                      : $t('bookmarkEditor.smartRecognize')
                }}
              </span>
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
          theme="al-day"
          height="40px"
          :placeholder="$t('bookmarkEditor.namePlaceholder')"
          clearable
        />
        <span v-if="errors.name" class="bookmark-field__error">{{ errors.name }}</span>
      </div>

      <div class="bookmark-field">
        <div class="bookmark-field__heading">
          <label>{{ $t('bookmarkMg.relatedTag') }}</label>
          <span class="bookmark-field__hint">{{ $t('bookmarkEditor.optional') }}</span>
        </div>
        <BSelect
          v-model:value="bookmarkData.relatedTags"
          class="bookmark-tag-select"
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
              <SvgIcon :src="icon.common.add" size="16" />
              <span>{{ $t('navigation.newTag') }}</span>
            </BButton>
          </template>
        </BSelect>
      </div>

      <div class="bookmark-field bookmark-description-field">
        <div class="bookmark-field__heading">
          <label for="bookmark-editor-description">{{ $t('bookmarkMg.description') }}</label>
          <span class="bookmark-field__hint">{{ $t('bookmarkEditor.optional') }}</span>
        </div>
        <BInput
          id="bookmark-editor-description"
          v-model:value="bookmarkData.description"
          type="textarea"
          :rows="3"
          :maxlength="1000"
          :placeholder="$t('bookmarkEditor.descriptionPlaceholder')"
        />
      </div>

      <div v-if="handleType === 'add'" class="bookmark-snapshot-setting">
        <div class="bookmark-snapshot-setting__icon">
          <SvgIcon :src="icon.bookmarkManage.snapshot" size="20" />
        </div>
        <div class="bookmark-snapshot-setting__content">
          <strong>{{ $t('bookmarkMg.saveSnapshotOpt') }}</strong>
          <span>{{ $t('bookmarkMg.saveSnapshotOptDesc') }}</span>
        </div>
        <BSwitch v-model:checked="saveSnapshot" />
      </div>

      <footer v-if="showActions" class="bookmark-editor__footer">
        <BButton class="bookmark-editor__cancel-button" @click="$emit('cancel')">
          {{ $t('common.cancel') }}
        </BButton>
        <BButton
          class="bookmark-editor__save-button"
          type="primary"
          :loading="saving"
          @click="$emit('submit')"
        >
          {{ saveLabel }}
        </BButton>
      </footer>
    </section>
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
  import type { BookmarkEditorData, BookmarkEditorErrors, BookmarkTagOption } from '@/composables/useBookmarkEditor';

  const props = withDefaults(
    defineProps<{
      mobile?: boolean;
      showActions?: boolean;
      handleType: 'add' | 'edit';
      saveLabel: string;
      saving: boolean;
      resolvingUrl: boolean;
      generating: boolean;
      errors: BookmarkEditorErrors;
      tagOptions: BookmarkTagOption[];
    }>(),
    { mobile: false, showActions: true },
  );

  const bookmarkData = defineModel<BookmarkEditorData>('bookmarkData', { required: true });
  const saveSnapshot = defineModel<boolean>('saveSnapshot', { default: true });

  const emit = defineEmits<{
    generate: [];
    stopGenerate: [];
    submit: [];
    cancel: [];
    addTag: [];
  }>();

  function handleGenerateClick() {
    if (props.resolvingUrl) return;
    emit(props.generating ? 'stopGenerate' : 'generate');
  }
</script>

<style lang="less" scoped>
  .bookmark-editor {
    width: min(800px, calc(100% - 48px));
    min-height: 100%;
    margin: 0 auto;
    padding: 18px 0 12px;
    box-sizing: border-box;
    color: var(--text-color);
  }

  .bookmark-editor__form {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .bookmark-field {
    display: flex;
    flex-direction: column;
    gap: 8px;

    > label,
    .bookmark-field__heading label {
      font-size: 13px;
      font-weight: 650;
    }
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
    line-height: 1.55;
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
    height: 40px;
    min-width: 188px;
    gap: 7px;
    border: 1px solid color-mix(in srgb, var(--resource-bookmark-color) 20%, var(--surface-border-color));
    border-radius: 9px;
    color: var(--resource-bookmark-color);
    background: color-mix(in srgb, var(--resource-bookmark-color) 10%, var(--card-background)) !important;

    &:hover {
      border-color: color-mix(in srgb, var(--resource-bookmark-color) 38%, var(--surface-border-color));
      background: color-mix(in srgb, var(--resource-bookmark-color) 14%, var(--card-background)) !important;
    }
  }

  .bookmark-generate-button--stop {
    border-color: color-mix(in srgb, var(--message-error-color) 32%, var(--surface-border-color));
    color: var(--message-error-color);
    background: color-mix(in srgb, var(--message-error-color) 8%, var(--card-background)) !important;

    &:hover {
      border-color: color-mix(in srgb, var(--message-error-color) 48%, var(--surface-border-color));
      background: color-mix(in srgb, var(--message-error-color) 12%, var(--card-background)) !important;
    }
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
    min-height: 88px;
    resize: vertical;
    padding: 10px 12px !important;
    border-color: var(--surface-border-color);
    border-radius: 8px;
    background: var(--card-background) !important;
    font-family: inherit;
    line-height: 1.65;
  }

  :deep(.input-al-day) {
    border-color: var(--surface-border-color) !important;
    border-radius: 8px;
    background: var(--card-background) !important;

    &:hover,
    &:focus-visible {
      border-color: color-mix(in srgb, var(--resource-bookmark-color) 48%, var(--surface-border-color)) !important;
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--resource-bookmark-color) 8%, transparent) !important;
    }
  }

  :deep(.bookmark-tag-select .select-trigger) {
    min-height: 40px;
    border-color: var(--surface-border-color);
    border-radius: 8px;
    background: var(--card-background);
  }

  .bookmark-add-tag {
    width: 100%;
    height: 32px;
    justify-content: flex-start;
    gap: 7px;
    color: var(--primary-color);
    background: transparent;
  }

  .bookmark-snapshot-setting {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: start;
    gap: 12px;
    padding: 14px 16px;
    border: 1px solid color-mix(in srgb, var(--surface-border-color) 72%, transparent);
    border-radius: 10px;
    background: var(--workspace-panel-bg-color);
  }

  .bookmark-snapshot-setting__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 8px;
    color: var(--resource-bookmark-color);
    background: color-mix(in srgb, var(--resource-bookmark-color) 10%, var(--card-background));
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
    justify-content: flex-end;
    gap: 10px;
    padding-top: 2px;
  }

  .bookmark-editor__cancel-button,
  .bookmark-editor__save-button {
    min-width: 92px;
    height: 36px;
    border-radius: 9px;
  }

  .bookmark-editor--mobile {
    width: 100%;
    padding: 0 0 12px;

    .bookmark-editor__form {
      gap: 16px;
    }

    .bookmark-url-row {
      flex-direction: column;
      gap: 8px;
    }

    .bookmark-generate-button {
      width: 100%;
      min-width: 0;
      height: 42px;
      justify-content: center;
    }

    :deep(.b-input),
    :deep(.bookmark-tag-select .select-trigger) {
      min-height: 44px;
      height: 44px;
    }

    :deep(.b-textarea) {
      min-height: 88px;
    }

    .bookmark-snapshot-setting {
      margin-top: 0;
      padding: 14px 12px;
    }

    .bookmark-editor__footer {
      padding-top: 2px;
    }

    .bookmark-editor__cancel-button {
      width: 96px;
      min-width: 96px;
      height: 42px;
    }

    .bookmark-editor__save-button {
      width: auto;
      min-width: 0;
      height: 42px;
      flex: 1;
    }
  }

  @media (max-width: 900px) {
    .bookmark-editor {
      width: calc(100% - 24px);
    }
  }
</style>
