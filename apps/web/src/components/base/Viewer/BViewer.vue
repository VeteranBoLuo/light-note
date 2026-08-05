<template>
  <img id="viewImage" style="display: none" alt="Picture" :src="viewSrc" />
</template>

<script setup lang="ts">
  import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
  import { bookmarkStore } from '@/store';
  import Viewer from 'viewerjs';
  import 'viewerjs/dist/viewer.css';
  import {
    registerMobileOverlayHistory,
    releaseMobileOverlayHistory,
    type MobileOverlayHistoryHandle,
  } from '@/utils/mobileOverlayHistory';
  const bookmark = bookmarkStore();
  const viewSrc = ref();
  let currentViewer: Viewer | null = null;
  let historyHandle: MobileOverlayHistoryHandle | null = null;

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
    });
  }

  onBeforeUnmount(() => {
    if (historyHandle) releaseMobileOverlayHistory(historyHandle);
    historyHandle = null;
    currentViewer?.destroy();
    currentViewer = null;
  });
</script>

<style>
  /* .viewer-container img {
    min-width: 100px !important;
    min-height: 100px !important;
  }*/
</style>
