<template>
  <CommonContainer
    title="安全中心"
    :style="{ backgroundColor: user.currentTheme === 'day' ? '#f6f7f9' : '#222222' }"
    @backClick="router.push('/admin')"
  >
    <PhoneMenu :menu-list="menuList" label="title" @click="clickItem" />
  </CommonContainer>
</template>

<script lang="ts" setup>
import icon from '@/config/icon.ts';
import { useUserStore } from '@/store';
import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
import PhoneMenu from '@/components/base/phoneComponents/PhoneMenu/PhoneMenu.vue';
import router from '@/router';

const user = useUserStore();

const menuList = [
  [
    {
      id: 'securityOverview',
      title: '威胁总览',
      icon: icon.userCenter.operationLog,
      url: '/securityOverview',
    },
    {
      id: 'securityEvents',
      title: '攻击日志',
      icon: icon.userCenter.log,
      url: '/securityEvents',
    },
    {
      id: 'securityIps',
      title: 'IP画像',
      icon: icon.navigation.permissions,
      url: '/securityIps',
    },
    {
      id: 'securityAccountBans',
      title: '账号封禁',
      icon: icon.navigation.user,
      url: '/securityAccountBans',
    },
    {
      id: 'securityAccountReputation',
      title: '账号画像',
      icon: icon.userCenter.info,
      url: '/securityAccountReputation',
    },
    {
      id: 'securityRules',
      title: '规则库',
      icon: icon.tool.json,
      url: '/securityRules',
    },
  ],
];

function clickItem(item) {
  router.push(item.url);
}
</script>

<style lang="less" scoped></style>
