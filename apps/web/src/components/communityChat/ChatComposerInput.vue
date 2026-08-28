<template>
  <BInput
    v-if="!richMode"
    ref="plainInput"
    :value="value"
    type="textarea"
    :rows="rows"
    :maxlength="maxlength"
    :submit-on-enter="submitOnEnter"
    :placeholder="placeholder"
    :disabled="disabled"
    @update:value="emit('update:value', String($event ?? ''))"
    @input="emit('input', $event)"
    @keydown="emit('keydown', $event)"
    @select="emit('select', $event)"
    @compositionstart="emit('compositionstart', $event)"
    @compositionend="emit('compositionend', $event)"
    @focus="handleFocus"
    @focusout="handleBlur"
    @enter="emit('enter', $event)"
  />
  <div
    v-else
    ref="richInput"
    class="chat-composer-input__rich b-textarea"
    :class="{ 'is-disabled': disabled }"
    :contenteditable="disabled ? 'false' : 'true'"
    :data-placeholder="placeholder"
    :aria-label="placeholder"
    :aria-disabled="disabled"
    aria-multiline="true"
    role="textbox"
    spellcheck="true"
    @input="handleRichInput"
    @keydown="handleRichKeydown"
    @keyup="emit('select', $event)"
    @mouseup="emit('select', $event)"
    @compositionstart="emit('compositionstart', $event)"
    @compositionend="handleRichCompositionEnd"
    @focus="handleFocus"
    @blur="handleBlur"
    @paste="handleRichPaste"
  ></div>
</template>

<script setup lang="ts">
  import {
    COMMUNITY_CHAT_INLINE_EMOJI_MAX_PER_MESSAGE,
    COMMUNITY_CHAT_INLINE_EMOJI_MAX_RAW_LENGTH,
    communityChatInlineEmojiLogicalLength,
    countCommunityChatInlineEmojis,
    parseCommunityChatInlineEmojiContent,
  } from '@lightnote/shared/community-chat-inline-emojis';
  import { computed, nextTick, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BInput from '@/components/base/BasicComponents/BInput.vue';

  const props = withDefaults(
    defineProps<{
      value?: string;
      rows?: number;
      maxlength?: number;
      submitOnEnter?: boolean;
      placeholder?: string;
      disabled?: boolean;
    }>(),
    {
      value: '',
      rows: 1,
      maxlength: 2000,
      submitOnEnter: true,
      placeholder: '',
      disabled: false,
    },
  );
  const emit = defineEmits<{
    'update:value': [value: string];
    input: [value: string];
    keydown: [event: KeyboardEvent];
    select: [event: Event];
    compositionstart: [event: CompositionEvent];
    compositionend: [event: CompositionEvent];
    focus: [];
    focusout: [];
    enter: [event: KeyboardEvent];
  }>();
  const { t } = useI18n();
  const plainInput = ref<InstanceType<typeof BInput> | null>(null);
  const richInput = ref<HTMLElement | null>(null);
  const richMode = computed(() => countCommunityChatInlineEmojis(props.value) > 0);
  let pendingSelection: { start: number; end: number } | null = null;
  let restoreFocusAfterModeChange = false;
  let focused = false;

  function emojiLabel(id: string) {
    return t(`communityChat.emoji.jianTuanItems.${id}`);
  }

  function serializeNode(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
    if (node instanceof HTMLImageElement) return node.dataset.inlineEmojiToken || '';
    if (node instanceof HTMLBRElement) return '\n';
    let content = '';
    node.childNodes.forEach((child) => {
      content += serializeNode(child);
    });
    if (node instanceof HTMLDivElement || node instanceof HTMLParagraphElement) {
      if (node !== richInput.value && content && !content.endsWith('\n')) content += '\n';
    }
    return content;
  }

  function serializeRichContent() {
    return richInput.value ? serializeNode(richInput.value).replace(/\n$/u, '') : String(props.value || '');
  }

  function renderRichContent(value: string) {
    const root = richInput.value;
    if (!root) return;
    const fragment = document.createDocumentFragment();
    for (const segment of parseCommunityChatInlineEmojiContent(value)) {
      if (segment.type === 'text') {
        fragment.append(document.createTextNode(segment.value));
        continue;
      }
      const image = document.createElement('img');
      image.className = 'chat-composer-input__emoji';
      image.src = segment.emoji.assetPath;
      image.alt = emojiLabel(segment.emoji.id);
      image.title = emojiLabel(segment.emoji.id);
      image.width = 28;
      image.height = 28;
      image.draggable = false;
      image.contentEditable = 'false';
      image.dataset.inlineEmojiToken = segment.emoji.token;
      fragment.append(image);
    }
    root.replaceChildren(fragment);
  }

  function richSelectionRange() {
    const root = richInput.value;
    const selection = window.getSelection();
    if (!root || !selection?.rangeCount) return null;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
    const prefix = document.createRange();
    prefix.selectNodeContents(root);
    prefix.setEnd(range.startContainer, range.startOffset);
    const suffix = document.createRange();
    suffix.selectNodeContents(root);
    suffix.setEnd(range.endContainer, range.endOffset);
    return {
      start: serializeNode(prefix.cloneContents()).length,
      end: serializeNode(suffix.cloneContents()).length,
    };
  }

  function richPointAtOffset(offset: number): { node: Node; offset: number } {
    const root = richInput.value;
    if (!root) return { node: document.body, offset: 0 };
    const requested = Math.max(0, offset);
    let consumed = 0;
    const children = Array.from(root.childNodes);
    for (const [index, child] of children.entries()) {
      const content = serializeNode(child);
      const length = content.length;
      if (child.nodeType === Node.TEXT_NODE && requested <= consumed + length) {
        return { node: child, offset: Math.max(0, requested - consumed) };
      }
      if (requested <= consumed) return { node: root, offset: index };
      if (requested <= consumed + length) return { node: root, offset: index + 1 };
      consumed += length;
    }
    return { node: root, offset: children.length };
  }

  function getSelectionRange() {
    if (richMode.value) {
      return richSelectionRange() || { start: props.value.length, end: props.value.length };
    }
    const input = plainInput.value?.inputEl as HTMLTextAreaElement | null | undefined;
    const start = input?.selectionStart ?? props.value.length;
    return { start, end: input?.selectionEnd ?? start };
  }

  function setSelectionRange(start: number, end = start) {
    if (!richMode.value) {
      const input = plainInput.value?.inputEl as HTMLTextAreaElement | null | undefined;
      input?.setSelectionRange(start, end);
      return;
    }
    const root = richInput.value;
    if (!root || serializeRichContent() !== props.value) {
      pendingSelection = { start, end };
      restoreFocusAfterModeChange = restoreFocusAfterModeChange || focused;
      return;
    }
    const selection = window.getSelection();
    if (!selection) return;
    const startPoint = richPointAtOffset(start);
    const endPoint = richPointAtOffset(end);
    const range = document.createRange();
    range.setStart(startPoint.node, startPoint.offset);
    range.setEnd(endPoint.node, endPoint.offset);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function focus() {
    if (richMode.value) richInput.value?.focus();
    else plainInput.value?.focus();
  }

  function blur() {
    if (richMode.value) richInput.value?.blur();
    else (plainInput.value?.inputEl as HTMLTextAreaElement | null | undefined)?.blur();
  }

  function syncHeight(minHeight: number, maxHeight: number) {
    const input = richMode.value
      ? richInput.value
      : (plainInput.value?.inputEl as HTMLTextAreaElement | null | undefined);
    if (!input) return;
    input.style.height = 'auto';
    const contentHeight = input.scrollHeight;
    const nextHeight = Math.min(Math.max(contentHeight, minHeight), maxHeight);
    input.style.height = `${nextHeight}px`;
    input.style.overflowY = contentHeight > maxHeight ? 'auto' : 'hidden';
  }

  function updateRichValue(value: string, selection: { start: number; end: number }) {
    if (
      communityChatInlineEmojiLogicalLength(value) > props.maxlength ||
      Array.from(value).length > COMMUNITY_CHAT_INLINE_EMOJI_MAX_RAW_LENGTH ||
      countCommunityChatInlineEmojis(value) > COMMUNITY_CHAT_INLINE_EMOJI_MAX_PER_MESSAGE
    ) {
      renderRichContent(props.value);
      void nextTick(() => setSelectionRange(selection.start, selection.end));
      return;
    }
    pendingSelection = selection;
    restoreFocusAfterModeChange = focused;
    emit('update:value', value);
    emit('input', value);
  }

  function insertRichText(value: string) {
    const selection = getSelectionRange();
    const nextValue = `${props.value.slice(0, selection.start)}${value}${props.value.slice(selection.end)}`;
    const caret = selection.start + value.length;
    updateRichValue(nextValue, { start: caret, end: caret });
  }

  function handleRichInput() {
    const selection = richSelectionRange() || { start: props.value.length, end: props.value.length };
    updateRichValue(serializeRichContent(), selection);
  }

  function handleRichKeydown(event: KeyboardEvent) {
    emit('keydown', event);
    if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Enter') {
      if (props.submitOnEnter && !event.shiftKey) {
        event.preventDefault();
        emit('enter', event);
      } else if (event.shiftKey) {
        event.preventDefault();
        insertRichText('\n');
      }
    }
  }

  function handleRichCompositionEnd(event: CompositionEvent) {
    emit('compositionend', event);
    handleRichInput();
  }

  function handleRichPaste(event: ClipboardEvent) {
    if (!event.clipboardData) return;
    const hasFiles = Array.from(event.clipboardData.types || []).includes('Files');
    if (hasFiles) return;
    event.preventDefault();
    insertRichText(event.clipboardData.getData('text/plain'));
  }

  function handleFocus() {
    focused = true;
    emit('focus');
  }

  function handleBlur() {
    focused = false;
    emit('focusout');
  }

  watch(
    [() => props.value, richMode],
    async ([value, isRich]) => {
      await nextTick();
      if (isRich && richInput.value && serializeRichContent() !== value) renderRichContent(value);
      if (!pendingSelection) return;
      const selection = pendingSelection;
      pendingSelection = null;
      if (restoreFocusAfterModeChange) focus();
      restoreFocusAfterModeChange = false;
      setSelectionRange(selection.start, selection.end);
    },
    { immediate: true, flush: 'post' },
  );

  defineExpose({ blur, focus, getSelectionRange, setSelectionRange, syncHeight });
</script>

<style scoped lang="less">
  .chat-composer-input__rich {
    width: 100%;
    box-sizing: border-box;
    color: var(--bl-input-color);
    font-family: inherit;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    cursor: text;
  }

  .chat-composer-input__rich:empty::before {
    color: var(--desc-color);
    content: attr(data-placeholder);
    pointer-events: none;
  }

  .chat-composer-input__rich.is-disabled {
    cursor: not-allowed;
    opacity: 0.72;
  }

  .chat-composer-input__rich :deep(.chat-composer-input__emoji) {
    width: 1.7em;
    height: 1.7em;
    margin-inline: 0.04em;
    display: inline-block;
    vertical-align: -0.3em;
    object-fit: contain;
    user-select: none;
  }
</style>
