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
  import { useUserStore } from '@/store';
  import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
  import PhoneMenu from '@/components/base/phoneComponents/PhoneMenu/PhoneMenu.vue';
  import router from '@/router';
  import { useI18n } from 'vue-i18n';
  import { buildAdminMobileMenu, type AdminMobileMenuItem } from '@/view/admin/admin/adminNav.ts';

  const { t } = useI18n();
  const user = useUserStore();

  /**
   * 菜单与桌面共用 adminNav.ts 的定义。此前两端各写一份，手机端因此少了 4 个模块，
   * 标题也没跟上（「api日志」）。图标在 PhoneMenu 里不渲染，所以这里不传。
   */
  const menuList = buildAdminMobileMenu({
    icons: {
      overview: icon.userCenter.workbenches,
      action: icon.ai.pending,
      user: icon.navigation.user,
      ai: icon.ai.ask,
      growth: icon.userCenter.growth,
      log: icon.userCenter.log,
      security: icon.navigation.permissions,
      tool: icon.userCenter.sql,
    },
    pendingOpinion: 0,
    pendingSecurity: 0,
    pendingCommunity: 0,
    pendingModeration: 0,
    actionCenterTitle: t('adminActionCenter.title'),
    adminAuditTitle: t('adminAudit.title'),
    productInsightsTitle: t('adminProductInsights.title'),
    adminGovernanceTitle: t('adminGovernance.title'),
    aiEvaluationTitle: t('aiEvaluationAdmin.title'),
    communityAccessTitle: t('communityChatAdmin.navTitle'),
    communityModerationTitle: t('communityChatModerationAdmin.navTitle'),
  });

  function clickItem(item: AdminMobileMenuItem) {
    router.push(item.url);
  }
</script>

<style lang="less" scoped></style>
