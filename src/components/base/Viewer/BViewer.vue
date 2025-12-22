<template>
  <img id="viewImage" style="display: none" alt="Picture" :src="viewSrc" />
</template>

<script setup lang="ts">
  import { nextTick, ref, watch } from 'vue';
  import { bookmarkStore } from '@/store';
  import Viewer from 'viewerjs';
  import 'viewerjs/dist/viewer.css';
  const bookmark = bookmarkStore();
  const viewSrc = ref();

  watch(
    () => bookmark.viewerKey,
    () => {
      newView();
    },
  );

  function newView() {
    viewSrc.value = `${bookmark.viewer.src}`;
    nextTick(() => {
      const viewer = new Viewer(document.getElementById('viewImage'), {
        inline: false,
        navbar: false,
        toolbar: false,
        ...bookmark.viewer.options,
        hidden() {
          viewer.destroy();
          viewSrc.value = '';
        },
        viewed(e) {
          // 在图片被查看时设置样式
          e.detail.image.style.maxWidth = '200px';
          e.detail.image.style.maxHeight = '200px';
        },
      });
      viewer.show();
    });
  }
</script>

<style>
  /* .viewer-container img {
    min-width: 100px !important;
    min-height: 100px !important;
  }*/
</style>
