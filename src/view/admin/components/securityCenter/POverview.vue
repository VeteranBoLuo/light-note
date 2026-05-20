<template>
  <CommonContainer title="威胁总览" @backClick="router.push('/securityCenterMobile')">
    <SecurityOverviewPanel mobile />
  </CommonContainer>
</template>

<script lang="ts" setup>
  import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
  import router from '@/router';
  import SecurityOverviewPanel from './SecurityOverviewPanel.vue';
</script>
