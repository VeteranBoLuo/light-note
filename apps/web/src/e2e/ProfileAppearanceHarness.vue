<template>
  <main class="appearance-harness">
    <div v-if="!mobile" class="appearance-harness__heading"
      ><strong>资料编辑 · 个人装扮验收</strong><span>真实组件 + 内存数据，不连接后端、不扣真实积分</span
      ><BButton v-if="!mobile" @click="visible = true">打开编辑资料</BButton></div
    >
    <MyInfoMobile v-if="mobile" />
    <MyInfo v-else v-model:visible="visible" />
  </main>
</template>

<script setup lang="ts">
  import { ref } from 'vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import MyInfo from '@/components/personCenter/myInfo/MyInfo.vue';
  import MyInfoMobile from '@/components/personCenter/myInfo/MyInfoMobile.vue';
  import { useMobileLayout } from '@/composables/useMobileLayout';
  const mobile = useMobileLayout();
  const visible = ref(true);
</script>

<style lang="less">
  html,
  body,
  #app {
    margin: 0;
    min-height: 100%;
  }
  body {
    font-family: var(--app-font-family);
    background: var(--background-color);
    color: var(--text-color);
  }
</style>

<style scoped lang="less">
  .appearance-harness__heading {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ui-space-12, 12px) var(--ui-space-20, 20px);
    padding: var(--ui-space-20, 20px) var(--ui-space-24, 24px);
    font-size: var(--ui-font-13, 13px);
  }
  .appearance-harness__heading span {
    color: var(--desc-color);
  }
</style>
