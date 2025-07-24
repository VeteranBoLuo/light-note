<template>
  <div class="flex-align-center-gap">
    <div class="flex-align-center icon-container" title="笔记" @click="$router.push('/noteLibrary')">
      <svg-icon size="40" :src="icon.workbenches.note" color="black" />
    </div>
    <div style="font-size: 12px">
      <b>笔记</b>
      <div
        >总计<b>{{ user.noteTotal }}</b
        >篇</div
      >
      <div>最近更新 {{ bookmark.noteList?.[0]?.updateTime ?? '无' }}</div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { bookmarkStore, useUserStore } from '@/store';
  import icon from '@/config/icon.ts';
  const user = useUserStore();
  const bookmark = bookmarkStore();
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
