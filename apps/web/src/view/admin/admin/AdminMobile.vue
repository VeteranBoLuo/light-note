<template>
  <CommonContainer :title="t('adminMobile.title')" @backClick="router.push('/personCenter')">
    <main class="admin-mobile-page">
      <section class="admin-mobile-hero" :aria-label="t('adminMobile.workbench')">
        <span class="admin-mobile-hero__icon"><SvgIcon :src="icon.userCenter.workbenches" size="26" /></span>
        <div class="admin-mobile-hero__copy">
          <strong>{{ t('adminMobile.workbench') }}</strong>
          <span>{{ t('adminMobile.subtitle') }}</span>
        </div>
        <BChip :tone="pendingTotal > 0 ? 'pending' : 'success'">
          {{ pendingTotal > 0 ? t('adminMobile.pendingCount', { count: pendingTotal }) : t('adminMobile.noPending') }}
        </BChip>
      </section>

      <section class="admin-mobile-section" :aria-labelledby="'admin-mobile-quick-title'">
        <h2 id="admin-mobile-quick-title">{{ t('adminMobile.quickAccess') }}</h2>
        <div class="admin-mobile-quick-grid">
          <BButton
            v-for="entry in quickEntries"
            :key="entry.item.id"
            class="admin-mobile-quick-entry"
            @click="clickItem(entry.item)"
          >
            <span class="admin-mobile-entry-icon"><SvgIcon :src="entry.icon" size="20" /></span>
            <span class="admin-mobile-entry-label">{{ entry.item.title }}</span>
            <span v-if="entry.item.badge" class="admin-mobile-badge">{{ displayBadge(entry.item.badge) }}</span>
          </BButton>
        </div>
      </section>

      <section
        v-for="group in sectionGroups"
        :key="group.key"
        class="admin-mobile-group"
        :aria-labelledby="`admin-mobile-${group.key}`"
      >
        <header class="admin-mobile-group__header">
          <span class="admin-mobile-group__icon"><SvgIcon :src="group.icon" size="18" /></span>
          <h2 :id="`admin-mobile-${group.key}`">{{ group.title }}</h2>
        </header>
        <div class="admin-mobile-group__items">
          <BButton
            v-for="item in group.items"
            :key="item.id"
            class="admin-mobile-group__entry"
            @click="clickItem(item)"
          >
            <span>{{ item.title }}</span>
            <span v-if="item.badge" class="admin-mobile-badge">{{ displayBadge(item.badge) }}</span>
            <SvgIcon class="admin-mobile-entry-arrow" :src="icon.arrow_right" size="17" />
          </BButton>
        </div>
      </section>
    </main>
  </CommonContainer>
</template>

<script lang="ts" setup>
  import { computed, onMounted, ref } from 'vue';
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
  import router from '@/router';
  import { useI18n } from 'vue-i18n';
  import { apiBasePost } from '@/http/request.ts';
  import { getCommunityChatAdminReports } from '@/api/communityChatApi.ts';
  import {
    buildAdminMobileMenu,
    type AdminMobileMenuGroup,
    type AdminMobileMenuItem,
  } from '@/view/admin/admin/adminNav.ts';

  const { t } = useI18n();
  const pendingOpinion = ref(0);
  const pendingSecurity = ref(0);
  const pendingModeration = ref(0);

  const menuGroups = computed(() =>
    buildAdminMobileMenu({
      icons: {
        overview: icon.userCenter.workbenches,
        action: icon.ai.pending,
        user: icon.navigation.user,
        ai: icon.ai.ask,
        growth: icon.userCenter.growth,
        log: icon.userCenter.log,
        security: icon.navigation.permissions,
        tool: icon.userCenter.sql,
        server: icon.infrastructure.server,
      },
      pendingOpinion: pendingOpinion.value,
      pendingSecurity: pendingSecurity.value,
      pendingModeration: pendingModeration.value,
      actionCenterTitle: t('adminActionCenter.title'),
      adminAuditTitle: t('adminAudit.title'),
      productInsightsTitle: t('adminProductInsights.title'),
      adminGovernanceTitle: t('adminGovernance.title'),
      communityModerationTitle: t('communityChatModerationAdmin.navTitle'),
      supportManagementTitle: t('adminSupport.title'),
    }),
  );

  const quickEntries = computed(() =>
    menuGroups.value
      .filter((group) => ['overview', 'action', 'security'].includes(group.key))
      .map((group) => ({ icon: group.icon, item: group.items[0] }))
      .filter((entry) => entry.item),
  );
  const sectionGroups = computed<AdminMobileMenuGroup[]>(() =>
    menuGroups.value.filter((group) => !['overview', 'action', 'security'].includes(group.key)),
  );
  const pendingTotal = computed(() => pendingOpinion.value + pendingSecurity.value + pendingModeration.value);

  function clickItem(item: AdminMobileMenuItem) {
    router.push(item.url);
  }

  function displayBadge(value = 0) {
    return value > 99 ? '99+' : String(value);
  }

  async function loadPending() {
    const [overviewResult, moderationResult] = await Promise.allSettled([
      apiBasePost('/api/common/getAdminOverview', { hideInternal: true }),
      getCommunityChatAdminReports({ status: 'pending', page: 1, pageSize: 1 }),
    ]);
    if (overviewResult.status === 'fulfilled') {
      const response: any = overviewResult.value;
      if (response?.status === 200) {
        pendingOpinion.value = Number(response.data?.pending?.opinion || 0);
        pendingSecurity.value = Number(response.data?.pending?.security || 0);
      }
    }
    if (moderationResult.status === 'fulfilled') {
      const response: any = moderationResult.value;
      if (response?.status === 200) pendingModeration.value = Number(response.data?.total || 0);
    }
  }

  onMounted(loadPending);
</script>

<style lang="less" scoped>
  :deep(.phone-container) {
    padding-inline: var(--mobile-page-gutter, 14px);
    background: var(--surface-page-bg);
  }

  :deep(.phone-navigation),
  :deep(.phone-body) {
    width: calc(100% - 28px);
  }

  :deep(.phone-body) {
    padding-top: 8px;
  }

  .admin-mobile-page {
    display: grid;
    gap: 16px;
    padding-bottom: 12px;
  }

  .admin-mobile-hero {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding: 15px;
    border: 1px solid var(--surface-border-color);
    border-radius: 18px;
    background: var(--surface-raised-background, var(--card-background));
    box-shadow: var(--surface-raised-shadow);
  }

  .admin-mobile-hero__icon,
  .admin-mobile-entry-icon,
  .admin-mobile-group__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--primary-color);
    background: var(--workspace-panel-bg-color);
    border: 1px solid var(--surface-border-color);
  }

  .admin-mobile-hero__icon {
    width: 46px;
    height: 46px;
    border-radius: 14px;
  }

  .admin-mobile-hero__copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .admin-mobile-hero__copy strong {
    color: var(--text-color);
    font-size: 16px;
    line-height: 1.35;
  }

  .admin-mobile-hero__copy span {
    overflow: hidden;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.45;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .admin-mobile-section {
    display: grid;
    gap: 9px;
  }

  .admin-mobile-section > h2,
  .admin-mobile-group__header h2 {
    margin: 0;
    color: var(--desc-color);
    font-size: 13px;
    font-weight: 600;
    line-height: 1.4;
  }

  .admin-mobile-section > h2 {
    padding-inline: 2px;
  }

  .admin-mobile-quick-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 9px;
  }

  .admin-mobile-quick-entry.b_btn {
    position: relative;
    width: 100%;
    min-width: 0;
    min-height: 82px;
    height: auto;
    padding: 11px 6px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border: 1px solid var(--surface-border-color);
    border-radius: 16px;
    color: var(--text-color);
    background: var(--card-background);
    box-shadow: var(--surface-card-shadow);
    white-space: normal;
  }

  .admin-mobile-entry-icon {
    width: 36px;
    height: 36px;
    border-radius: 12px;
  }

  .admin-mobile-entry-label {
    max-width: 100%;
    overflow: hidden;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .admin-mobile-group {
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 17px;
    background: var(--card-background);
    box-shadow: var(--surface-card-shadow);
  }

  .admin-mobile-group__header {
    min-height: 43px;
    padding: 0 14px;
    display: flex;
    align-items: center;
    gap: 9px;
    border-bottom: 1px solid var(--surface-divider-color);
    background: var(--workspace-panel-bg-color);
  }

  .admin-mobile-group__icon {
    width: 28px;
    height: 28px;
    border-radius: 9px;
    background: var(--card-background);
  }

  .admin-mobile-group__items {
    display: grid;
  }

  .admin-mobile-group__entry.b_btn {
    width: 100%;
    min-height: 52px;
    height: auto;
    padding: 10px 14px;
    display: flex;
    align-items: center;
    gap: 8px;
    border: 0;
    border-radius: 0;
    color: var(--text-color);
    background: var(--card-background);
    font-size: 14px;
    text-align: left;
  }

  .admin-mobile-group__entry.b_btn + .admin-mobile-group__entry.b_btn {
    border-top: 1px solid var(--surface-divider-color);
  }

  .admin-mobile-group__entry > span:first-child {
    min-width: 0;
    flex: 1;
  }

  .admin-mobile-entry-arrow {
    flex: 0 0 auto;
    color: var(--desc-color);
  }

  .admin-mobile-badge {
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #d0353d;
    border-radius: 999px;
    background: #d0353d;
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
  }

  .admin-mobile-quick-entry > .admin-mobile-badge {
    position: absolute;
    top: 8px;
    right: 8px;
  }

  @media (max-width: 359px) {
    .admin-mobile-hero {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .admin-mobile-hero > :deep(.b-chip) {
      grid-column: 2;
      justify-self: start;
    }
  }
</style>
