<template>
  <div class="flex-align-center-gap">
    <div
      class="flex-align-center icon-container"
      title="标签"
      @click="$router.push('/manage/tagMg')"
      v-click-log="OPERATION_LOG_MAP.workbenches.tag"
    >
      <svg-icon size="40" :src="icon.workbenches.tag" color="black" />
    </div>
    <div style="font-size: 12px">
      <b>标签</b>
      <div
        >总计<b>{{ user.tagTotal }}</b
        >个</div
      >
      <div style="min-width: 170px">最近更新 {{ bookmark.tagList?.[0]?.createTime ?? '无' }}</div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { bookmarkStore, useUserStore } from '@/store';
  import icon from '@/config/icon.ts';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  const user = useUserStore();
  const bookmark = bookmarkStore();
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