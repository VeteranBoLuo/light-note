<template>
  <div
    class="navigation-right-area"
    :class="{ 'phone-top-menu': bookmark.isMobile }"
    :style="{ marginLeft: 'auto', gap: bookmark.isMobile ? '15px' : '5px' }"
  >
    <GlobalSearch />
    <b-menu
      v-if="!bookmark.isMobile"
      placement="bottom"
      :menu-options="[{ label: $t('navigation.projectAddress'), function: () => githubClick() }, { label: '官方首页', function: () => router.push('/landing') }]"
    >
      <svg-icon size="26" hover :src="icon.github" @click="githubClick" />
    </b-menu>
    <button v-if="bookmark.isMobile && route.path.includes('/home')" class="mobile-github-btn" @click="githubClick">
      <svg-icon size="24" hover :src="icon.github" />
    </button>
    <!--移动端个人中心       -->
    <div :class="['navigation-icon']" v-if="bookmark.isMobile" @click="handleToPhoneUserCenter">
      <svg-icon size="32" :src="user.headPicture || icon.navigation.user" class="dom-hover" />
    </div>
    <!--pc端个人中心       -->
    <PersonCenter v-else />
  </div>
</template>

<script lang="ts" setup>
  import icon from '@/config/icon.ts';
  import BMenu from '@/components/base/BasicComponents/BMenu.vue';
  import PersonCenter from '@/view/personCenter/PersonCenter.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { bookmarkStore, useUserStore } from '@/store';
  import router from '@/router';
  import { useRoute } from 'vue-router';
  import { recordOperation } from '@/api/commonApi.ts';
  import GlobalSearch from '@/components/search/GlobalSearch.vue';
  const bookmark = bookmarkStore();

  const user = useUserStore();
  const route = useRoute();

  function githubClick() {
    window.open('https://github.com/VeteranBoLuo/light-note');
    recordOperation({ module: '导航栏', operation: `点击书签卡片Github` });
  }

  function handleToPhoneUserCenter() {
    bookmark.isFold = true;
    router.push('/personCenter');
  }

</script>

<style lang="less" scoped>
  .navigation-right-area {
    display: flex;
    align-items: center;
    min-width: 140px;
    justify-content: flex-end;
    position: absolute;
    right: 40px;
  }
  .navigation-icon {
    display: flex;
    align-items: center;
    clip-path: circle(50% at 50% 50%);
    cursor: pointer;
  }
  .navigation-action-btn {
    border: 0;
    padding: 0;
    background: transparent;
    color: var(--text-color);
    display: flex;
    align-items: center;
    cursor: pointer;
  }
  .phone-top-menu {
    position: absolute;
    left: 128px;
    right: 14px;
    width: unset !important;
    min-width: 0;
    gap: 10px !important;
  }
  .phone-top-menu :deep(.global-search) {
    flex: 1;
    min-width: 0;
  }
  .mobile-github-btn {
    border: 0;
    padding: 0;
    background: transparent;
    color: var(--text-color);
    display: flex;
    align-items: center;
    cursor: pointer;
    flex: 0 0 auto;
  }
</style>
