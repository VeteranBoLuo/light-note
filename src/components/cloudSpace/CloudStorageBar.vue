<template>
  <div class="storage-usage">
    <div>{{ $t('cloudSpace.hasUsedSpace') }}: {{ cloud.usedSpace }}MB / {{ cloud.maxSpace }}MB</div>
    <progress :value="cloud.usedSpace" :max="cloud.maxSpace" :class="progressClass"></progress>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { cloudSpaceStore } from '@/store';

  const cloud = cloudSpaceStore();

  const usageRatio = computed(() => {
    const max = Number(cloud.maxSpace) || 0;
    const used = Number(cloud.usedSpace) || 0;
    if (max <= 0) return 0;
    return Math.min(1, Math.max(0, used / max));
  });

  const progressClass = computed(() => {
    if (usageRatio.value >= 0.95) return 'progress-red';
    if (usageRatio.value >= 0.75) return 'progress-yellow';
    return 'progress-green';
  });
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

    progress.progress-green::-webkit-progress-value {
      background-color: #42b883; /* 充足：绿色 */
    }
    progress.progress-yellow::-webkit-progress-value {
      background-color: #f2b84b; /* 不多：黄色 */
    }
    progress.progress-red::-webkit-progress-value {
      background-color: #ef4444; /* 紧张：红色 */
    }

    /* Firefox */
    progress.progress-green::-moz-progress-bar {
      background-color: #42b883; /* 充足：绿色 */
    }
    progress.progress-yellow::-moz-progress-bar {
      background-color: #f2b84b; /* 不多：黄色 */
    }
    progress.progress-red::-moz-progress-bar {
      background-color: #ef4444; /* 紧张：红色 */
    }

    /* 兜底样式 - 标准语法 */
    progress.progress-green[value] {
      color: #42b883;
      background-color: #f5f5f5;
    }
    progress.progress-yellow[value] {
      color: #f2b84b;
      background-color: #f5f5f5;
    }
    progress.progress-red[value] {
      color: #ef4444;
      background-color: #f5f5f5;
    }
  }
</style>
