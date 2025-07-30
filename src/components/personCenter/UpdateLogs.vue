<template>
  <CommonContainer title="更新日志">
    <div
      style="color: white !important; height: 100%; overflow-y: auto"
      :style="{ padding: bookmark.isMobile ? '20px' : '20px 100px' }"
    >
      <a-timeline>
        <a-timeline-item color="#615ced" v-for="item in [...updateOptions].reverse()"
          >{{ item.label }}
          <span style="font-size: 14px; color: #a0a0a0">{{ item.time }}</span>
          <div style="margin-bottom: -10px">
            <p v-for="(li, index) in item.list" style="font-size: 12px"> {{ index + 1 }}、{{ li }} </p>
          </div>
        </a-timeline-item>
      </a-timeline>
    </div>
  </CommonContainer>
</template>
<script lang="ts" setup>
  import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
  import { bookmarkStore } from '@/store';
  import { updateOptions } from '@/config/updateLog.ts';
  const bookmark = bookmarkStore();
</script>

<style lang="less" scoped>
  :deep(.ant-timeline .ant-timeline-item-tail) {
    background-color: var(--timeline-line-bg-color);
  }
  ::-webkit-scrollbar {
    width: 10px;
  }
</style>
