<template>
  <div
    ref="target"
    class="ln-extension-rich-editor"
    contenteditable="true"
    role="textbox"
    aria-multiline="true"
    :aria-label="ariaLabel"
    :data-placeholder="ariaLabel"
    @input="emitSanitizedContent"
    @keydown="handleFormatShortcut"
    @blur="normalizeEditorContent"
    @paste.prevent="insertClipboardContent"
    @drop.prevent="insertDroppedContent"
  ></div>
</template>

<script setup lang="ts">
  import { onMounted, ref, watch } from 'vue';
  import DOMPurify from 'dompurify';

  const props = withDefaults(defineProps<{
    modelValue?: string;
    ariaLabel?: string;
  }>(), {
    modelValue: '',
    ariaLabel: '',
  });
  const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
  const target = ref<HTMLDivElement | null>(null);

  const SANITIZE_OPTIONS = Object.freeze({
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form'],
    FORBID_ATTR: ['style'],
    ALLOW_DATA_ATTR: false,
  });

  function sanitize(value: string): string {
    return DOMPurify.sanitize(String(value || ''), SANITIZE_OPTIONS);
  }

  function readSanitizedContent(): string {
    return sanitize(target.value?.innerHTML || '');
  }

  function setEditorContent(value: string) {
    if (!target.value) return;
    const safeValue = sanitize(value);
    if (sanitize(target.value.innerHTML) !== safeValue) target.value.innerHTML = safeValue;
  }

  function emitSanitizedContent() {
    const value = readSanitizedContent();
    if (value !== props.modelValue) emit('update:modelValue', value);
  }

  function normalizeEditorContent() {
    const value = readSanitizedContent();
    if (target.value && target.value.innerHTML !== value) target.value.innerHTML = value;
    if (value !== props.modelValue) emit('update:modelValue', value);
  }

  function handleFormatShortcut(event: KeyboardEvent) {
    if ((!event.metaKey && !event.ctrlKey) || event.altKey) return;
    const command = ({ b: 'bold', i: 'italic', u: 'underline' } as const)[event.key.toLowerCase() as 'b' | 'i' | 'u'];
    if (!command) return;
    event.preventDefault();
    document.execCommand(command, false);
    queueMicrotask(emitSanitizedContent);
  }

  function plainTextHtml(value: string): string {
    const container = document.createElement('div');
    String(value || '').split(/\r?\n/u).forEach((line, index) => {
      if (index > 0) container.append(document.createElement('br'));
      container.append(document.createTextNode(line));
    });
    return container.innerHTML;
  }

  function insertHtmlAtSelection(rawHtml: string) {
    const editor = target.value;
    if (!editor) return;
    const template = document.createElement('template');
    template.innerHTML = sanitize(rawHtml);
    const fragment = template.content;
    const lastNode = fragment.lastChild;
    const selection = window.getSelection();
    const activeRange = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const range = activeRange && editor.contains(activeRange.commonAncestorContainer)
      ? activeRange
      : document.createRange();
    if (!activeRange || !editor.contains(activeRange.commonAncestorContainer)) range.selectNodeContents(editor);
    range.collapse(false);
    range.insertNode(fragment);
    if (lastNode && selection) {
      range.setStartAfter(lastNode);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    emitSanitizedContent();
  }

  function transferableHtml(data: DataTransfer | null): string {
    if (!data) return '';
    return data.getData('text/html') || plainTextHtml(data.getData('text/plain'));
  }

  function insertClipboardContent(event: ClipboardEvent) {
    insertHtmlAtSelection(transferableHtml(event.clipboardData));
  }

  function insertDroppedContent(event: DragEvent) {
    insertHtmlAtSelection(transferableHtml(event.dataTransfer));
  }

  onMounted(() => setEditorContent(props.modelValue));
  watch(() => props.modelValue, setEditorContent);
</script>

<style scoped lang="less">
  .ln-extension-rich-editor {
    min-height: 290px;
    box-sizing: border-box;
    padding: 14px;
    overflow-wrap: anywhere;
    color: var(--text-color);
    background: transparent;
    font-size: 14px;
    line-height: 1.65;
    outline: none;

    &:empty::before {
      content: attr(data-placeholder);
      color: var(--desc-color);
      pointer-events: none;
    }

    :first-child { margin-top: 0; }
    :last-child { margin-bottom: 0; }
    img { max-width: 100%; }
    pre { overflow: auto; white-space: pre-wrap; }
    table { max-width: 100%; border-collapse: collapse; }
    td,
    th { border: 1px solid var(--surface-border-color); }
  }
</style>
