<template>
  <img id="viewImage" style="display: none" alt="Picture" :src="viewSrc" />
  <!--
    保存按钮。Android WebView 默认不提供「长按图片 → 保存」菜单(那要原生 setOnLongClickListener
    + HitTestResult 才有)，所以 App 里长按任何图片都没反应；这里给一个明确的按钮代替长按手势，
    顺带让桌面和移动浏览器也能一键存图。
    viewer.js 的容器是它自己建的，按钮只能盖在上层；Teleport 到 body 以免被祖先的
    transform/overflow 裁掉。
  -->
  <Teleport to="body">
    <BButton
      v-if="saveVisible"
      class="viewer-save-btn"
      :class="{ 'has-viewer-toolbar': viewerToolbarVisible }"
      :loading="saving"
      @click="saveImage"
    >
      <SvgIcon v-if="!saving" :src="icon.cloudSpace.download" size="16" aria-hidden="true" />
      <span>{{ t('common.saveImage') }}</span>
    </BButton>
  </Teleport>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { bookmarkStore } from '@/store';
  import Viewer from 'viewerjs';
  import 'viewerjs/dist/viewer.css';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { isLightNoteAndroidApp, postAndroidMessage, saveImageViaAndroid } from '@/utils/androidBridge.ts';
  import { canSaveImage, deriveImageFileName, isBase64ImageSrc, isHttpImageSrc } from './viewerSave';
  import { announceNativeDownloadStart } from '@/composables/useAndroidDownloadProgress';
  import {
    registerMobileOverlayHistory,
    releaseMobileOverlayHistory,
    type MobileOverlayHistoryHandle,
  } from '@/utils/mobileOverlayHistory';
  const bookmark = bookmarkStore();
  const { t } = useI18n();
  const viewSrc = ref();
  /** 预览是否正在显示:按钮只在看图时出现,不能在 viewer 关掉后留在屏幕上 */
  const viewerVisible = ref(false);
  const viewerToolbarVisible = ref(false);
  let currentViewer: Viewer | null = null;
  let historyHandle: MobileOverlayHistoryHandle | null = null;

  // 判定与命名规则见 viewerSave.ts(纯函数,已被单测覆盖)
  const saveVisible = computed(() => viewerVisible.value && canSaveImage(viewSrc.value, isLightNoteAndroidApp()));

  const saving = ref(false);

  async function saveImage() {
    const src = viewSrc.value;
    if (!src || saving.value) return;
    const fileName = deriveImageFileName(src);
    const inApp = isLightNoteAndroidApp();

    // http 图交给系统下载:进度条负责过程,落盘后由进度模块统一报「已保存到…」,
    // 这里只在等不到进度事件(旧版不回传)时才补一句「已开始下载」。
    if (inApp && isHttpImageSrc(src) && postAndroidMessage({ type: 'download', url: src, fileName })) {
      announceNativeDownloadStart();
      return;
    }

    // base64 图(头像就是这种)只能让原生解码后写进相册
    if (inApp && isBase64ImageSrc(src)) {
      saving.value = true;
      try {
        const result = await saveImageViaAndroid(src, fileName);
        if (result.ok) {
          message.success(t('common.imageSavedToGallery'));
        } else if (result.reason === 'unsupported') {
          // 旧版 App 没有这个通道(等不到回复),或系统低于 Android 10 无法免权限写入
          message.warning(t('common.saveImageUnsupportedInApp'));
        } else {
          message.error(t('common.saveImageFailed'));
        }
      } finally {
        saving.value = false;
      }
      return;
    }

    try {
      const anchor = document.createElement('a');
      anchor.href = src;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (error) {
      console.error('保存图片失败:', error);
      message.error(t('common.saveImageFailed'));
    }
  }

  watch(
    () => bookmark.viewerKey,
    () => {
      newView();
    },
    { immediate: true },
  );

  function newView() {
    if (historyHandle) releaseMobileOverlayHistory(historyHandle);
    historyHandle = null;
    currentViewer?.destroy();
    currentViewer = null;
    viewSrc.value = `${bookmark.viewer.src}`;
    nextTick(() => {
      const options: Record<string, any> = bookmark.viewer.options || {};
      viewerToolbarVisible.value = Boolean(options.toolbar);
      const viewer = new Viewer(document.getElementById('viewImage'), {
        inline: false,
        navbar: false,
        toolbar: false,
        ...options,
        // 统一落在全站“覆盖层”层级，BMessage / BAlert 等全局反馈仍可正常显示在预览之上。
        zIndex: 900,
        hidden() {
          if (historyHandle) releaseMobileOverlayHistory(historyHandle);
          historyHandle = null;
          viewerVisible.value = false;
          viewerToolbarVisible.value = false;
          viewer.destroy();
          if (currentViewer === viewer) currentViewer = null;
          viewSrc.value = '';
        },
        viewed(e) {
          // 默认把图压到 200px:头像、反馈截图这类小图放到原尺寸反而糊。
          // 调用方传了自己的 viewed 就以它为准(思维导图要铺满视口才看得清)。
          if (typeof options.viewed === 'function') {
            options.viewed(e);
            return;
          }
          e.detail.image.style.maxWidth = '200px';
          e.detail.image.style.maxHeight = '200px';
        },
      });
      currentViewer = viewer;
      if (bookmark.isMobile) {
        historyHandle = registerMobileOverlayHistory(() => {
          historyHandle = null;
          viewer.hide();
        });
      }
      viewer.show();
      viewerVisible.value = true;
    });
  }

  onBeforeUnmount(() => {
    if (historyHandle) releaseMobileOverlayHistory(historyHandle);
    historyHandle = null;
    viewerVisible.value = false;
    viewerToolbarVisible.value = false;
    currentViewer?.destroy();
    currentViewer = null;
  });
</script>

<style scoped lang="less">
  /*
   * 放底部居中而不是右上角:viewer.js 自带的关闭按钮就在右上角,别抢它的位置;
   * 底部也更靠近拇指。viewer.js 容器统一收敛到 900，这里只高一层。
   * 遮罩恒为深色、不跟随主题,所以这里固定用浅底深字 —— 不接主题变量,
   * 也不用 color-mix,APK 里不会因为混色回退而变得看不见。
   */
  .viewer-save-btn {
    position: fixed;
    left: 50%;
    /* 让开底部导航:viewer 的遮罩是半透明的,导航仍然看得见,按钮压在「AI」上会显得很挤。
       用和进度浮层同一个变量对齐,没有底部导航的页面自动退回安全区。 */
    bottom: calc(var(--mobile-shell-bottom-height, env(safe-area-inset-bottom, 0px)) + 22px);
    transform: translateX(-50%);
    z-index: 901;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    /* 显式压住行高:BButton 自带的行高会把胶囊撑到 48px 上下,比这里需要的高一截。
       看图才是主任务,按钮只要「找得到」,不该在小屏上糊掉一大块。 */
    height: auto;
    min-height: 34px;
    padding: 6px 13px;
    line-height: 1.2;
    /* 深色半透明 + 白字:和 viewer 的深色遮罩同一族,不像原来的白色实心块那样抢眼。
       用 rgba 而不是 color-mix —— APK 的 WebView 会把混色回退掉,而这里的对比度
       是按钮能不能被看见的唯一依据,不能依赖混色。 */
    border: 1px solid rgba(255, 255, 255, 0.22);
    border-radius: 999px;
    background: rgba(28, 28, 32, 0.72);
    color: #fff;
    font-size: 13px;
    font-weight: 500;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(6px);
  }
  .viewer-save-btn:hover {
    background: rgba(40, 40, 46, 0.82);
    color: #fff;
  }
  .viewer-save-btn:active {
    background: rgba(52, 52, 58, 0.88);
  }

  /* viewer.js 自带工具栏固定在视口底部。开启缩放/旋转工具栏时，保存按钮统一
     上移到工具栏之上，避免桌面端与移动端都出现按钮互相遮挡。 */
  .viewer-save-btn.has-viewer-toolbar {
    bottom: calc(64px + env(safe-area-inset-bottom, 0px));
  }
</style>

<style>
  /* .viewer-container img {
    min-width: 100px !important;
    min-height: 100px !important;
  }*/
</style>
