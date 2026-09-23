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
    gap: var(--ui-space-6, 6px);
    min-height: var(--ui-layout-44, 44px);
    padding: var(--ui-space-6, 6px) var(--ui-space-10, 10px);
    border-bottom: 1px solid var(--surface-border-color, #e1e5f0);
    background: var(--surface-panel-bg, var(--note-editor-header-bg, var(--background-color)));
    box-sizing: border-box;

    &__input {
      flex: 0 1 var(--ui-layout-210, 210px);
      width: var(--ui-layout-210, 210px);
      min-width: var(--ui-layout-140, 140px);

      &--replace {
        flex-basis: var(--ui-layout-180, 180px);
        width: var(--ui-layout-180, 180px);
      }

      :deep(.b-input) {
        height: var(--ui-control-30, 30px);
        border: 1px solid var(--surface-border-color, #d8dce8);
        background: var(--card-background, #fff);
        color: var(--text-color);
        font-size: var(--ui-font-13, 13px);

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
      gap: var(--ui-space-4, 4px);
    }

    &__options {
      gap: var(--ui-space-2, 2px);

      :deep(.b-checkbox) {
        padding: var(--ui-space-2, 2px) var(--ui-space-3, 3px);
      }

      :deep(.b-checkbox__label) {
        font-size: var(--ui-font-12, 12px);
        white-space: nowrap;
      }
    }

    :deep(.b_btn) {
      min-width: 0;
      height: var(--ui-control-28, 28px);
      padding: 0 var(--ui-space-9, 9px);
      border: 1px solid var(--surface-border-color, #d8dce8) !important;
      background: var(--card-background, #fff);
      font-size: var(--ui-font-12, 12px);
      /* ui-density-fixed: 减去上下各 1px 的固定边框，行高仍随控件高度变化。 */
      line-height: calc(var(--ui-control-28, 28px) - 2px);

      &:hover:not(.disabled) {
        border-color: var(--primary-color, #615ced) !important;
        color: var(--primary-color, #615ced);
      }
    }

    &__status {
      flex: 0 0 auto;
      color: var(--desc-color);
      font-size: var(--ui-font-12, 12px);
      white-space: nowrap;

      &.is-empty {
        color: var(--error-color, #e5484d);
        font-weight: 600;
      }
    }

    &__close {
      width: var(--ui-control-28, 28px);
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
      padding-right: var(--ui-space-8, 8px);

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
