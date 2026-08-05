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
    <BButton v-if="saveVisible" class="viewer-save-btn" @click="saveImage">
      <SvgIcon :src="icon.cloudSpace.download" size="16" aria-hidden="true" />
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
  import { isLightNoteAndroidApp, postAndroidMessage } from '@/utils/androidBridge.ts';
  import { canSaveImage, deriveImageFileName, isHttpImageSrc } from './viewerSave';
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
  let currentViewer: Viewer | null = null;
  let historyHandle: MobileOverlayHistoryHandle | null = null;

  // 判定与命名规则见 viewerSave.ts(纯函数,已被单测覆盖)
  const saveVisible = computed(() => viewerVisible.value && canSaveImage(viewSrc.value, isLightNoteAndroidApp()));

  function saveImage() {
    const src = viewSrc.value;
    if (!src) return;
    const fileName = deriveImageFileName(src);
    // App 内交给原生:能落到系统下载目录,而且原生侧自带「开始/完成」提示,这里不再重复弹消息
    if (isHttpImageSrc(src) && postAndroidMessage({ type: 'download', url: src, fileName })) {
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
  );

  function newView() {
    if (historyHandle) releaseMobileOverlayHistory(historyHandle);
    historyHandle = null;
    currentViewer?.destroy();
    currentViewer = null;
    viewSrc.value = `${bookmark.viewer.src}`;
    nextTick(() => {
      const options: Record<string, any> = bookmark.viewer.options || {};
      const viewer = new Viewer(document.getElementById('viewImage'), {
        inline: false,
        navbar: false,
        toolbar: false,
        ...options,
        hidden() {
          if (historyHandle) releaseMobileOverlayHistory(historyHandle);
          historyHandle = null;
          viewerVisible.value = false;
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
    currentViewer?.destroy();
    currentViewer = null;
  });
</script>

<style scoped lang="less">
  /*
   * 放底部居中而不是右上角:viewer.js 自带的关闭按钮就在右上角,别抢它的位置;
   * 底部也更靠近拇指。z-index 要压过 viewer.js 容器的 2015。
   * 遮罩恒为深色、不跟随主题,所以这里固定用浅底深字 —— 不接主题变量,
   * 也不用 color-mix,APK 里不会因为混色回退而变得看不见。
   */
  .viewer-save-btn {
    position: fixed;
    left: 50%;
    bottom: calc(28px + env(safe-area-inset-bottom, 0px));
    transform: translateX(-50%);
    z-index: 2020;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: auto;
    min-height: 44px;
    padding: 10px 20px;
    border: 1px solid rgba(255, 255, 255, 0.28);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.94);
    color: #1b1d29;
    font-size: 14px;
    font-weight: 600;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.34);
  }
  .viewer-save-btn:hover {
    background: #fff;
    color: #1b1d29;
  }
  .viewer-save-btn:active {
    background: rgba(240, 240, 245, 0.96);
  }
</style>

<style>
  /* .viewer-container img {
    min-width: 100px !important;
    min-height: 100px !important;
  }*/
</style>
