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
      const viewer = new Viewer(document.getElementById('viewImage'), {
        inline: false,
        navbar: false,
        toolbar: false,
        ...bookmark.viewer.options,
        hidden() {
          if (historyHandle) releaseMobileOverlayHistory(historyHandle);
          historyHandle = null;
          viewer.destroy();
          if (currentViewer === viewer) currentViewer = null;
          viewSrc.value = '';
        },
        viewed(e) {
          // 在图片被查看时设置样式
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
