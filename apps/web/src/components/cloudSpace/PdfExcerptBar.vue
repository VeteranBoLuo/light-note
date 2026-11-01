<template>
  <!-- 按下时阻止默认行为：点按钮不能把 PDF 里的选区清掉。 -->
  <div
    class="pdf-excerpt-bar"
    :class="{ 'is-mobile': mobile, 'is-done': status !== 'idle' }"
    role="toolbar"
    :aria-label="t('cloudSpace.previewPanel.pdfExcerptActions')"
    @mousedown.prevent
  >
    <template v-if="status === 'idle'">
      <BButton
        v-if="mobile"
        class="pdf-excerpt-bar__action"
        :aria-label="t('cloudSpace.previewPanel.pdfExcerptCopy')"
        @click="emit('copy')"
      >
        <SvgIcon :src="icon.cloudSpace.preview.copy" size="16" aria-hidden="true" />
        <span>{{ t('cloudSpace.previewPanel.pdfExcerptCopy') }}</span>
      </BButton>
      <BButton v-if="mode === 'insert'" class="pdf-excerpt-bar__action is-primary" :loading="busy" @click="emit('insert')">
        <SvgIcon :src="icon.noteDetail.toolbar.quote" size="16" aria-hidden="true" />
        <span>{{ t('cloudSpace.previewPanel.pdfExcerptInsert') }}</span>
      </BButton>
      <BPopover
        v-else-if="mode === 'pick' && !mobile"
        v-model:open="pickerOpen"
        trigger="click"
        placement="bottom-left"
        overlay-class-name="pdf-excerpt-note-picker-popover"
        :get-popup-container="popupContainer"
      >
        <BButton class="pdf-excerpt-bar__action is-primary" :loading="sending">
          <SvgIcon :src="icon.resource.note" size="16" aria-hidden="true" />
          <span>{{ t('cloudSpace.previewPanel.pdfExcerptToNote') }}</span>
        </BButton>
        <template #content>
          <PdfExcerptNotePicker :new-note-title="newNoteTitle" :busy="sending" @select="choose" @close="pickerOpen = false" />
        </template>
      </BPopover>
      <BButton v-else-if="mode === 'pick'" class="pdf-excerpt-bar__action is-primary" :loading="sending" @click="pickerOpen = true">
        <SvgIcon :src="icon.resource.note" size="16" aria-hidden="true" />
        <span>{{ t('cloudSpace.previewPanel.pdfExcerptToNote') }}</span>
      </BButton>
      <template v-if="!mobile">
        <span v-if="mode !== 'copy'" class="pdf-excerpt-bar__divider" aria-hidden="true" />
        <BButton class="pdf-excerpt-bar__action" @click="emit('copy')">
          <SvgIcon :src="icon.cloudSpace.preview.copy" size="16" aria-hidden="true" />
          <span>{{ t('cloudSpace.previewPanel.pdfExcerptCopy') }}</span>
        </BButton>
      </template>
    </template>
    <div v-else class="pdf-excerpt-bar__done" role="status">
      <SvgIcon :src="icon.message.success" size="16" class="pdf-excerpt-bar__done-icon" aria-hidden="true" />
      <span>{{ t(status === 'copied' ? 'cloudSpace.previewPanel.pdfExcerptCopied' : 'cloudSpace.previewPanel.pdfExcerptInserted') }}</span>
      <BButton v-if="status === 'inserted'" class="pdf-excerpt-bar__undo" @click="emit('undo')">
        {{ t('cloudSpace.previewPanel.pdfExcerptUndo') }}
      </BButton>
    </div>

    <BDrawer
      v-if="mobile && mode === 'pick'"
      :open="pickerOpen"
      placement="bottom"
      height="min(72dvh, 560px)"
      :z-index="960"
      :title="t('cloudSpace.previewPanel.pdfExcerptToNote')"
      @close="pickerOpen = false"
    >
      <PdfExcerptNotePicker drawer :new-note-title="newNoteTitle" :busy="sending" @select="choose" @close="pickerOpen = false" />
    </BDrawer>
  </div>
</template>

<script setup lang="ts">
  import { computed, defineAsyncComponent, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { closeCurrentMobileOverlayThen } from '@/utils/mobileOverlayHistory';
  import {
    pdfExcerptNoteTitle,
    type PdfExcerpt,
    type PdfExcerptFile,
    type PdfExcerptNoteTarget,
  } from '@/utils/pdfExcerpt';

  // 选笔记与新建笔记只在「摘录到笔记」时才用到，按需加载，不拖慢每次打开 PDF。
  const PdfExcerptNotePicker = defineAsyncComponent(() => import('./PdfExcerptNotePicker.vue'));

  const props = defineProps<{
    mode: 'copy' | 'insert' | 'pick';
    status: 'idle' | 'copied' | 'inserted';
    mobile: boolean;
    excerpt: PdfExcerpt;
    file?: PdfExcerptFile;
    /** 插入进行中，主按钮不可重复点击。 */
    busy?: boolean;
  }>();

  const emit = defineEmits<{
    copy: [];
    insert: [];
    undo: [];
    /** 选笔记浮层打开或正在跳转期间，搜索框会拿走焦点和选区，预览需要保留这次摘录。 */
    'hold-change': [hold: boolean];
  }>();

  const { t } = useI18n();
  const router = useRouter();
  const pickerOpen = ref(false);
  const sending = ref(false);
  const newNoteTitle = computed(() =>
    pdfExcerptNoteTitle(props.file?.fileName || '', t('cloudSpace.previewPanel.pdfExcerptNoteSuffix')),
  );

  // 全屏预览自己有层级，浮层挂进预览容器，才能盖在 PDF 页面之上；不能挂进摘录条，否则按下会被阻止、搜索框点不进去。
  function popupContainer(trigger: HTMLElement) {
    return trigger.closest<HTMLElement>('.fullscreen-preview') || document.body;
  }

  watch(
    () => pickerOpen.value || sending.value,
    (hold) => emit('hold-change', hold),
  );

  async function send(target: PdfExcerptNoteTarget) {
    if (!props.file || sending.value) return;
    sending.value = true;
    try {
      const { sendPdfExcerptToNote } = await import('@/utils/pdfExcerptToNote');
      await sendPdfExcerptToNote({ router, t, isMobile: props.mobile }, props.excerpt, props.file, target);
    } finally {
      sending.value = false;
    }
  }

  async function choose(target: PdfExcerptNoteTarget) {
    if (!props.mobile) {
      pickerOpen.value = false;
      await send(target);
      return;
    }
    // 抽屉占着一条 history，等它出栈后再跳转，避免返回时又落回抽屉占位。
    await closeCurrentMobileOverlayThen(
      () => {
        pickerOpen.value = false;
      },
      () => send(target),
    );
  }
</script>

<style scoped lang="less">
  .pdf-excerpt-bar {
    position: absolute;
    z-index: 6;
    display: inline-flex;
    align-items: center;
    gap: var(--ui-space-2, 2px);
    padding: var(--ui-space-4, 4px);
    border: 1px solid var(--card-border-color);
    border-radius: 10px;
    background: var(--menu-body-bg-color, var(--background-color));
    color: var(--text-color);
    white-space: nowrap;
    box-shadow:
      0 6px 16px rgb(0 0 0 / 10%),
      0 2px 6px -2px rgb(0 0 0 / 12%);
    user-select: none;
  }

  [data-theme='night'] .pdf-excerpt-bar {
    border-color: color-mix(in srgb, var(--text-color) 16%, var(--surface-border-color));
    box-shadow:
      0 10px 24px rgb(0 0 0 / 50%),
      0 2px 8px rgb(0 0 0 / 40%);
  }

  :deep(.pdf-excerpt-bar__action.b_btn) {
    gap: var(--ui-space-6, 6px);
    height: var(--ui-control-32, 32px);
    padding: 0 var(--ui-space-10, 10px);
    border: 0;
    background: transparent;
    color: var(--text-color);
    font-size: var(--ui-font-13, 13px);
  }

  :deep(.pdf-excerpt-bar__action.b_btn .svg-icon),
  :deep(.pdf-excerpt-bar__action.b_btn svg) {
    color: var(--desc-color);
  }

  :deep(.pdf-excerpt-bar__action.b_btn:hover),
  :deep(.pdf-excerpt-bar__action.b_btn:focus-visible) {
    background: var(--hover-background);
  }

  :deep(.pdf-excerpt-bar__action.is-primary.b_btn),
  :deep(.pdf-excerpt-bar__action.is-primary.b_btn svg) {
    color: var(--primary-color);
    font-weight: 600;
  }

  .pdf-excerpt-bar__divider {
    /* ui-density-fixed: 分隔线粗细，按边框处理不随密度变化 */
    width: 1px;
    height: var(--ui-space-18, 18px);
    margin: 0 var(--ui-space-2, 2px);
    background: var(--card-border-color);
  }

  .pdf-excerpt-bar__done {
    display: inline-flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    min-height: var(--ui-control-32, 32px);
    padding: 0 var(--ui-space-4, 4px) 0 var(--ui-space-8, 8px);
    font-size: var(--ui-font-13, 13px);
  }

  .pdf-excerpt-bar__done-icon {
    color: var(--success-color);
  }

  :deep(.pdf-excerpt-bar__undo.b_btn) {
    height: var(--ui-control-28, 28px);
    padding: 0 var(--ui-space-8, 8px);
    border: 0;
    background: transparent;
    color: var(--primary-color);
    font-size: var(--ui-font-13, 13px);
  }

  :deep(.pdf-excerpt-bar__undo.b_btn:hover) {
    background: var(--hover-background);
  }

  // 手机：固定在预览底部，避开系统自带的选字菜单；按底部操作栏规范使用 44px 高度。
  .pdf-excerpt-bar.is-mobile {
    right: 0;
    bottom: 0;
    left: 0;
    display: flex;
    /* ui-density-fixed: 手机底部操作栏，手机固定标准密度 */
    gap: 10px;
    /* ui-density-fixed: 手机底部操作栏，留出系统手势区 */
    padding: 10px 12px calc(10px + env(safe-area-inset-bottom, 0px));
    border-width: 1px 0 0;
    border-radius: 0;
    box-shadow: none;
  }

  .pdf-excerpt-bar.is-mobile.is-done {
    justify-content: center;
  }

  .is-mobile :deep(.pdf-excerpt-bar__action.b_btn) {
    flex: 1;
    /* ui-density-fixed: 手机底部操作栏固定 44px，手机不随桌面密度变化 */
    height: 44px;
    border: 1px solid var(--card-border-color);
    border-radius: 10px;
    /* ui-density-fixed: 手机底部主操作按钮文字，手机固定标准密度 */
    font-size: 15px;
  }

  .is-mobile :deep(.pdf-excerpt-bar__action.is-primary.b_btn) {
    border-color: var(--primary-color);
    background: var(--primary-color);
    color: #fff;
  }

  .is-mobile :deep(.pdf-excerpt-bar__action.is-primary.b_btn svg) {
    color: #fff;
  }

  .is-mobile .pdf-excerpt-bar__done {
    /* ui-density-fixed: 与手机底部操作栏同高，切换成功提示时不跳动 */
    min-height: 44px;
    /* ui-density-fixed: 与手机底部操作按钮文字一致 */
    font-size: 15px;
  }
</style>
