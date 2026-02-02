<template>
  <div :class="['navigation', { 'navigation-manage': pagePath === '/manage' }]">
    <div id="navigation-container" class="flex-align-center">
      <div class="navigation-title">
        <svg-icon
          :src="icon.navigation.menu"
          size="25"
          class="dom-hover"
          v-if="bookmark.isMobile && route.path.includes('home') && bookmark.isFold"
          @click="foldClick"
        />
        <svg-icon
          :src="icon.navigation.close"
          size="25"
          class="dom-hover"
          v-if="bookmark.isMobile && route.path.includes('home') && !bookmark.isFold"
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
            :style="{ color: route.path.includes('/home') ? '#615ced' : '' }"
            style="font-size: 14px; cursor: pointer"
            v-click-log="OPERATION_LOG_MAP.navigation.home"
            @click="handleToBookmark"
            >{{ $t('navigation.bookmark') }}</div
          >
          <div
            :style="{ color: route.path.includes('/noteLibrary') ? '#615ced' : '' }"
            style="font-size: 14px; cursor: pointer; display: flex; gap: 5px; align-items: center"
            v-click-log="OPERATION_LOG_MAP.navigation.note"
            @click="router.push('/noteLibrary')"
            >{{ $t('navigation.note') }}
          </div>
          <div
            :style="{ color: route.path.includes('/cloudSpace') ? '#615ced' : '' }"
            style="font-size: 14px; cursor: pointer; display: flex; gap: 5px; align-items: center"
            v-click-log="OPERATION_LOG_MAP.navigation.cloudSpace"
            @click="handleToCloudSpace"
            >{{ $t('navigation.cloudSpace') }}
          </div>
        </template>
      </div>
      <RightArea />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed, onMounted, ref, watch } from 'vue';
  import router from '@/router';
  import { bookmarkStore, cloudSpaceStore, useUserStore } from '@/store';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import { useRoute } from 'vue-router';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';
  import { isFocused } from '@/utils/validator.ts';
  import RightArea from '@/components/home/navigation/RightArea.vue';

  const route = useRoute();
  const user = useUserStore();

  document.addEventListener('DOMContentLoaded', function () {
    const searchInput = document.getElementById('searchInput');

    searchInput.addEventListener('focus', function () {
      console.log('输入框获得了焦点！');
      // 这里可以添加其他你希望在输入框聚焦时执行的代码
    });

    searchInput.addEventListener('blur', function () {
      console.log('输入框失去了焦点！');
      // 这里可以添加其他你希望在输入框失去焦点时执行的代码
    });
  });
  const navigationFucVisible = computed(() => {
    return (
      !bookmark.isMobile &&
      ['home', 'noteLibrary', 'manage', 'help', 'cloudSpace', 'admin', 'updateLogs', 'workbenches', 'aiAssistant'].some(
        (item) => route.path.includes(item),
      )
    );
  });

  const bookmark = bookmarkStore();

  async function handleToIndex() {
    bookmark.type = 'all';
    bookmark.refreshData();
    await router.push({ path: `/` });
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
    if (bookmark.isMobile) {
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

  const pagePath = computed(() => {
    return route.path;
  });
  onMounted(() => {
    document.addEventListener('keydown', function (event) {
      if (event.key === '/') {
        const deskInput = document.getElementById('bookmark-input');
        // 没有聚焦在输入框上时，聚焦到输入框
        if (deskInput && !isFocused(deskInput)) {
          event.preventDefault();
          deskInput.focus();
        }
      }
    });
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
  @media (max-width: 1000px) {
    .navigation-title {
      gap: 20px;

      .navigation-title-link {
        gap: 10px;
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
