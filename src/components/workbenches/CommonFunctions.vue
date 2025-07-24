<template>
  <div style="display: flex; justify-content: space-between;width: 100%">
    <div style="display: flex;flex-direction: row;gap: 15px">
      <div class="flex-align-center icon-container" title="新增标签" @click="$router.push('/manage/tagMg')">
        <svg-icon size="40" :src="icon.workbenches.tag" color="black" />
      </div>
      <b>新增标签</b>
    </div>
    <div style="display: flex;flex-direction: row;gap: 15px">
      <div class="flex-align-center icon-container" title="新增书签" @click="$router.push('/manage/tagMg')">
        <svg-icon size="40" :src="icon.workbenches.addBookmark" color="black" />
      </div>
      <b>新增书签</b>
    </div>
    <div style="display: flex;flex-direction: row;gap: 15px">
      <div class="flex-align-center icon-container" title="标签" @click="$router.push('/manage/tagMg')">
        <svg-icon size="40" :src="icon.workbenches.tag" color="black" />
      </div>
      <b>新增笔记</b>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import WorkbenchesCard from '@/components/workbenches/WorkbenchesCard.vue';
  import icon from '@/config/icon.ts';
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
