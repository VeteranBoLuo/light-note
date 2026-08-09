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
        <div
          class="navigation-title-link"
          @click="handleToApplicationHome"
          v-click-log="OPERATION_LOG_MAP.navigation.applicationHome"
        >
          <img src="/favicon.svg?v=7" :title="$t('navigation.title')" width="25" height="25" alt="" />
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
            id="nav-bookmark-entry"
            :style="{ color: route.path.includes('/home') ? '#615ced' : '' }"
            style="font-size: 14px; cursor: pointer"
            v-click-log="OPERATION_LOG_MAP.navigation.home"
            @click="handleToBookmark"
            >{{ $t('navigation.bookmark') }}</div
          >
          <div
            id="nav-note-entry"
            :style="{ color: route.path.includes('/noteLibrary') ? '#615ced' : '' }"
            style="font-size: 14px; cursor: pointer"
            v-click-log="OPERATION_LOG_MAP.navigation.note"
            @click="router.push('/noteLibrary')"
            >{{ $t('navigation.note') }}</div
          >
          <div
            id="nav-cloud-entry"
            :style="{ color: route.path.includes('/cloudSpace') ? '#615ced' : '' }"
            style="font-size: 14px; cursor: pointer"
            v-click-log="OPERATION_LOG_MAP.navigation.cloudSpace"
            @click="handleToCloudSpace"
            >{{ $t('navigation.cloudSpace') }}</div
          >

          <!--
            待办是唯一挂注意力角标的导航项：它的数字是「逾期 + 今天到期」，做完今天的事
            就能归零，点进去即可处理。角标绝对定位，出现或消失都不改变导航项宽度，
            其他一级导航不会左右跳动。
          -->
          <div
            id="nav-todo-entry"
            :style="{ color: isTodoRoute ? '#615ced' : '' }"
            class="navigation-todo-entry"
            style="font-size: 14px; cursor: pointer"
            v-click-log="OPERATION_LOG_MAP.navigation.todo"
            @click="router.push({ path: '/inbox', query: { tab: 'todo' } })"
            >{{ $t('navigation.todo')
            }}<span
              v-if="inbox.todoAttentionTotal > 0"
              class="navigation-attention-badge"
              :class="{ 'is-due-today': inbox.todoOverdueTotal === 0 }"
              role="status"
              :aria-label="todoAttentionLabel"
              >{{ displayTodoAttention }}</span
            ></div
          >

          <BButton
            id="nav-community-entry"
            class="navigation-community-entry"
            :class="{ 'is-active': route.path.includes('/community-chat') }"
            :aria-current="route.path.includes('/community-chat') ? 'page' : undefined"
            :aria-label="communityEntryLabel"
            v-click-log="{ module: '导航栏', operation: '打开公共聊天室' }"
            @click="router.push('/community-chat')"
          >
            <SvgIcon :src="icon.ai.conversations" size="16" aria-hidden="true" />
            <span>{{ $t('navigation.communityChat') }}</span>
            <span
              v-if="communityUnreadTotal > 0"
              class="navigation-community-entry__badge"
              role="status"
              :aria-label="$t('communityChat.unreadBadge', { count: communityUnreadTotal })"
            >
              {{ communityUnreadTotal > 99 ? '99+' : communityUnreadTotal }}
            </span>
          </BButton>

          <!--
            管理是单入口：知识库、通知中心、安全中心都已进了 /admin 的侧边导航，
            这里再挂一层下拉只是把后台里已有的入口重复一遍，所以直接进后台总览。
            高亮仍覆盖那三个跨外壳路由，在它们里面也能看出自己属于管理。
          -->
          <div
            v-if="user.role === 'root'"
            id="nav-admin-entry"
            :style="{ color: adminRouteActive ? '#615ced' : '' }"
            style="font-size: 14px; cursor: pointer"
            v-click-log="OPERATION_LOG_MAP.navigation.admin"
            @click="router.push('/admin')"
            >{{ $t('navigation.management') }}</div
          >
        </template>
      </div>
      <RightArea />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed, onBeforeUnmount, onMounted, watch } from 'vue';
  import router from '@/router';
  import { bookmarkStore, inboxStore, useUserStore } from '@/store';
  import { useRoute } from 'vue-router';
  import { useI18n } from 'vue-i18n';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';
  import RightArea from '@/components/home/navigation/RightArea.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { useCommunityChatUnread } from '@/composables/useCommunityChatUnread';
  import icon from '@/config/icon';

  const route = useRoute();
  const user = useUserStore();
  const inbox = inboxStore();
  const communityUnread = useCommunityChatUnread();
  const { totalUnread: communityUnreadTotal } = communityUnread;

  const navigationFucVisible = computed(() => !bookmark.isMobile);
  const { t } = useI18n();

  const adminRouteActive = computed(
    () =>
      route.path.includes('/knowledgeBase') ||
      route.path.includes('/admin') ||
      route.path.includes('/securityCenter') ||
      route.path.includes('/notificationCenter'),
  );
  const isTodoRoute = computed(() => route.path === '/inbox' && String(route.query?.tab || '') === 'todo');
  const displayTodoAttention = computed(() =>
    inbox.todoAttentionTotal > 99 ? '99+' : String(inbox.todoAttentionTotal),
  );
  // 屏幕阅读器听到的是完整语义，而不是一个孤立数字
  const todoAttentionLabel = computed(() =>
    t('navigation.todoAttention', {
      count: inbox.todoAttentionTotal,
      overdue: inbox.todoOverdueTotal,
      dueToday: inbox.todoDueTodayTotal,
    }),
  );
  const communityEntryLabel = computed(() =>
    communityUnreadTotal.value > 0
      ? `${t('navigation.communityChat')}，${t('communityChat.unreadBadge', { count: communityUnreadTotal.value })}`
      : t('navigation.communityChat'),
  );

  const bookmark = bookmarkStore();
  async function handleToApplicationHome() {
    await router.push('/app');
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

  watch(
    () => user.id,
    async (id) => {
      inbox.resetForOwner(id || 'visitor');
      await inbox.refreshCount();
    },
  );

  onMounted(() => {
    inbox.resetForOwner(user.id || 'visitor');
    inbox.refreshCount().catch(() => {});
  });

  watch(
    () => [bookmark.isMobile, user.id, user.role] as const,
    ([isMobile, id, role]) => {
      if (isMobile) return;
      communityUnread.reset();
      if (id && role !== 'visitor') void communityUnread.refresh();
    },
    { immediate: true },
  );

  let communityUnreadTimer: number | undefined;
  onMounted(() => {
    communityUnreadTimer = window.setInterval(() => {
      if (!bookmark.isMobile && document.visibilityState === 'visible' && user.id && user.role !== 'visitor') {
        void communityUnread.refresh();
      }
    }, 60_000);
  });

  onBeforeUnmount(() => {
    if (communityUnreadTimer !== undefined) window.clearInterval(communityUnreadTimer);
  });

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
  /* 角标绝对定位在文字右上角：数字出现或消失都不占导航流宽度，后续导航项不会跳动 */
  .navigation-todo-entry {
    position: relative;
  }
  .navigation-community-entry {
    position: relative;
    min-height: 34px;
    padding: 5px 11px;
    gap: 6px;
    border: 1px solid var(--primary-color) !important;
    border-radius: 999px;
    color: var(--primary-color);
    background: var(--card-background) !important;
    font-size: 13px;
    font-weight: 650;
    white-space: nowrap;
    transform: translateY(0);
    transition:
      color 180ms ease,
      background-color 180ms ease,
      border-color 180ms ease,
      transform 180ms ease;
  }
  .navigation-community-entry:hover,
  .navigation-community-entry.is-active {
    color: #fff;
    background: var(--primary-color) !important;
  }
  .navigation-community-entry:hover:not(.is-active) {
    transform: translateY(-1px);
  }
  .navigation-community-entry__badge {
    position: absolute;
    top: -7px;
    right: -8px;
    min-width: 17px;
    height: 17px;
    padding: 0 4px;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 2px solid var(--surface-page-bg, var(--background-color));
    border-radius: 999px;
    color: var(--danger-fill-fg, #fff);
    background: var(--danger-fill-bg, #d93b3b);
    font-size: 9px;
    line-height: 1;
    pointer-events: none;
  }
  .navigation-attention-badge {
    position: absolute;
    top: -7px;
    right: -14px;
    display: inline-flex;
    min-width: 16px;
    height: 16px;
    align-items: center;
    justify-content: center;
    padding: 0 4px;
    box-sizing: border-box;
    border-radius: 999px;
    /*
     * 实色背景 + 白字：Android WebView 会把 color-mix() 塌缩成稳定实色、
     * 把混色阴影回退成透明，时间提醒这种关键状态不能只靠混色或阴影表达
     * （见 docs/development.md 的「移动浏览器 / Android App 共享渲染基线」）。
     * 默认红色兜底：有逾期时才是最需要警示的情况，class 逻辑失效也不会弱化提醒。
     */
    /* 用 --danger-fill-* 而不是 --danger-color：后者是前景色，深色主题会提亮到
       #ff6b6b，配白字只有 2.78:1。填充色对在两套主题都保证数字可读。 */
    background: var(--danger-fill-bg, #d93b3b);
    color: var(--danger-fill-fg, #fff);
    font-size: 10px;
    font-weight: 600;
    line-height: 1;
    font-variant-numeric: tabular-nums;
    pointer-events: none;
  }
  /* 没有历史逾期、只有今天到期：降一档为警示色，不与真正的逾期混为一谈 */
  .navigation-attention-badge.is-due-today {
    background: var(--warning-fill-bg, #a05f00);
    color: var(--warning-fill-fg, #fff);
  }

  .navigation {
    height: 60px;
    display: flex;
    align-items: center;
    width: 100%;
    position: fixed;
    top: 0;
    z-index: 200;
  }
  .navigation--search-open {
    z-index: 1000;
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
      width: 64px;
      gap: 0;
      padding-left: 20px;
      position: relative;
      z-index: 2;

      .navigation-title-link {
        width: 25px;
        overflow: hidden;
      }
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .navigation-community-entry {
      transition: none;
    }

    .navigation-community-entry:hover:not(.is-active) {
      transform: none;
    }
  }
  @media (min-width: 768px) and (max-width: 1199px) {
    .navigation-title {
      width: 140px;
    }

    .navigation-tab {
      gap: 20px !important;
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
