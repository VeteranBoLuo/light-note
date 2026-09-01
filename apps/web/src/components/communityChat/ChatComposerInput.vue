<template>
  <BInput
    v-if="!richMode"
    ref="plainInput"
    class="chat-composer-input__plain"
    :value="value"
    type="textarea"
    :rows="rows"
    :maxlength="maxlength"
    :submit-on-enter="submitOnEnter"
    :placeholder="placeholder"
    :disabled="disabled"
    @update:value="handlePlainValueUpdate"
    @beforeinput="handleBeforeInput"
    @keydown="handlePlainKeydown"
    @select="handlePlainSelectionChange"
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
    @beforeinput="handleBeforeInput"
    @input="handleRichInput"
    @keydown="handleRichKeydown"
    @keyup="handleRichSelectionChange"
    @mouseup="handleRichSelectionChange"
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
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
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
  type EditorSelection = { start: number; end: number };
  type EditorSnapshot = EditorSelection & { value: string };
  const HISTORY_LIMIT = 100;
  let heightBounds: { minHeight: number; maxHeight: number } | null = null;
  let pendingSelection: EditorSelection | null = null;
  let beforeInputSnapshot: EditorSnapshot | null = null;
  let undoStack: EditorSnapshot[] = [];
  let redoStack: EditorSnapshot[] = [];
  let pendingEmittedValue: string | null = null;
  let observedValue = String(props.value || '');
  let lastSelection: EditorSelection = { start: observedValue.length, end: observedValue.length };
  let restoreFocusAfterModeChange = false;
  let focused = false;

  function emojiLabel(id: string) {
    return t(`communityChat.emoji.jianTuanItems.${id}`);
  }

  function serializeNode(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
    if (node instanceof HTMLElement && node.dataset.composerCaretSentinel === 'true') return '';
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
    const root = richInput.value;
    if (!root) return String(props.value || '');
    const content = serializeNode(root);
    // contenteditable 会用末尾 div/p 表示最后一个可编辑行，serializeNode 会为这类块节点
    // 补一个结构换行；只移除这个浏览器结构标记。正文文本本身以 \n 结尾时（例如
    // Shift+Enter）必须保留，否则重绘后的 DOM 永远与 value 不相等，选区恢复会再次排队，
    // 而 replaceChildren 已把浏览器光标重置到了开头。
    const lastChild = root.lastChild;
    const hasTrailingBlockBoundary = lastChild instanceof HTMLDivElement || lastChild instanceof HTMLParagraphElement;
    return hasTrailingBlockBoundary && content.endsWith('\n') ? content.slice(0, -1) : content;
  }

  function renderRichContent(value: string) {
    const root = richInput.value;
    if (!root) return;
    const fragment = document.createDocumentFragment();
    for (const segment of parseCommunityChatInlineEmojiContent(value)) {
      if (segment.type === 'text') {
        const lines = segment.value.split('\n');
        lines.forEach((line, index) => {
          if (line) fragment.append(document.createTextNode(line));
          // contenteditable 对末尾纯文本换行不会稳定生成空行盒。显式 BR 既能让
          // 第一次 Shift+Enter 立即可见，也与 serializeNode 的 \n 语义一一对应。
          if (index < lines.length - 1) fragment.append(document.createElement('br'));
        });
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
    if (value.endsWith('\n')) {
      // Chromium 需要第二个、不计入正文的 BR 才会为末尾换行建立可见空行盒。
      // 光标停在真实 BR 与哨兵 BR 之间；序列化时忽略哨兵，因此只保存一个 \n。
      const caretSentinel = document.createElement('br');
      caretSentinel.dataset.composerCaretSentinel = 'true';
      fragment.append(caretSentinel);
    }
    root.replaceChildren(fragment);
  }

  function removeRichCaretSentinels() {
    richInput.value
      ?.querySelectorAll<HTMLElement>('[data-composer-caret-sentinel="true"]')
      .forEach((sentinel) => sentinel.remove());
  }

  function syncRichEmojiSelection() {
    const root = richInput.value;
    if (!root) return;
    const selection = richSelectionRange();
    const content = serializeRichContent();
    let searchOffset = 0;
    root.querySelectorAll<HTMLImageElement>('.chat-composer-input__emoji').forEach((image) => {
      const token = image.dataset.inlineEmojiToken || '';
      const tokenStart = token ? content.indexOf(token, searchOffset) : -1;
      const tokenEnd = tokenStart + token.length;
      const selected = Boolean(
        selection &&
        selection.start !== selection.end &&
        tokenStart >= 0 &&
        selection.start < tokenEnd &&
        selection.end > tokenStart,
      );
      image.classList.toggle('is-selected', selected);
      if (tokenStart >= 0) searchOffset = tokenEnd;
    });
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
      return richSelectionRange() || clampSelection(lastSelection, String(props.value || '').length);
    }
    const input = plainInput.value?.inputEl as HTMLTextAreaElement | null | undefined;
    const start = input?.selectionStart ?? props.value.length;
    return { start, end: input?.selectionEnd ?? start };
  }

  function clampSelection(selection: EditorSelection, valueLength: number): EditorSelection {
    const start = Math.min(Math.max(0, selection.start), valueLength);
    const end = Math.min(Math.max(start, selection.end), valueLength);
    return { start, end };
  }

  function currentEditorValue() {
    if (richMode.value && richInput.value) return serializeRichContent();
    const input = plainInput.value?.inputEl as HTMLTextAreaElement | null | undefined;
    return input?.value ?? String(props.value || '');
  }

  function snapshot(value = currentEditorValue(), selection = getSelectionRange()): EditorSnapshot {
    return { value, ...clampSelection(selection, value.length) };
  }

  function sameSnapshot(left: EditorSnapshot | undefined, right: EditorSnapshot) {
    return Boolean(left && left.value === right.value && left.start === right.start && left.end === right.end);
  }

  function pushHistory(stack: EditorSnapshot[], entry: EditorSnapshot) {
    if (sameSnapshot(stack.at(-1), entry)) return;
    stack.push(entry);
    if (stack.length > HISTORY_LIMIT) stack.splice(0, stack.length - HISTORY_LIMIT);
  }

  function setSelectionRange(start: number, end = start) {
    lastSelection = clampSelection({ start, end }, String(props.value || '').length);
    if (!richMode.value) {
      const input = plainInput.value?.inputEl as HTMLTextAreaElement | null | undefined;
      input?.setSelectionRange(lastSelection.start, lastSelection.end);
      return;
    }
    const root = richInput.value;
    if (!root || serializeRichContent() !== props.value) {
      pendingSelection = lastSelection;
      restoreFocusAfterModeChange = restoreFocusAfterModeChange || focused;
      return;
    }
    const selection = window.getSelection();
    if (!selection) return;
    const startPoint = richPointAtOffset(lastSelection.start);
    const endPoint = richPointAtOffset(lastSelection.end);
    const range = document.createRange();
    range.setStart(startPoint.node, startPoint.offset);
    range.setEnd(endPoint.node, endPoint.offset);
    selection.removeAllRanges();
    selection.addRange(range);
    syncRichEmojiSelection();
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
    heightBounds = { minHeight, maxHeight };
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

  function syncRememberedHeight() {
    if (!heightBounds) return;
    syncHeight(heightBounds.minHeight, heightBounds.maxHeight);
  }

  function valueWithinLimits(value: string) {
    return (
      communityChatInlineEmojiLogicalLength(value) <= props.maxlength &&
      Array.from(value).length <= COMMUNITY_CHAT_INLINE_EMOJI_MAX_RAW_LENGTH &&
      countCommunityChatInlineEmojis(value) <= COMMUNITY_CHAT_INLINE_EMOJI_MAX_PER_MESSAGE
    );
  }

  function emitEditorValue(value: string, selection: EditorSelection) {
    const normalizedSelection = clampSelection(selection, value.length);
    pendingSelection = normalizedSelection;
    lastSelection = normalizedSelection;
    restoreFocusAfterModeChange = focused;
    pendingEmittedValue = value;
    emit('update:value', value);
    emit('input', value);
  }

  function updateEditorValue(value: string, selection: EditorSelection, previous?: EditorSnapshot) {
    if (!valueWithinLimits(value)) {
      if (richMode.value) renderRichContent(String(props.value || ''));
      const fallback = previous || snapshot(String(props.value || ''), lastSelection);
      void nextTick(() => setSelectionRange(fallback.start, fallback.end));
      beforeInputSnapshot = null;
      return false;
    }
    if (value === String(props.value || '')) {
      lastSelection = clampSelection(selection, value.length);
      beforeInputSnapshot = null;
      return true;
    }
    pushHistory(undoStack, previous || beforeInputSnapshot || snapshot(String(props.value || ''), lastSelection));
    redoStack = [];
    beforeInputSnapshot = null;
    emitEditorValue(value, selection);
    return true;
  }

  function applyHistory(source: EditorSnapshot[], destination: EditorSnapshot[]) {
    const target = source.pop();
    if (!target) return false;
    pushHistory(destination, snapshot(String(props.value || ''), getSelectionRange()));
    beforeInputSnapshot = null;
    emitEditorValue(target.value, { start: target.start, end: target.end });
    return true;
  }

  function handleHistoryShortcut(event: KeyboardEvent) {
    if (event.altKey || (!event.metaKey && !event.ctrlKey)) return false;
    const key = event.key.toLowerCase();
    const wantsUndo = key === 'z' && !event.shiftKey;
    const wantsRedo = (key === 'z' && event.shiftKey) || (key === 'y' && event.ctrlKey);
    if (!wantsUndo && !wantsRedo) return false;
    const handled = wantsRedo ? applyHistory(redoStack, undoStack) : applyHistory(undoStack, redoStack);
    if (handled) event.preventDefault();
    return handled;
  }

  function handleBeforeInput(event: InputEvent) {
    if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
      const handled =
        event.inputType === 'historyUndo' ? applyHistory(undoStack, redoStack) : applyHistory(redoStack, undoStack);
      if (handled) event.preventDefault();
      return;
    }
    beforeInputSnapshot = snapshot();
  }

  function handlePlainValueUpdate(value: unknown) {
    const nextValue = String(value ?? '');
    const input = plainInput.value?.inputEl as HTMLTextAreaElement | null | undefined;
    const selection = {
      start: input?.selectionStart ?? nextValue.length,
      end: input?.selectionEnd ?? input?.selectionStart ?? nextValue.length,
    };
    updateEditorValue(nextValue, selection);
  }

  function handlePlainKeydown(event: KeyboardEvent) {
    if (handleHistoryShortcut(event)) return;
    emit('keydown', event);
  }

  function handlePlainSelectionChange(event: Event) {
    lastSelection = getSelectionRange();
    emit('select', event);
  }

  function insertRichText(value: string) {
    const selection = getSelectionRange();
    const nextValue = `${props.value.slice(0, selection.start)}${value}${props.value.slice(selection.end)}`;
    const caret = selection.start + value.length;
    updateEditorValue(nextValue, { start: caret, end: caret }, snapshot(String(props.value || ''), selection));
  }

  function replaceSelection(value: string) {
    if (props.disabled) return false;
    const selection = getSelectionRange();
    const currentValue = String(props.value || '');
    const nextValue = `${currentValue.slice(0, selection.start)}${value}${currentValue.slice(selection.end)}`;
    const caret = selection.start + value.length;
    return updateEditorValue(nextValue, { start: caret, end: caret }, snapshot(currentValue, selection));
  }

  function handleRichInput() {
    removeRichCaretSentinels();
    const selection = richSelectionRange() || { start: props.value.length, end: props.value.length };
    updateEditorValue(serializeRichContent(), selection);
  }

  function handleRichKeydown(event: KeyboardEvent) {
    if (handleHistoryShortcut(event)) return;
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

  function handleRichSelectionChange(event: Event) {
    lastSelection = getSelectionRange();
    syncRichEmojiSelection();
    emit('select', event);
  }

  function handleFocus() {
    focused = true;
    lastSelection = getSelectionRange();
    emit('focus');
  }

  function handleBlur() {
    lastSelection = getSelectionRange();
    focused = false;
    emit('focusout');
  }

  watch(
    [() => props.value, richMode],
    async ([value, isRich]) => {
      const nextValue = String(value || '');
      const internalUpdate = pendingEmittedValue === nextValue;
      if (nextValue !== observedValue) {
        if (!internalUpdate) {
          undoStack = [];
          redoStack = [];
          beforeInputSnapshot = null;
          lastSelection = { start: nextValue.length, end: nextValue.length };
        }
        observedValue = nextValue;
      }
      if (internalUpdate) pendingEmittedValue = null;
      await nextTick();
      if (isRich && richInput.value && serializeRichContent() !== nextValue) renderRichContent(nextValue);
      // 普通 textarea 切为富输入时，父层的测高可能早于表情 DOM 渲染。组件记住
      // 已配置的高度边界，并在真实内容落入新节点后再次测量，避免多行文本被锁在最小高度。
      syncRememberedHeight();
      if (!pendingSelection) return;
      const selection = pendingSelection;
      pendingSelection = null;
      if (restoreFocusAfterModeChange) focus();
      restoreFocusAfterModeChange = false;
      setSelectionRange(selection.start, selection.end);
    },
    { immediate: true, flush: 'post' },
  );

  onMounted(() => document.addEventListener('selectionchange', syncRichEmojiSelection));
  onBeforeUnmount(() => document.removeEventListener('selectionchange', syncRichEmojiSelection));

  defineExpose({ blur, focus, getSelectionRange, replaceSelection, setSelectionRange, syncHeight });
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
    font-size: 0.9em;
    font-weight: 400;
    opacity: 0.78;
    pointer-events: none;
  }

  .chat-composer-input__rich.is-disabled {
    cursor: not-allowed;
    opacity: 0.72;
  }

  .chat-composer-input__plain :deep(.b-textarea) {
    display: block;
    font-size: inherit;
  }

  .chat-composer-input__plain :deep(.b-textarea::placeholder) {
    color: var(--desc-color);
    font-size: 0.9em;
    font-weight: 400;
    opacity: 0.78;
  }

  .chat-composer-input__rich :deep(.chat-composer-input__emoji) {
    width: 1em;
    height: 1em;
    margin-inline: 0.38em;
    display: inline-block;
    vertical-align: -0.12em;
    object-fit: contain;
    transform: scale(1.45);
    transform-origin: center;
    user-select: none;
  }

  .chat-composer-input__rich :deep(.chat-composer-input__emoji.is-selected) {
    background: rgba(144, 198, 255, 0.55);
  }
</style>
