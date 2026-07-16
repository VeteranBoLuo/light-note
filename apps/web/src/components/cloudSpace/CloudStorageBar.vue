<template>
  <div class="storage-usage" :class="statusClass">
    <div class="storage-head">
      <div class="storage-title">{{ $t('cloudSpace.hasUsedSpace') }}</div>
      <div class="storage-meta">
        <span class="storage-value">{{ formattedUsed }} / {{ formattedMax }}</span>
        <span class="storage-percent">{{ usagePercent }}%</span>
      </div>
    </div>
    <div
      class="storage-bar"
      role="progressbar"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="Math.round(usagePercent)"
    >
      <div class="storage-bar-fill" :style="{ width: `${usagePercent}%` }"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { cloudSpaceStore } from '@/store';
  import { formatStorageSize } from '@/utils/common';

  const cloud = cloudSpaceStore();

  const usageRatio = computed(() => {
    const max = Number(cloud.maxSpace) || 0;
    const used = Number(cloud.usedSpace) || 0;
    if (max <= 0) return 0;
    return Math.min(1, Math.max(0, used / max));
  });

  const usagePercent = computed(() => Number((usageRatio.value * 100).toFixed(1)));

  const statusClass = computed(() => {
    if (usageRatio.value >= 0.95) return 'progress-red';
    if (usageRatio.value >= 0.75) return 'progress-yellow';
    return 'progress-normal';
  });

  const formattedUsed = computed(() => formatStorageSize(cloud.usedSpace));
  const formattedMax = computed(() => formatStorageSize(cloud.maxSpace));
</script>

<style lang="less" scoped>
  .storage-usage {
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-width: 250px;
    gap: 6px;
    font-size: 12px;
  }

  .storage-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }

  .storage-title {
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1;
    white-space: nowrap;
  }

  .storage-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .storage-value {
    color: var(--text-color);
    font-size: 12px;
    font-weight: 500;
    line-height: 1;
    white-space: nowrap;
  }

  .storage-percent {
    display: inline-block;
    min-width: 40px;
    text-align: right;
    font-size: 12px;
    font-weight: 600;
    line-height: 1;
    color: var(--resource-file-color, #ff8a00);
  }

  .storage-bar {
    position: relative;
    overflow: hidden;
    height: 4px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--card-border-color) 70%, transparent);
  }

  .storage-bar-fill {
    height: 100%;
    border-radius: 999px;
    background: var(--resource-file-color, #ff8a00);
    transition: width 0.3s ease;
  }

  .storage-usage.progress-yellow {
    .storage-percent {
      color: #d99a22;
    }

    .storage-bar-fill {
      background: linear-gradient(90deg, #de9d22 0%, #f0ba58 100%);
    }
  }

  .storage-usage.progress-red {
    .storage-percent {
      color: #e2525d;
    }

    .storage-bar-fill {
      background: linear-gradient(90deg, #e2525d 0%, #f5767f 100%);
    }
  }

  [data-theme='night'] .storage-usage {
    .storage-title {
      color: #aeb4c5;
    }

    .storage-value {
      color: #e6eaf7;
    }

    .storage-bar {
      background-color: rgba(179, 190, 218, 0.2);
    }
  }
</style>
