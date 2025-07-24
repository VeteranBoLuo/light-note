<template>
  <div class="flex-align-center-gap">
    <div class="flex-align-center icon-container" title="云空间" @click="$router.push('/cloudSpace')">
      <svg-icon size="40" :src="icon.common.folder" color="black" />
    </div>
    <div style="font-size: 12px">
      <b>云空间</b>
      <div
        >已存储<b>{{ cloud.usedSpace }}</b
        >MB</div
      >
      <div>最近更新 {{ cloud.fileList?.[0]?.uploadTime ?? '无' }}</div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { cloudSpaceStore } from '@/store';
  import icon from '@/config/icon.ts';
  const cloud = cloudSpaceStore();
</script>

<style lang="less" scoped>
  .icon-container {
    padding: 15px;
    background-color: white;
    box-shadow:
      0 0 5px 0 rgba(0, 0, 0, 0.02),
      0 2px 10px 0 rgba(0, 0, 0, 0.06),
      0 0 1px 0 rgba(0, 0, 0, 0.3);
    border-radius: 12px;
    cursor: pointer;
  }
</style>
