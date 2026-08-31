<template>
  <BPopover
    trigger="hover"
    placement="bottom-right"
    overlay-class-name="user-center-popover"
    :get-popup-container="getPopupContainer"
    v-model:open="menuVisible"
  >
    <template #content>
      <div :key="popoverKey" class="user-card" :style="{ color: user.iconColor }">
        <div class="user-top">
          <div
            class="avatar-ring"
            :class="[
              user.currentTheme === 'day' ? 'ring-day' : 'ring-night',
              { 'avatar-ring--framed': equippedFrameId },
            ]"
          >
            <AvatarFramePreview
              v-if="equippedFrameId"
              :frame-id="equippedFrameId"
              :src="user.headPicture || icon.navigation.user"
              :size="40"
              :decorative="false"
              class="dom-hover"
              @click="zoomImage"
            />
            <svg-icon
              v-else
              img-id="viewUserImg"
              @click="zoomImage"
              size="40"
              :src="user.headPicture || icon.navigation.user"
              class="dom-hover"
            />
          </div>
          <div class="user-meta">
            <div class="user-name-row">
              <span class="user-name">{{
                user.userName ? user.alias || t('personCenter.defaultNickname') : t('personCenter.pleaseLogin')
              }}</span>
              <span
                v-if="growthInfo"
                class="lv-badge"
                :style="{ background: TIER_GRADIENTS[badgeTier] }"
                :title="growthInfo.name"
                role="button"
                @click="goGrowth"
                >Lv.{{ growthInfo.level }}</span
              >
              <svg-icon class="dom-hover" :src="icon.card_edit" size="16" @click="editUser" />
            </div>
            <div class="user-sub">
              {{ user.role === 'visitor' ? t('personCenter.loginRegister') : t('personCenter.personalProfile') }}
            </div>
          </div>
        </div>

        <div class="stat-grid">
          <div v-for="stat in userStats" :key="stat.label" class="stat-card">
            <div class="stat-icon">
              <svg-icon :src="stat.icon" size="14" />
            </div>
            <div class="stat-text">
              <div class="stat-label">{{ stat.label }}</div>
              <div class="stat-value" :title="String(stat.value)">{{ stat.value }}</div>
            </div>
          </div>
        </div>

        <div class="profile-asset-grid" :aria-label="t('personCenter.assetOverview')">
          <PointsBalanceSummary
            :points="growthInfo?.points"
            :loading="growthLoading"
            entry-source="桌面个人中心"
            @open-details="goPointsDetails"
          />
          <AiQuotaSummary
            layout="tile"
            :active="menuVisible"
            entry-source="桌面个人中心"
            @open-details="goAiQuotaDetails"
          />
        </div>

        <div class="settings-grid">
          <b-dropdown
            :trigger="['click']"
            placement="bottom"
            overlay-class-name="user-setting-dropdown"
            :menu-options="themeMenuOptions"
            :get-popup-container="getSettingPopupContainer"
          >
            <button class="setting-card">
              <span class="setting-left">
                <svg-icon size="14" :src="icon.theme" />
                {{ $t('personCenter.themeMode') }}
              </span>
              <span class="setting-right">{{ ThemeName }}</span>
            </button>
          </b-dropdown>
          <b-dropdown
            :trigger="['click']"
            placement="bottom"
            overlay-class-name="user-setting-dropdown"
            :menu-options="langMenuOptions"
            :get-popup-container="getSettingPopupContainer"
          >
            <button class="setting-card">
              <span class="setting-left">
                <svg-icon size="14" :src="icon.language" />
                {{ $t('personCenter.language') }}
              </span>
              <span class="setting-right">{{ LanguageName }}</span>
            </button>
          </b-dropdown>
        </div>

        <div class="menu-divider" />

        <div class="header_menu_ul">
          <BButton
            v-for="menuItem in desktopPrimaryMenuOptions"
            :key="menuItem.name"
            block
            class="menu-entry"
            :class="`menu-entry--${menuItem.tone}`"
            v-click-log="{ module: '个人中心', operation: t(menuItem.labelKey) }"
            @click="menuItemClick(menuItem)"
          >
            <span class="menu-entry__icon">
              <svg-icon size="16" :src="menuItem.icon" aria-hidden="true" />
            </span>
            <span class="menu-entry__label">{{ t(menuItem.labelKey) }}</span>
            <span v-if="menuItem.name === 'growth' && growthInfo?.hasUnreadLevelUp" class="update-point" />
          </BButton>

          <div class="menu-group-divider" aria-hidden="true" />

          <BButton
            v-for="menuItem in desktopSecondaryMenuOptions"
            :key="menuItem.name"
            block
            class="menu-entry"
            :class="`menu-entry--${menuItem.tone}`"
            v-click-log="{ module: '个人中心', operation: t(menuItem.labelKey) }"
            @click="menuItemClick(menuItem)"
          >
            <span class="menu-entry__icon">
              <svg-icon size="16" :src="menuItem.icon" aria-hidden="true" />
            </span>
            <span class="menu-entry__label">{{ t(menuItem.labelKey) }}</span>
          </BButton>
          <BButton
            block
            class="menu-entry menu-entry--danger"
            v-click-log="{
              module: '个人中心',
              operation: user.role === 'visitor' ? '登录/注册' : t('personCenter.logout'),
            }"
            @click="handleExitLogin"
          >
            <span class="menu-entry__icon">
              <svg-icon
                size="16"
                :src="user.role === 'visitor' ? icon.navigation.user : icon.userCenter.menu.logout"
                aria-hidden="true"
              />
            </span>
            <span class="menu-entry__label">
              {{ user.role === 'visitor' ? t('personCenter.loginRegister') : t('personCenter.logout') }}
            </span>
          </BButton>
        </div>
      </div>
    </template>
    <div class="navigation-icon" :class="{ 'has-frame': equippedFrameId }" style="margin-left: 5px; position: relative">
      <!-- 外层不裁剪提醒与头像框；普通头像由下方内层单独裁圆。 -->
      <AvatarFramePreview
        v-if="equippedFrameId"
        :frame-id="equippedFrameId"
        :src="user.headPicture || icon.navigation.user"
        :size="32"
        layout-mode="slot"
      />
      <span v-else class="navigation-avatar-clip">
        <svg-icon size="32" :src="user.headPicture || icon.navigation.user" class="dom-hover" />
      </span>
      <span v-if="growthInfo?.hasUnreadLevelUp" class="nav-avatar-dot"></span>
    </div>
  </BPopover>
  <my-info v-if="userVisible" v-model:visible="userVisible" />
</template>

<script setup lang="ts">
  import router from '@/router';
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import AvatarFramePreview from '@/components/growth/AvatarFramePreview.vue';
  import PointsBalanceSummary from '@/components/growth/PointsBalanceSummary.vue';
  import AiQuotaSummary from '@/components/aiSkills/AiQuotaSummary.vue';
  import { bookmarkStore, useUserStore } from '@/store';
  import { useGrowth } from '@/composables/useGrowth.ts';
  import { frameVariant } from '@/config/growthFrames';
  import { tierOf, TIER_GRADIENTS } from '@/config/growthTier';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import { formatStorageSize } from '@/utils/common';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import userApi from '@/api/userApi.ts';
  import { updatePreference } from '@/utils/savePreference';
  import BDropdown from '@/components/base/BasicComponents/BDropdown.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import {
    DESKTOP_PERSON_CENTER_PRIMARY_ENTRIES,
    DESKTOP_PERSON_CENTER_SECONDARY_ENTRIES,
    type PersonCenterEntry,
  } from '@/config/personCenterEntries';
  import { useI18n } from 'vue-i18n';

  const MyInfo = defineAsyncComponent(() => import('@/components/personCenter/myInfo/MyInfo.vue'));

  const { t } = useI18n();
  const bookmark = bookmarkStore();
  const getPopupContainer = (trigger: HTMLElement) => {
    return document.getElementById('tag-container');
  };
  const menuVisible = ref(false);
  const popoverKey = ref(0);
  const userVisible = ref(false);

  const user = useUserStore();

  // 成长徽章:登录用户在头像旁展示当前等级(纯展示,管理成长走「设置」菜单入口)
  const { growth: growthInfo, loading: growthLoading, load: loadGrowth } = useGrowth();
  const equippedFrameId = computed(() => {
    const id = growthInfo.value?.equippedFrame;
    return frameVariant(id) ? id : null;
  });
  const badgeTier = computed(() => tierOf(growthInfo.value?.level || 1));
  onMounted(() => {
    loadGrowth(); // 游客也拉取(后端返回 Lv.1),让游客也看到等级 → 点击去成长页是转化钩子
    window.addEventListener('light-note:open-profile', openProfileFromGrowth);
  });
  // 每次展开个人中心面板都强制拉最新成长:升级是后端异步发生的,确保徽章等级/红点及时刷新
  watch(
    () => menuVisible.value,
    (open) => {
      if (open) loadGrowth(true);
    },
  );

  // 个人中心的悬停开关统一交给 BPopover 管理。业务操作只负责关闭受控状态，
  // 避免卡片卸载后 mouseleave 不触发、旧悬停标记又把弹层重新打开。
  function dismissProfilePopover() {
    menuVisible.value = false;
  }

  function navigateFromProfile(path: string) {
    dismissProfilePopover();
    router.push(path);
  }

  function goGrowth() {
    navigateFromProfile('/growth');
  }

  function goAiQuotaDetails() {
    dismissProfilePopover();
    router.push('/ai-usage');
  }

  function goPointsDetails() {
    dismissProfilePopover();
    router.push('/points-usage');
  }

  function getSettingPopupContainer(trigger: HTMLElement) {
    return (trigger.closest('.user-card') as HTMLElement) || getPopupContainer(trigger);
  }

  watch(menuVisible, (val) => {
    if (val) {
      popoverKey.value++;
    }
  });

  const themeMenuOptions = computed(() => [
    { label: t('navigation.followSystem'), icon: icon.navigation.system, function: () => changeTheme('system') },
    { label: t('navigation.light'), icon: icon.navigation.sun, function: () => changeTheme('day') },
    { label: t('navigation.dark'), icon: icon.navigation.moon, function: () => changeTheme('night') },
  ]);
  const langMenuOptions = computed(() => [
    { label: '中文', function: () => changeLanguage('zh-CN') },
    { label: 'English', function: () => changeLanguage('en-US') },
  ]);

  const desktopPrimaryMenuOptions = DESKTOP_PERSON_CENTER_PRIMARY_ENTRIES;
  const desktopSecondaryMenuOptions = DESKTOP_PERSON_CENTER_SECONDARY_ENTRIES;

  const userStats = computed(() => [
    {
      label: t('navigation.bookmark'),
      value: user.bookmarkTotal,
      icon: icon.resource.bookmark,
    },
    {
      label: t('navigation.note'),
      value: user.noteTotal,
      icon: icon.resource.note,
    },
    {
      label: t('personCenter.storageUsed'),
      value: formatStorageSize(user.storageUsed),
      icon: icon.storage,
    },
  ]);

  function menuItemClick(menuItem: PersonCenterEntry) {
    navigateFromProfile(menuItem.path);
  }

  function handleExitLogin() {
    dismissProfilePopover();
    if (user.role === 'visitor') {
      bookmark.isShowLogin = true;
    } else {
      Alert.alert({
        title: '提示',
        content: '此操作将退出登录, 是否继续?',
        async onOk() {
          sessionStorage.setItem('manualLogout', '1');
          await userApi.logout();
          window.dispatchEvent(new CustomEvent('light-note:auth-expired'));
        },
      });
    }
  }

  const ThemeName = computed(() => {
    if (user.preferences.theme === 'night') {
      return t('navigation.dark');
    }
    if (user.preferences.theme === 'day') {
      return t('navigation.light');
    }
    return t('navigation.followSystem');
  });
  const LanguageName = computed(() => (user.preferences.lang === 'en-US' ? 'English' : '中文'));

  function changeTheme(theme: string) {
    // 统一走 updatePreference(本地生效 + 游客只本地 + 登录同步后端并失败回滚)
    updatePreference({ theme }).catch((err) => {
      console.error('后台错误：' + err);
    });
  }

  function changeLanguage(lang: 'zh-CN' | 'en-US') {
    // 统一走 updatePreference:语言即时切换(不刷新页面),与设置中心行为一致
    updatePreference({ lang }).catch((err) => {
      console.error('后台错误：' + err);
    });
  }

  function zoomImage() {
    bookmark.refreshViewer(user.headPicture || icon.navigation.user);
    dismissProfilePopover();
  }

  function editUser() {
    userVisible.value = true;
    dismissProfilePopover();
  }

  function openProfileFromGrowth() {
    userVisible.value = true;
    dismissProfilePopover();
  }

  onBeforeUnmount(() => {
    window.removeEventListener('light-note:open-profile', openProfileFromGrowth);
  });
</script>

<style lang="less" scoped>
  .navigation-icon {
    display: grid;
    grid-template: minmax(0, 1fr) / minmax(0, 1fr);
    place-items: center;
    width: 40px;
    min-width: 0;
    height: 40px;
    min-height: 0;
    flex: 0 0 40px;
    align-items: center;
    overflow: visible;
    cursor: pointer;
  }

  /* 只裁普通头像本身；头像框外饰和成长红点都属于外层入口，不能进入同一个 clip-path。 */
  .navigation-avatar-clip {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    clip-path: circle(50% at 50% 50%);
  }

  .navigation-icon.has-frame {
    overflow: visible;
  }
  .handle-body {
    display: none;
  }

  .header_menu_ul {
    margin-top: 8px;
    margin-bottom: 2px;
    box-sizing: border-box;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;

    .menu-entry {
      position: relative;
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
      height: 36px;
      justify-content: flex-start;
      padding: 0 10px;
      border: 1px solid transparent;
      border-radius: 10px;
      color: var(--text-color);
      gap: 8px;
      background: var(--primary-btn-bg-color);
      font-size: 13px;
      font-weight: 500;
      line-height: 1.2;
      text-align: left;
      transition:
        border-color 160ms ease,
        background 160ms ease;

      &:hover {
        border-color: var(--surface-border-color);
        background: var(--primary-btn-h-bg-color);
      }
    }

    .menu-entry__icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      flex: 0 0 24px;
      border-radius: 8px;
      color: var(--person-center-menu-icon-fg);
      background: var(--person-center-menu-icon-bg);
    }

    .menu-entry__label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .menu-entry--growth .menu-entry__icon {
      color: var(--person-center-menu-growth-fg);
      background: var(--person-center-menu-growth-bg);
    }

    .menu-entry--store .menu-entry__icon {
      color: var(--person-center-menu-store-fg);
      background: var(--person-center-menu-store-bg);
    }

    .menu-entry--community .menu-entry__icon {
      color: var(--person-center-menu-community-fg);
      background: var(--person-center-menu-community-bg);
    }

    .menu-entry--support .menu-entry__icon {
      color: var(--support-entry-text-color);
      background: var(--support-entry-background);
    }

    .menu-entry--danger .menu-entry__icon {
      color: var(--chip-danger-fg);
      background: var(--chip-danger-bg);
    }

    .menu-group-divider {
      grid-column: 1 / -1;
      height: 1px;
      margin: 2px 0;
      background: var(--surface-divider-color);
    }
  }

  .modal-content {
    margin: auto;
    display: block;
    height: 90%;
    width: 80%;
    max-width: 700px;
  }

  .modal-content {
    -webkit-animation-name: zoom;
    -webkit-animation-duration: 0.6s;
    animation-name: zoom;
    animation-duration: 0.6s;
    cursor: pointer;
  }
  .update-point {
    position: absolute;
    right: 8px;
    width: 6px;
    height: 6px;
    border: 1px solid var(--user-body-bg-color);
    border-radius: 50%;
    background: var(--danger-fill-bg);
  }

  .user-card {
    width: 368px;
    max-width: calc(100vw - 28px);
    background: var(--user-body-bg-color);
    border-radius: 14px;
    padding: 14px;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.12);
    position: relative;
  }

  .user-top {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-bottom: 10px;
    border-bottom: 1px dashed var(--menu-item-h-bg-color);
  }

  .avatar-ring {
    display: grid;
    place-items: center;
    width: 52px;
    height: 52px;
    flex: 0 0 52px;
    border-radius: 14px;
    background: linear-gradient(135deg, rgba(79, 134, 255, 0.25), rgba(82, 196, 186, 0.18));
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .avatar-ring--framed {
    width: 80px;
    height: 80px;
    flex-basis: 80px;
    overflow: visible;
    border-color: transparent;
    background: transparent;
  }

  .ring-day {
    box-shadow: 0 6px 18px rgba(46, 117, 255, 0.18);
  }

  .ring-night {
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
  }

  .user-meta {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .user-name-row {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--text-color);
  }

  .user-name {
    font-weight: 700;
    font-size: 14px;
  }

  .lv-badge {
    position: relative;
    flex: 0 0 auto;
    padding: 1px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    color: #fff;
    letter-spacing: -0.01em;
    cursor: pointer;
    transition: transform 0.15s ease;

    &:hover {
      transform: translateY(-1px);
    }
  }

  .nav-avatar-dot {
    position: absolute;
    z-index: 1;
    top: 0;
    right: 0;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: #ff4d4f;
    border: 2px solid var(--background-color, #fff);
    pointer-events: none;
  }

  .user-sub {
    font-size: 12px;
    color: var(--text-secondary-color, #9aa0ad);
  }

  .stat-grid {
    margin-top: 10px;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .stat-card {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    border-radius: 10px;
    background: linear-gradient(135deg, rgba(79, 134, 255, 0.12), rgba(82, 196, 186, 0.08));
    border: 1px solid rgba(255, 255, 255, 0.06);
  }

  [data-theme='night'] {
    .stat-card {
      background: rgba(255, 255, 255, 0.04);
    }
    .stat-icon {
      background: gray;
    }
  }

  .stat-icon {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    display: grid;
    place-items: center;
    background: rgba(255, 255, 255, 0.12);
  }

  .stat-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .stat-label {
    font-size: 11px;
    color: var(--text-secondary-color, #8a8f99);
  }

  .stat-value {
    font-size: 13px;
    font-weight: 700;
    color: var(--text-color);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .settings-grid {
    margin-top: 10px;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .profile-asset-grid {
    margin-top: 10px;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .setting-card {
    width: 100%;
    min-width: 0;
    min-height: 40px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    border-radius: 10px;
    border: 1px dashed var(--menu-item-h-bg-color);
    background: rgba(255, 255, 255, 0.04);
    color: inherit;
    cursor: pointer;
    font-size: 12px;
  }

  .setting-card:hover {
    background: var(--menu-item-h-bg-color);
  }

  .setting-left {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-color);
    white-space: nowrap;
  }

  .setting-right {
    flex: 0 0 auto;
    margin-left: 6px;
    color: var(--text-secondary-color, #9aa0ad);
    font-size: 11px;
    white-space: nowrap;
  }

  :global(.user-setting-dropdown) {
    z-index: 800;
  }

  :global(.user-center-popover) {
    z-index: 800;
  }

  :global(.user-center-popover .ant-popover-inner) {
    padding: 0;
    background: transparent;
    box-shadow: none;
  }

  :global(.user-center-popover .ant-popover-inner-content) {
    padding: 0;
  }

  :global(.user-center-popover .ant-popover-arrow) {
    display: none;
  }

  .menu-divider {
    margin: 12px 0 6px;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--menu-item-h-bg-color), transparent);
    border: none;
  }

  @media (max-width: 1000px) {
    .modal-content {
      height: 60%;
      width: 80%;
      max-width: 700px;
    }
  }
</style>
