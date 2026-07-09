<template>
  <CommonContainer
    title="后台管理"
    :style="{ backgroundColor: user.currentTheme === 'day' ? '#f6f7f9' : '#222222' }"
    @backClick="router.push('/personCenter')"
  >
    <PhoneMenu :menu-list="menuList" label="title" @click="clickItem" />
  </CommonContainer>
</template>

<script lang="ts" setup>
  import icon from '@/config/icon.ts';
  import { bookmarkStore, useUserStore } from '@/store';
  import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
  import PhoneMenu from '@/components/base/phoneComponents/PhoneMenu/PhoneMenu.vue';
  import router from '@/router';
  const bookmark = bookmarkStore();
  const user = useUserStore();
  const menuList = [
    [
      {
        id: 'overview',
        title: '总览',
        icon: icon.userCenter.log,
        url: '/overview',
      },
      {
        id: 'operationLog',
        title: '操作日志',
        icon: icon.userCenter.operationLog,
        url: '/operationLog',
      },
      {
        id: 'apiLog',
        title: 'api日志',
        icon: icon.userCenter.log,
        url: '/apiLog',
      },
      {
        id: 'userMg',
        title: '用户管理',
        icon: icon.navigation.user,
        url: '/userMg',
      },
      {
        id: 'userOpinion',
        title: '用户反馈',
        icon: icon.userCenter.operationLog,
        url: '/userOpinion',
      },
      {
        id: 'imageMg',
        title: '图片管理',
        icon: icon.userCenter.imgMg,
        url: '/imageMg',
      },
      {
        id: 'agentLog',
        title: 'AI 监控',
        icon: icon.userCenter.log,
        url: '/agentLog',
      },
      {
        id: 'conversion',
        title: '转化漏斗',
        icon: icon.userCenter.log,
        url: '/conversion',
      },
      {
        id: 'logCleanup',
        title: '日志清理',
        icon: icon.userCenter.sql,
        url: '/logCleanup',
      },
    ],
    [
      {
        id: 'securityCenter',
        title: '安全中心',
        icon: icon.user_admin,
        url: '/securityCenterMobile',
      },
    ],
  ];
  function clickItem(item) {
    router.push(item.url);
  }
</script>

<style lang="less" scoped></style>
