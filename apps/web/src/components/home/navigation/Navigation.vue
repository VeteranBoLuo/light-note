<template>
  <div
    :class="[
      'navigation',
      {
        'navigation-manage': pagePath === '/manage',
      },
    ]"
  >
    <div id="navigation-container" class="flex-align-center">
      <div class="navigation-title">
        <svg-icon
          :src="icon.navigation.menu"
          size="25"
          class="dom-hover"
          v-if="isHomeDrawerLayout && bookmark.isFold"
          @click="foldClick"
        />
        <svg-icon
          :src="icon.navigation.close"
          size="25"
          class="dom-hover"
          v-if="isHomeDrawerLayout && !bookmark.isFold"
          @click="foldClick"
        />
        <div class="navigation-title-link" @click="handleToIndex" v-click-log="OPERATION_LOG_MAP.navigation.work">
          <img src="/favicon.svg" :title="$t('navigation.title')" width="25" height="25" alt="" />
          <span style="font-size: 18px" v-if="!bookmark.isMobile">{{ $t('navigation.title') }}</span>
        </div>
      </div>
      <div class="navigation-tab flex-align-center" style="gap: 30px; width: max-content">
        <template v-if="navigationFucVisible">
          <div
            :style="{
              color: route.path.includes('/workbenches') ? '#615ced' : '',
            }"
            style="font-size: 14px; cursor: pointer"
            v-click-log="OPERATION_LOG_MAP.navigation.work"
            @click="router.push('/workbenches')"
            >{{ $t('navigation.workbench') }}</div
          >

          <div
            :style="{
              color: route.path.includes('/home') ? '#615ced' : '',
            }"
            style="font-size: 14px; cursor: pointer"
            v-click-log="OPERATION_LOG_MAP.navigation.home"
            @click="handleToBookmark"
            >{{ $t('navigation.bookmark') }}</div
          >
          <div
            :style="{
              color: route.path.includes('/noteLibrary') ? '#615ced' : '',
            }"
            style="font-size: 14px; cursor: pointer; display: flex; gap: 5px; align-items: center"
            v-click-log="OPERATION_LOG_MAP.navigation.note"
            @click="router.push('/noteLibrary')"
            >{{ $t('navigation.note') }}
          </div>
          <div
            :style="{
              color: route.path.includes('/cloudSpace') ? '#615ced' : '',
            }"
            style="font-size: 14px; cursor: pointer; display: flex; gap: 5px; align-items: center"
            v-click-log="OPERATION_LOG_MAP.navigation.cloudSpace"
            @click="handleToCloudSpace"
            >{{ $t('navigation.cloudSpace') }}
          </div>
          <div
            id="nav-tag-entry"
            :style="{
              color:
                route.path.includes('/manage/tagMg') ||
                route.path.includes('/manage/editTag') ||
                route.path.startsWith('/tag/')
                  ? '#615ced'
                  : '',
            }"
            style="font-size: 14px; cursor: pointer; display: flex; gap: 5px; align-items: center"
            v-click-log="OPERATION_LOG_MAP.navigation.tag"
            @click="router.push('/manage/tagMg')"
            >{{ $t('navigation.tag') }}
          </div>

          <div
            :style="{
              color: route.path.includes('/search') ? '#615ced' : '',
            }"
            style="font-size: 14px; cursor: pointer"
            v-click-log="OPERATION_LOG_MAP.navigation.resourceCenter"
            @click="router.push('/search')"
            >{{ $t('navigation.resourceCenter') }}</div
          >
          <b-dropdown v-if="user.role === 'root'" align="center" :menu-options="adminMenuOptions">
            <div
              :style="{ color: adminRouteActive ? '#615ced' : '' }"
              style="font-size: 14px; cursor: pointer; display: flex; gap: 5px; align-items: center"
            >{{ $t('navigation.management') }}</div>
          </b-dropdown>
        </template>
      </div>
      <RightArea />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed, watch } from 'vue';
  import router from '@/router';
  import { bookmarkStore, useUserStore } from '@/store';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import { useRoute } from 'vue-router';
  import { useI18n } from 'vue-i18n';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';
  import RightArea from '@/components/home/navigation/RightArea.vue';
  import BDropdown from '@/components/base/BasicComponents/BDropdown.vue';
  import { recordOperation } from '@/api/commonApi';

  const route = useRoute();
  const user = useUserStore();

  const navigationFucVisible = computed(() => !bookmark.isMobile);
  const { t } = useI18n();

  const adminRouteActive = computed(() =>
    route.path.includes('/knowledgeBase') ||
    route.path.includes('/admin') ||
    route.path.includes('/securityCenter') ||
    route.path.includes('/notificationCenter')
  );

  const adminMenuOptions = computed(() => [
    { label: t('navigation.knowledgeBase'), function: () => { recordOperation({ module: '导航栏', operation: '知识库' }); router.push('/knowledgeBase'); } },
    { label: t('navigation.admin'), function: () => { recordOperation({ module: '导航栏', operation: '后台管理' }); router.push('/admin'); } },
    { label: t('navigation.securityCenter'), function: () => { recordOperation({ module: '导航栏', operation: '安全中心' }); router.push('/securityCenter'); } },
    { label: t('navigation.notificationCenter'), function: () => { recordOperation({ module: '导航栏', operation: '通知中心' }); router.push('/notificationCenter'); } },
  ]);

  const bookmark = bookmarkStore();
  const isHomeDrawerLayout = computed(() => route.path.includes('home') && bookmark.isMobile);

  async function handleToIndex() {
    bookmark.type = 'all';
    bookmark.refreshData();
    if (bookmark.isMobile) {
      await router.push('/home');
    } else {
      await router.push('/');
    }
    bookmark.isFold = true;
  }

  function handleToBookmark() {
    router.push('/home');
    bookmark.type = 'all';
    bookmark.refreshData();
  }
  function handleToCloudSpace() {
    router.push('/cloudSpace');
  }

  function foldClick() {
    bookmark.isFold = !bookmark.isFold;
    const body: any = document.getElementById('phone-filter-panel');
    if (isHomeDrawerLayout.value) {
      body.style.transition = 'all 0.3s';
    } else {
      body.style.transition = 'none';
    }
    if (bookmark.isFold) {
      body.style.transform = 'translateX(-100%)';
    } else {
      body.style.transform = 'translateX(0)';
    }
  }

  watch(
    () => bookmark.type,
    (val) => {
      if (val !== 'search') {
        bookmark.bookmarkSearch = '';
      }
    },
  );

  watch(
    () => route.path,
    () => {
      if (bookmark.isMobile) {
        bookmark.isFold = true;
      }
    },
  );

  const pagePath = computed(() => {
    return route.path;
  });
</script>

<style lang="less" scoped>
  .navigation {
    height: 60px;
    display: flex;
    align-items: center;
    width: 100%;
    position: fixed;
    top: 0;
    z-index: 900;
  }
  .navigation--search-open {
    z-index: 300000;
  }
  .navigation-title {
    height: 100%;
    width: 200px;
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 550;
    font-size: 20px;
    padding-left: 20px;
    .navigation-title-link {
      display: flex;
      align-items: center;
      gap: 10px;
      height: 100%;
      cursor: pointer;
    }
  }
  .user-icon-text {
    text-align: left;
  }
  @media (max-width: 767px) {
    .navigation-title {
      width: 104px;
      gap: 14px;
      padding-left: 20px;
      position: relative;
      z-index: 100003;

      .navigation-title-link {
        width: 25px;
        overflow: hidden;
      }
    }
  }
  .navigation-manage {
    background-color: #ffffff;
    color: #000000;
  }
  #navigation-container {
    position: absolute;
    width: 100%;
  }
</style>
