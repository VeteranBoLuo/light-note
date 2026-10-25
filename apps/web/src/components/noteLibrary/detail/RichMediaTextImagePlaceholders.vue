<template>
  <Teleport v-for="slot in slots" :key="slot.key" :to="slot.media">
    <div
      class="rich-media-image-slot"
      :class="{ 'is-error': failedItem === slot.item, 'is-readonly': readonly }"
      data-ln-media-image-placeholder="true"
      data-mce-bogus="all"
      contenteditable="false"
      @touchstart.stop
      @touchend.stop
      @touchcancel.stop
      @mousedown.stop="focusPlaceholder"
      @click.stop="focusPasteArea"
      @contextmenu.stop="focusPasteArea"
      @keydown.stop
      @keyup.stop
      @paste="pasteImage($event, slot)"
    >
      <span v-if="readonly" class="rich-media-image-slot__readonly">{{
        t('noteDetail.editor.mediaTextImageEmpty')
      }}</span>
      <template v-else>
        <div class="rich-media-image-slot__surface">
          <div
            class="rich-media-image-slot__paste"
            contenteditable="true"
            role="textbox"
            tabindex="0"
            :aria-label="t('noteDetail.editor.mediaTextImagePaste')"
            :aria-disabled="busy || undefined"
            :aria-busy="busyItem === slot.item || undefined"
            spellcheck="false"
            @keydown="keepPasteAreaFocus"
            @beforeinput.stop.prevent
            @input.stop="clearPasteInput"
            @drop.stop.prevent
          ></div>
          <div class="rich-media-image-slot__prompt" aria-hidden="true">
            <SvgIcon :src="icon.noteDetail.toolbar.image" size="22" />
            <span>{{
              busyItem === slot.item
                ? t('noteDetail.editor.mediaTextImageUploading')
                : t('noteDetail.editor.mediaTextImagePaste')
            }}</span>
          </div>
        </div>
        <BButton
          class="rich-media-image-slot__button"
          size="small"
          :loading="busyItem === slot.item"
          :disabled="busy && busyItem !== slot.item"
          @click="emit('pick', slot.block, slot.item)"
        >
          <span>{{
            failedItem === slot.item
              ? t('noteDetail.editor.mediaTextImageRetry')
              : t('noteDetail.editor.mediaTextImageAdd')
          }}</span>
        </BButton>
        <span v-if="failedItem === slot.item" class="rich-media-image-slot__hint" role="status">{{
          t('noteDetail.editor.mediaTextImageFailed')
        }}</span>
        <BProgress
          v-if="busyItem === slot.item && progress !== null"
          :percent="progress"
          size="small"
          :aria-label="t('noteDetail.editor.mediaTextImageUploading')"
        />
      </template>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
  import { onBeforeUnmount, shallowRef, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { Editor } from 'tinymce';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BProgress from '@/components/base/BasicComponents/BProgress.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { ensureRichMediaTextMedia } from '@/utils/richMediaText';

  const props = defineProps<{
    editor: Editor | null;
    readonly: boolean;
    busy: boolean;
    busyItem: HTMLElement | null;
    failedItem: HTMLElement | null;
    progress: number | null;
  }>();
  const emit = defineEmits<{
    pick: [block: HTMLElement, item: HTMLElement];
    paste: [event: ClipboardEvent, block: HTMLElement, item: HTMLElement];
  }>();
  const { t } = useI18n();
  // 占位框阻止 touch 冒泡，避免 TinyMCE 的 tap 将其选中并取消原生 click；
  // 不 preventDefault，保留按钮点击、长按粘贴与滚动。
  type Slot = { key: number; block: HTMLElement; item: HTMLElement; media: HTMLElement };
  const slots = shallowRef<Slot[]>([]);
  const keys = new WeakMap<HTMLElement, number>();
  let nextKey = 0;
  let dispose = () => {};

  function focusPlaceholder(event: MouseEvent) {
    if (props.readonly) return;
    const button = (event.target as Element)?.closest('button');
    if (button) {
      event.preventDefault();
      button.focus();
    }
  }

  function focusPasteArea(event: MouseEvent) {
    if (props.readonly || (event.target as Element)?.closest('button')) return;
    (event.currentTarget as HTMLElement).querySelector<HTMLElement>('.rich-media-image-slot__paste')?.focus();
  }

  function clearPasteInput(event: Event) {
    // 这里只接收粘贴事件；IME 等绕过 beforeinput 的临时文字也不能变成笔记内容。
    (event.currentTarget as HTMLElement).replaceChildren();
  }

  function keepPasteAreaFocus(event: KeyboardEvent) {
    // 嵌套编辑区的原生方向键会越过空区域进入图注；粘贴位不承担正文导航或文字编辑。
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Backspace', 'Delete', 'Enter'].includes(event.key))
      event.preventDefault();
  }

  function pasteImage(event: ClipboardEvent, slot: Slot) {
    if (props.readonly) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    emit('paste', event, slot.block, slot.item);
  }

  watch(
    () => props.editor,
    (editor) => {
      dispose();
      slots.value = [];
      if (!editor) return;
      let frame: number | null = null;
      let observedBody: HTMLElement | null = null;
      const sync = () => {
        frame = null;
        const body = editor.getBody();
        if (!body || editor.removed) return;
        if (observedBody !== body) {
          observer.disconnect();
          observer.observe(body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
          observedBody = body;
        }
        const next: Slot[] = [];
        // 界面由 Vue/B 组件渲染在临时根节点内，整个根节点不进入正文和撤销快照。
        editor.undoManager.ignore(() => {
          body.querySelectorAll<HTMLElement>('section.ln-media-text > .ln-media-text__item').forEach((item) => {
            const hadMedia = Array.from(item.children).some((child) =>
              child.classList.contains('ln-media-text__media'),
            );
            const media = ensureRichMediaTextMedia(item);
            // 原生删除若连容器一起移除，补回的空壳也只是临时界面；否则下一次 focus
            // 会把补壳判为新编辑，导致撤销先撤掉空壳而不是恢复图片。
            if (media && !hadMedia) media.setAttribute('data-mce-bogus', 'all');
            if (!media || Array.from(media.querySelectorAll('img')).some((image) => image.getAttribute('src')?.trim()))
              return;
            if (!keys.has(media)) keys.set(media, ++nextKey);
            next.push({ key: keys.get(media)!, block: item.parentElement!, item, media });
          });
        });
        if (
          next.length !== slots.value.length ||
          next.some((slot, index) => slot.media !== slots.value[index]?.media)
        ) {
          slots.value = next;
        }
      };
      const schedule = () => {
        if (frame === null) frame = requestAnimationFrame(sync);
      };
      const observer = new MutationObserver((records) => {
        if (
          records.some((record) => {
            const target = record.target instanceof Element ? record.target : record.target.parentElement;
            if (target?.closest('[data-ln-media-image-placeholder]')) return false;
            return (
              target?.closest('.ln-media-text') ||
              [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].some(
                (node) =>
                  node instanceof Element &&
                  (node.matches('section.ln-media-text') || node.querySelector('section.ln-media-text')),
              )
            );
          })
        )
          schedule();
      });
      editor.on('init SetContent undo redo input', schedule);
      editor.on('remove', schedule);
      if (editor.initialized) sync();
      dispose = () => {
        editor.off('init SetContent undo redo input', schedule);
        editor.off('remove', schedule);
        observer.disconnect();
        if (frame !== null) cancelAnimationFrame(frame);
      };
    },
    { immediate: true, flush: 'post' },
  );
  onBeforeUnmount(() => dispose());
</script>

<style scoped lang="less">
  .rich-media-image-slot {
    width: 100%;
    min-width: 0;
    display: grid;
    gap: var(--ui-space-6, 6px);
    box-sizing: border-box;
    padding: var(--ui-space-6, 6px);
    border: 1px dashed var(--surface-border-color);
    border-radius: 6px;
    color: var(--desc-color);
    &:focus-within {
      border-color: var(--primary-color);
      border-style: solid;
    }
    &.is-readonly {
      border: none;
    }
  }
  .rich-media-image-slot__surface {
    position: relative;
    min-height: var(--ui-layout-64, 64px);
    display: grid;
  }
  .rich-media-image-slot__paste {
    position: absolute;
    inset: 0;
    padding: var(--ui-space-6, 6px);
    // TinyMCE 默认给嵌套编辑区常驻描边；这里由外层 focus-within 显示真实焦点。
    outline: none !important;
    cursor: text;
    caret-color: var(--text-color);
    font-size: var(--ui-font-13, 13px);
  }
  .rich-media-image-slot__prompt {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--ui-space-6, 6px);
    padding: var(--ui-space-6, 6px);
    pointer-events: none;
    text-align: center;
    overflow-wrap: anywhere;
    font-size: var(--ui-font-13, 13px);
    line-height: 1.4;
  }
  .rich-media-image-slot__button {
    width: 100%;
    min-width: 0;
    height: auto;
    min-height: var(--ui-control-24, 24px);
    padding: var(--ui-space-6, 6px);
    white-space: normal;
    overflow-wrap: anywhere;
    font-size: var(--ui-font-13, 13px);
    line-height: 1.4;
  }
  .rich-media-image-slot__hint {
    font-size: var(--ui-font-12, 12px);
    text-align: center;
    color: var(--danger-color);
  }
  .rich-media-image-slot.is-error {
    border-color: var(--danger-color);
  }
  .rich-media-image-slot__readonly {
    padding: var(--ui-space-10, 10px);
    font-size: var(--ui-font-13, 13px);
  }
</style>
