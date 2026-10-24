<template>
  <Teleport v-for="slot in slots" :key="slot.key" :to="slot.media">
    <div
      class="rich-media-image-slot"
      :class="{ 'is-error': failedItem === slot.item }"
      data-ln-media-image-placeholder="true"
      data-mce-bogus="all"
      contenteditable="false"
      @mousedown.stop="focusPlaceholder"
      @click.stop
      @paste="pasteImage($event, slot)"
    >
      <span v-if="readonly" class="rich-media-image-slot__readonly">{{
        t('noteDetail.editor.mediaTextImageEmpty')
      }}</span>
      <template v-else>
        <BButton
          class="rich-media-image-slot__button"
          :loading="busyItem === slot.item"
          :disabled="busy && busyItem !== slot.item"
          @click="emit('pick', slot.block, slot.item)"
        >
          <SvgIcon :src="icon.noteDetail.toolbar.image" size="22" aria-hidden="true" />
          <span>{{
            busyItem === slot.item
              ? t('noteDetail.editor.mediaTextImageUploading')
              : failedItem === slot.item
                ? t('noteDetail.editor.mediaTextImageRetry')
                : t('noteDetail.editor.mediaTextImageAdd')
          }}</span>
          <span class="rich-media-image-slot__hint">{{
            failedItem === slot.item
              ? t('noteDetail.editor.mediaTextImageFailed')
              : t('noteDetail.editor.mediaTextImagePaste')
          }}</span>
        </BButton>
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
  type Slot = { key: number; block: HTMLElement; item: HTMLElement; media: HTMLElement };
  const slots = shallowRef<Slot[]>([]);
  const keys = new WeakMap<HTMLElement, number>();
  let nextKey = 0;
  let dispose = () => {};

  function focusPlaceholder(event: MouseEvent) {
    if (props.readonly) return;
    // 保留按钮键盘焦点供粘贴使用，避免浏览器同时在不可编辑入口旁放置正文光标。
    event.preventDefault();
    (event.target as Element)?.closest('button')?.focus();
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
    color: var(--desc-color);
    caret-color: transparent;
  }
  .rich-media-image-slot__button {
    width: 100%;
    min-width: 0;
    height: auto;
    min-height: var(--ui-layout-116, 116px);
    padding: var(--ui-space-10, 10px);
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-6, 6px);
    border-style: dashed;
    white-space: normal;
    overflow-wrap: anywhere;
    font-size: var(--ui-font-13, 13px);
    line-height: 1.4;
  }
  .rich-media-image-slot__hint {
    font-size: var(--ui-font-12, 12px);
    color: var(--desc-color);
  }
  .is-error .rich-media-image-slot__button {
    border-color: var(--danger-color);
  }
  .is-error .rich-media-image-slot__hint {
    color: var(--danger-color);
  }
  .rich-media-image-slot__readonly {
    padding: var(--ui-space-10, 10px);
    font-size: var(--ui-font-13, 13px);
  }
</style>
