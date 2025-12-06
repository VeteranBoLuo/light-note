<template>
  <div
    class="navigation-right-area"
    :class="{ 'phone-top-menu': bookmark.isMobileDevice }"
    :style="{ marginLeft: searchInputVisible ? '0' : 'auto', gap: bookmark.isMobileDevice ? '15px' : '5px' }"
  >
    <Teleport v-if="bookmark.isMobileDevice" to="body">
      <div id="phone-navigation-search" class="phone-navigation-search">
        <b-input
          v-model:value="bookmark.bookmarkSearch"
          class="phoneSearch"
          id="navigation-phone-input"
          placeholder="可根据网站名称、描述搜索"
          @focusout="searchBackClick"
          @input="handleSearch"
        >
          <template #prefix>
            <svg-icon :src="icon.navigation.search" size="16" />
          </template>
        </b-input>
        <span class="search-back-span flex-center" @click="searchBackClick">返回</span>
      </div>
    </Teleport>
    <div class="navigation-search-body" v-else>
      <div
        class="navigation-search-input"
        v-if="searchInputVisible"
        :style="{
          opacity: route.path.includes('/noteLibrary') ? 0 : 1,
          pointerEvents: route.path.includes('/noteLibrary') ? 'none' : 'auto',
        }"
      >
        <b-input
          id="bookmark-input"
          :placeholder="placeholder"
          @input="handleSearch"
          @focus="placeholder = '可根据网站名称、描述和标签搜索'"
          @focusout="placeholder = 'Search...'"
          v-model:value="bookmark.bookmarkSearch"
        >
          <template #prefix>
            <svg-icon :src="icon.navigation.search" size="16" />
          </template>
          <template #suffix>
            <div>/</div>
          </template>
        </b-input>
      </div>
    </div>
    <div v-if="phoneSearchVisible" class="flex-align-center dom-hover">
      <svg-icon size="26" :src="icon.navigation.phone_search" @click="phoneSearchClick" />
    </div>
    <b-menu
      v-if="!bookmark.isMobileDevice"
      :menu-options="[
        { label: $t('navigation.newTag'), icon: icon.common.add, function: () => router.push('/manage/editTag/add') },
        { label: $t('navigation.tagManagement'), icon: icon.filterPanel.list, function: () => router.push('/manage/tagMg') },
      ]"
    >
      <svg-icon size="26" hover :src="icon.manage_categoryBtn_tag"
    /></b-menu>
    <b-menu
      v-if="!bookmark.isMobileDevice"
      :menu-options="[
        {
          label: $t('navigation.newBookmark'),
          icon: icon.common.add,
          function: () => router.push('/manage/editBookmark/add'),
        },
        {
          label: $t('navigation.bookmarkManagement'),
          icon: icon.filterPanel.list,
          function: () => router.push('/manage/bookmarkMg'),
        },
      ]"
    >
      <svg-icon size="26" hover :src="icon.manage_categoryBtn_bookmark"
    /></b-menu>
    <b-menu
      placement="bottom"
      :menu-options="[
        { label: $t('navigation.followSystem'), icon: icon.navigation.system, function: () => changeTheme('system') },
        { label: $t('navigation.light'), icon: icon.navigation.sun, function: () => changeTheme('day') },
        { label: $t('navigation.dark'), icon: icon.navigation.moon, function: () => changeTheme('night') },
      ]"
    >
      <svg-icon size="26" :src="getThemeIcon()" hover
    /></b-menu>
    <b-menu placement="bottom" :menu-options="[{ label: $t('navigation.projectAddress'), function: () => githubClick() }]">
      <svg-icon size="26" hover :src="icon.github" @click="githubClick" />
    </b-menu>
    <lang-switch />
    <!--移动端个人中心       -->
    <div :class="['navigation-icon']" v-if="bookmark.isMobileDevice" @click="handleToPhoneUserCenter">
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
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { bookmarkStore, useUserStore } from '@/store';
  import { computed, ref } from 'vue';
  import router from '@/router';
  import userApi from '@/api/userApi.ts';
  import { useRoute } from 'vue-router';
  import { recordOperation } from '@/api/commonApi.ts';
  import LangSwitch from '@/components/base/LangSwitch.vue';
  const bookmark = bookmarkStore();
  const searchInputVisible = computed(() => {
    return !bookmark.isMobileDevice && ['home'].some((item) => route.path.includes(item));
  });
  const phoneSearchVisible = computed(() => {
    return bookmark.isMobileDevice && route.path.includes('home') && bookmark.isFold;
  });

  const route = useRoute();
  const user = useUserStore();
  const placeholder = ref('Search...');

  const timer = ref();

  function handleSearch() {
    if (bookmark.bookmarkSearch === 'openRoot') {
      user.role = 'root';
    }
    if (timer.value) {
      clearTimeout(timer.value);
    }
    timer.value = setTimeout(() => {
      if (bookmark.bookmarkSearch) {
        bookmark.type = 'search';
        router.push({ path: `/home/search/${bookmark.bookmarkSearch}` });
      } else {
        router.push({ path: '/home' });
      }
      bookmark.refreshData();
    }, 500);
  }

  function phoneSearchClick() {
    const search: any = document.getElementById('phone-navigation-search');
    search.style.transform = ' translateX(20px)';
    const body: any = document.getElementById('navigation-container');
    body.style.transition = 'all 0.3s';
    body.style.transform = ' translateX(100%)';
    document.getElementById('navigation-phone-input').focus();
  }

  function searchBackClick() {
    const search: any = document.getElementById('phone-navigation-search');
    search.style.transform = ' translateX(calc(-100%))';
    const body: any = document.getElementById('navigation-container');
    body.style.transition = 'all 0.3s';
    body.style.transform = ' translateX(0)';
  }

  function githubClick() {
    window.open('https://github.com/VeteranBoLuo/light-note');
    recordOperation({ module: '导航栏', operation: `点击书签卡片Github` });
  }

  function handleToPhoneUserCenter() {
    bookmark.isFold = true;
    router.push('/personCenter');
  }

  function getThemeIcon() {
    switch (bookmark.theme) {
      case 'system':
        return icon.navigation.system;
      case 'day':
        return icon.navigation.sun;
      case 'night':
        return icon.navigation.moon;
    }
  }

  function changeTheme(theme: string) {
    bookmark.theme = theme;
    userApi
      .updateUserInfo({
        id: localStorage.getItem('userId'),
        theme: bookmark.theme,
      })
      .then(() => {
        localStorage.setItem('theme', bookmark.theme);
      })
      .catch((err) => {
        console.error('后台错误：' + err);
      });
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
  .phone-top-menu {
    position: absolute;
    right: 25px;
    width: unset !important;
  }
  .phone-navigation-search {
    position: absolute;
    top: 14px;
    width: calc(100% - 40px);
    transform: translateX(calc(-100%));
    gap: 10px;
    display: flex;
    transition: all 0.3s;
    z-index: 9;

    .search-back-span {
      cursor: pointer;
      width: 60px;
      color: #ff9800;
    }
  }
  .navigation-search-body {
    height: 100%;
    align-items: center;
    display: flex;
    width: 280px;
    margin-right: 10px;
    :deep(.b-input) {
      border-radius: 16px;
      height: 34px;
    }
  }
  .navigation-search-input {
    margin: auto;
    width: 400px;
  }
  @media (max-width: 850px) {
    .navigation-search-input {
      width: 100%;
    }
  }

  @media (min-width: 1921px) {
    .navigation-search-input {
      width: 600px;
    }
  }
</style>
