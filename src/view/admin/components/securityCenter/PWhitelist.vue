<template>
  <CommonContainer title="白名单" @backClick="router.push('/securityCenterMobile')">
    <Whitelist />
  </CommonContainer>
</template>

<script lang="ts" setup>
  import { useRouter } from 'vue-router';
  import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
  import Whitelist from './Whitelist.vue';

  const router = useRouter();
</script>
