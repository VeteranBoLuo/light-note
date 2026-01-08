<template>
  <div class="storage-usage">
    <div>{{ $t('cloudSpace.hasUsedSpace') }}: {{ cloud.usedSpace }}MB / {{ cloud.maxSpace }}MB</div>
    <progress :value="cloud.usedSpace" :max="cloud.maxSpace"></progress>
  </div>
</template>

<script setup lang="ts">
  import { cloudSpaceStore } from '@/store';

  const cloud = cloudSpaceStore();
</script>

<style lang="less" scoped>
  .storage-usage {
    display: flex;
    flex-direction: column;
    justify-content: space-evenly;
    height: 32px;
    gap: 5px;
    font-size: 12px;
    progress {
      width: 100%; /* 设置宽度 */
      height: 3px; /* 设置高度（有些浏览器默认高度不足） */
    }

    /* WebKit 浏览器（Chrome、Safari） */
    progress::-webkit-progress-bar {
      background-color: #f5f5f5; /* 未填充部分的背景颜色 */
    }

    progress::-webkit-progress-value {
      background-color: #42b883; /* 填充部分的颜色（可以换成任意色） */
    }

    /* Firefox */
    progress::-moz-progress-bar {
      background-color: #42b883; /* 填充部分的颜色 */
    }

    /* 兜底样式 - 标准语法 */
    progress[value] {
      color: #42b883;
      background-color: #f5f5f5;
    }
  }
</style>
