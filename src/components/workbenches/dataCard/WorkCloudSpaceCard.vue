<template>
  <div class="flex-align-center-gap">
    <div
      class="flex-align-center icon-container"
      title="云空间"
      @click="$router.push('/cloudSpace')"
      v-click-log="OPERATION_LOG_MAP.workbenches.cloud"
    >
      <svg-icon size="40" :src="icon.common.folder" color="black" />
    </div>
    <div style="font-size: 12px">
      <b>云空间</b>
      <div
        >已存储<b>{{ cloud.usedSpace }}</b
        >MB</div
      >
      <div style="min-width: 170px">最近更新 {{ cloud.fileList?.[0]?.uploadTime ?? '无' }}</div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { cloudSpaceStore } from '@/store';
  import icon from '@/config/icon.ts';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';
  const cloud = cloudSpaceStore();
</script>

<style lang="less" scoped>
  .icon-container {
    padding: 15px;
    background-color: white;
    box-shadow: inset 0 0 6px rgb(0 0 0 / 15%);
    border-radius: 12px;
    cursor: pointer;
  }
</style>
