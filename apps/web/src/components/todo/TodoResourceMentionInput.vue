<template>
  <div ref="fieldRef" class="todo-resource-mention-input">
    <BInput
      ref="inputRef"
      v-model:value="value"
      type="textarea"
      :rows="rows"
      :maxlength="maxlength"
      :placeholder="placeholder"
      @input="queueMentionSync()"
      @select="queueMentionSync($event.target)"
      @compositionend="queueMentionSync($event.target)"
      @scroll="updateMentionAnchorFromInput"
      @keydown="handleKeydown"
      @focusout="handleFocusOut"
    />
    <BPopover
      v-model:open="mentionOpen"
      class="todo-resource-mention-input__anchor"
      :style="mentionAnchorStyle"
      trigger="manual"
      placement="bottom-left"
      :overlay-class-name="
        mentionHasResults ? 'todo-resource-mention-popover' : 'todo-resource-mention-popover is-empty'
      "
      @open-change="handleOpenChange"
    >
      <span aria-hidden="true"></span>
      <template #content>
        <ResourcePickerPanel
          ref="mentionPanelRef"
          :allowed-types="['bookmark', 'note', 'file']"
          :show-search="false"
          inline
          :keyword="mentionQuery?.keyword || ''"
          @mousedown.prevent
          @select="applyMentionSelection"
          @close="closeMention({ dismissed: true })"
          @results-count="mentionHasResults = $event > 0"
        />
      </template>
    </BPopover>
  </div>
</template>

<script setup lang="ts">
  import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import ResourcePickerPanel from '@/components/resourcePicker/ResourcePickerPanel.vue';
  import { useDismissOnOutside } from '@/composables/useDismissOnOutside';
  import { replaceMentionQuery, resolveMentionQuery, type MentionQuery } from '@/utils/resourceMentionTrigger';
  import { getTextareaCaretRect, toAnchorOffset } from '@/utils/textareaCaret';
  import type { ResourcePickerItem } from '@/composables/useResourcePickerSearch';

  type BInputExpose = {
    focus?: () => void;
    inputEl?: HTMLInputElement | HTMLTextAreaElement | null;
  };

  withDefaults(
    defineProps<{
      rows?: number;
      maxlength?: number | string;
      placeholder?: string;
    }>(),
    {
      rows: 3,
      maxlength: 2000,
      placeholder: '',
    },
  );

  const value = defineModel<string>('value', { default: '' });
  const emit = defineEmits<{
    select: [item: ResourcePickerItem];
  }>();

  const fieldRef = ref<HTMLElement | null>(null);
  const inputRef = ref<BInputExpose | null>(null);
  const mentionPanelRef = ref<{ chooseActive: () => void; moveActive: (offset: number) => void } | null>(null);
  const mentionQuery = ref<MentionQuery | null>(null);
  const mentionOpen = ref(false);
  const mentionHasResults = ref(false);
  const mentionAnchorStyle = ref<Record<string, string>>({
    position: 'absolute',
    left: '0px',
    top: '0px',
    width: '1px',
    height: '1px',
    pointerEvents: 'none',
  });
  let dismissedMentionStart: number | null = null;
  let syncTimer: number | null = null;

  function resolveTextarea(target?: EventTarget | null) {
    if (target instanceof HTMLTextAreaElement) return target;
    const input = inputRef.value?.inputEl;
    return input instanceof HTMLTextAreaElement ? input : null;
  }

  function updateMentionAnchor(textarea: HTMLTextAreaElement, query: MentionQuery) {
    const field = fieldRef.value;
    if (!field) return;
    const offset = toAnchorOffset(getTextareaCaretRect(textarea, query.start), field);
    mentionAnchorStyle.value = {
      position: 'absolute',
      left: `${offset.left}px`,
      top: `${offset.top}px`,
      width: '1px',
      height: `${Math.max(offset.lineHeight, 18) + 6}px`,
      pointerEvents: 'none',
    };
  }

  function updateMentionAnchorFromInput(event?: Event) {
    const query = mentionQuery.value;
    const textarea = resolveTextarea(event?.target);
    if (query && textarea) updateMentionAnchor(textarea, query);
  }

  function closeMention(options?: { dismissed?: boolean }) {
    if (options?.dismissed && mentionQuery.value) dismissedMentionStart = mentionQuery.value.start;
    mentionQuery.value = null;
    mentionHasResults.value = false;
    mentionOpen.value = false;
  }

  function syncMention(target?: EventTarget | null) {
    const textarea = resolveTextarea(target);
    if (!textarea || typeof textarea.selectionStart !== 'number') {
      closeMention();
      return;
    }
    const next = resolveMentionQuery(String(textarea.value || ''), textarea.selectionStart);
    if (!next) {
      dismissedMentionStart = null;
      closeMention();
      return;
    }
    if (dismissedMentionStart === next.start) {
      mentionQuery.value = null;
      mentionOpen.value = false;
      return;
    }

    const isNewMention = !mentionQuery.value || mentionQuery.value.start !== next.start;
    mentionQuery.value = next;
    if (isNewMention) {
      mentionHasResults.value = false;
      updateMentionAnchor(textarea, next);
    }
    mentionOpen.value = true;
  }

  function queueMentionSync(target?: EventTarget | null) {
    if (syncTimer !== null) window.clearTimeout(syncTimer);
    syncTimer = window.setTimeout(() => {
      syncTimer = null;
      syncMention(target);
    }, 0);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.isComposing || event.keyCode === 229) return;
    if (mentionQuery.value && mentionHasResults.value) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        mentionPanelRef.value?.moveActive(event.key === 'ArrowDown' ? 1 : -1);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        mentionPanelRef.value?.chooseActive();
        return;
      }
    }
    if (mentionQuery.value && event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeMention({ dismissed: true });
      return;
    }
    queueMentionSync(event.target);
  }

  function handleOpenChange(open: boolean) {
    if (!open && mentionQuery.value) closeMention({ dismissed: true });
  }

  function handleFocusOut() {
    void nextTick(() => {
      const active = document.activeElement;
      if (active instanceof Element && active.closest('.todo-resource-mention-popover')) return;
      if (mentionQuery.value) closeMention({ dismissed: true });
    });
  }

  function applyMentionSelection(item: ResourcePickerItem) {
    const query = mentionQuery.value;
    if (!query) return;
    const caret = query.start;
    const nextValue = replaceMentionQuery(value.value, query);
    closeMention();
    value.value = nextValue;
    emit('select', item);
    void nextTick(() => {
      const textarea = resolveTextarea();
      textarea?.focus({ preventScroll: true });
      textarea?.setSelectionRange(caret, caret);
    });
  }

  useDismissOnOutside({
    isActive: () => mentionOpen.value,
    ignoreSelectors: ['.todo-resource-mention-input', '.todo-resource-mention-popover'],
    onDismiss: () => closeMention({ dismissed: true }),
    withEscape: false,
  });

  // 父表单切换待办或重置说明时，旧 @ 查询不能继续挂在新值上。
  watch(value, () => {
    if (!mentionQuery.value) return;
    void nextTick(() => {
      const textarea = resolveTextarea();
      const next = textarea ? resolveMentionQuery(value.value, textarea.selectionStart) : null;
      if (!next || next.start !== mentionQuery.value?.start) closeMention();
    });
  });

  onBeforeUnmount(() => {
    if (syncTimer !== null) window.clearTimeout(syncTimer);
  });

  defineExpose({
    close: closeMention,
    focus: () => inputRef.value?.focus?.(),
  });
</script>

<style scoped lang="less">
  .todo-resource-mention-input {
    position: relative;
    min-width: 0;
  }
</style>

<style lang="less">
  .todo-resource-mention-popover {
    padding: 0 !important;
    overflow: hidden;
  }

  .todo-resource-mention-popover.is-empty {
    display: none !important;
  }
</style>
