<template>
  <div class="view-panel" id="view-panel">
    <TagInfo />
    <CardPanel />
  </div>
</template>

<script lang="ts" setup>
  import TagInfo from '@/components/home/TagInfo.vue';
  import CardPanel from '@/components/home/CardPanel.vue';
</script>

<style lang="less">
  .view-panel {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: auto;
  }
</style>
