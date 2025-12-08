<template>
  <div class="flex-align-center-gap">
    <div
      class="flex-align-center icon-container"
      title="书签"
      @click="$router.push('/manage/bookmarkMg')"
      v-click-log="OPERATION_LOG_MAP.workbenches.bookmark"
    >
      <svg-icon size="40" :src="icon.workbenches.bookmark" color="black" />
    </div>
    <div style="font-size: 12px">
      <b>书签</b>
      <div
        >总计<b>{{ user.bookmarkTotal }}</b
        >个</div
      >
      <div style="min-width: 170px">最近更新 {{ bookmark.bookmarkList?.[0]?.createTime ?? '无' }}</div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { bookmarkStore, useUserStore } from '@/store';
  import icon from '@/config/icon.ts';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';
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
