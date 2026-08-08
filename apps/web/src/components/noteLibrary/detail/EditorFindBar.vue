<template>
  <section
    class="editor-find-bar"
    role="search"
    :aria-label="t('noteDetail.editor.findReplace')"
    @keydown="handleKeydown"
  >
    <BInput
      ref="queryInputRef"
      v-model:value="query"
      class="editor-find-bar__input editor-find-bar__input--query"
      :placeholder="t('noteDetail.editor.findPlaceholder')"
      clearable
      @enter="emit('next')"
    />
    <div class="editor-find-bar__navigation">
      <BButton
        size="small"
        :disabled="!query"
        :aria-label="t('noteDetail.editor.findPrevious')"
        @click="emit('previous')"
      >
        {{ t('noteDetail.editor.findPrevious') }}
      </BButton>
      <BButton size="small" :disabled="!query" :aria-label="t('noteDetail.editor.findNext')" @click="emit('next')">
        {{ t('noteDetail.editor.findNext') }}
      </BButton>
    </div>
    <BInput
      v-model:value="replacement"
      class="editor-find-bar__input editor-find-bar__input--replace"
      :placeholder="t('noteDetail.editor.replacePlaceholder')"
      @enter="emit('replace')"
    />
    <div class="editor-find-bar__replace-actions">
      <BButton size="small" :disabled="matchCount <= 0" @click="emit('replace')">
        {{ t('noteDetail.editor.replaceOne') }}
      </BButton>
      <BButton size="small" :disabled="matchCount <= 0" @click="emit('replace-all')">
        {{ t('noteDetail.editor.replaceAll') }}
      </BButton>
    </div>
    <div class="editor-find-bar__options">
      <BCheckbox v-model="matchCase">{{ t('noteDetail.editor.matchCase') }}</BCheckbox>
      <BCheckbox v-model="wholeWord">{{ t('noteDetail.editor.wholeWord') }}</BCheckbox>
    </div>
    <span v-if="statusText" class="editor-find-bar__status" :class="{ 'is-empty': matchCount <= 0 }" aria-live="polite">
      {{ statusText }}
    </span>
    <BButton
      class="editor-find-bar__close"
      size="small"
      :aria-label="t('common.close')"
      :title="t('common.close')"
      @click="emit('close')"
    >
      <SvgIcon :src="icon.common.close" size="14" aria-hidden="true" />
    </BButton>
  </section>
</template>

<script lang="ts">
  export interface EditorFindBarExpose {
    focusAndSelect: () => void;
  }
</script>

<script setup lang="ts">
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { ref } from 'vue';
  import { useI18n } from 'vue-i18n';

  type InputExpose = { focus: () => void; inputEl?: HTMLInputElement | HTMLTextAreaElement | null };

  defineProps<{
    matchCount: number;
    statusText: string;
  }>();

  const emit = defineEmits<{
    next: [];
    previous: [];
    replace: [];
    'replace-all': [];
    close: [];
  }>();

  const query = defineModel<string>('query', { required: true });
  const replacement = defineModel<string>('replacement', { required: true });
  const matchCase = defineModel<boolean>('matchCase', { required: true });
  const wholeWord = defineModel<boolean>('wholeWord', { required: true });
  const queryInputRef = ref<InputExpose | null>(null);
  const { t } = useI18n();

  function focusAndSelect() {
    queryInputRef.value?.focus();
    queryInputRef.value?.inputEl?.select?.();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      emit('close');
      return;
    }
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      event.stopImmediatePropagation();
      focusAndSelect();
    }
  }

  defineExpose<EditorFindBarExpose>({ focusAndSelect });
</script>

<style scoped lang="less">
  .editor-find-bar {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    min-height: 44px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--surface-border-color, #e1e5f0);
    background: var(--surface-panel-bg, var(--note-editor-header-bg, var(--background-color)));
    box-sizing: border-box;

    &__input {
      flex: 0 1 210px;
      width: 210px;
      min-width: 140px;

      &--replace {
        flex-basis: 180px;
        width: 180px;
      }

      :deep(.b-input) {
        height: 30px;
        border: 1px solid var(--surface-border-color, #d8dce8);
        background: var(--card-background, #fff);
        color: var(--text-color);
        font-size: 13px;

        &:focus {
          border-color: var(--primary-color, #615ced);
          outline: 2px solid var(--primary-color, #615ced);
          outline-offset: -1px;
        }
      }
    }

    &__navigation,
    &__replace-actions,
    &__options {
      display: inline-flex;
      flex: 0 0 auto;
      align-items: center;
      gap: 4px;
    }

    &__options {
      gap: 2px;

      :deep(.b-checkbox) {
        padding: 2px 3px;
      }

      :deep(.b-checkbox__label) {
        font-size: 12px;
        white-space: nowrap;
      }
    }

    :deep(.b_btn) {
      min-width: 0;
      height: 28px;
      padding: 0 9px;
      border: 1px solid var(--surface-border-color, #d8dce8) !important;
      background: var(--card-background, #fff);
      font-size: 12px;
      line-height: 26px;

      &:hover:not(.disabled) {
        border-color: var(--primary-color, #615ced) !important;
        color: var(--primary-color, #615ced);
      }
    }

    &__status {
      flex: 0 0 auto;
      color: var(--desc-color);
      font-size: 12px;
      white-space: nowrap;

      &.is-empty {
        color: var(--error-color, #e5484d);
        font-weight: 600;
      }
    }

    &__close {
      width: 28px;
      padding: 0;
      color: var(--desc-color);
    }
  }

  @media (max-width: 1100px) {
    .editor-find-bar {
      flex-wrap: wrap;

      &__input {
        flex: 1 1 180px;
        width: auto;
      }

      &__options {
        margin-left: auto;
      }
    }
  }

  @media (max-width: 767px) {
    .editor-find-bar {
      justify-content: flex-start;
      padding-right: 8px;

      &__input {
        flex-basis: calc(100% - 108px);
      }

      &__input--replace {
        flex-basis: calc(100% - 132px);
      }

      &__options {
        order: 5;
        margin-left: 0;
      }

      &__status {
        order: 6;
      }

      &__close {
        margin-left: auto;
      }
    }
  }
</style>
