<template>
  <div class="admin-container">
    <nav class="admin-nav" aria-label="后台管理导航" v-auto-scrollbar>
      <ul class="admin-nav__groups">
        <li
          v-for="entry in menuEntries"
          :key="entry.key"
          class="admin-nav__group"
          :class="{ 'is-standalone-group': entry.kind === 'item' }"
        >
          <!-- 只有一项的分类不给组头：「总览 / 系统总览」这种重复标题白占一行 -->
          <template v-if="entry.kind === 'item'">
            <BButton
              class="admin-nav__item is-standalone"
              :class="{ 'is-active': activeId === entry.item.id }"
              :aria-current="activeId === entry.item.id ? 'page' : undefined"
              @click="go(entry.item)"
            >
              <svg-icon class="admin-nav__item-icon" size="14" :src="entry.icon" />
              <span class="admin-nav__item-text">{{ entry.item.title }}</span>
              <span v-if="entry.item.badge" class="admin-nav__badge" :title="entry.item.badgeHint">
                {{ entry.item.badge > 99 ? '99+' : entry.item.badge }}
                <span class="admin-nav__badge-sr">{{ entry.item.badgeHint }}</span>
              </span>
              <span v-if="entry.item.external" class="admin-nav__external" aria-label="在独立页面打开">↗</span>
            </BButton>
          </template>
          <template v-else>
            <h2 :id="`admin-nav-${entry.key}`" class="admin-nav__group-title">
              <svg-icon class="admin-nav__group-icon" size="14" :src="entry.icon" />
              <span>{{ entry.title }}</span>
            </h2>
            <ul class="admin-nav__items" :aria-labelledby="`admin-nav-${entry.key}`">
              <li v-for="item in entry.items" :key="item.id">
                <BButton
                  class="admin-nav__item"
                  :class="{ 'is-active': activeId === item.id }"
                  :aria-current="activeId === item.id ? 'page' : undefined"
                  @click="go(item)"
                >
                  <span class="admin-nav__item-text">{{ item.title }}</span>
                  <!-- 角标只在有待处理时出现：常态是 0，长期挂个灰 0 会让真的有事时反而不显眼 -->
                  <span v-if="item.badge" class="admin-nav__badge" :title="item.badgeHint">
                    {{ item.badge > 99 ? '99+' : item.badge }}
                    <span class="admin-nav__badge-sr">{{ item.badgeHint }}</span>
                  </span>
                  <!-- 离开后台外壳的入口要标出来，否则点下去侧边菜单突然消失会让人以为出了错 -->
                  <span v-if="item.external" class="admin-nav__external" aria-label="在独立页面打开">↗</span>
                </BButton>
              </li>
            </ul>
          </template>
        </li>
      </ul>
    </nav>
    <div class="admin-view-panel">
      <RouterView />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import { computed, onMounted, ref, watch } from 'vue';
  import { useRoute } from 'vue-router';
  import router from '@/router';
  import { apiBasePost } from '@/http/request.ts';
  import { getCommunityChatAdminReports } from '@/api/communityChatApi.ts';
  import { useI18n } from 'vue-i18n';
  import { adminNavTarget, buildAdminNav, resolveActiveNavId, type AdminNavItem } from '@/view/admin/admin/adminNav.ts';

  const { t } = useI18n();
  const route = useRoute();

  const pendingOpinion = ref(0);
  const pendingSecurity = ref(0);
  const pendingModeration = ref(0);

  const menuEntries = computed(() =>
    buildAdminNav({
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
      aiEvaluationTitle: t('aiEvaluationAdmin.title'),
      communityModerationTitle: t('communityChatModerationAdmin.navTitle'),
      supportManagementTitle: t('adminSupport.title'),
    }),
  );

  /** 高亮跟随路由。此前只在 onMounted 取一次，浏览器前进/后退后高亮会停在旧项。 */
  const activeId = computed(() => resolveActiveNavId(route.path));

  function go(item: AdminNavItem) {
    router.push(adminNavTarget(item));
  }

  /**
   * 反馈和安全复用总览统计；消息审核复用列表 total，不为导航另建计数接口。
   * 任一来源取不到都静默保留原值：导航外壳不能被角标请求打断。
   */
  async function loadPending() {
    const [overviewResult, moderationResult] = await Promise.allSettled([
      apiBasePost('/api/common/getAdminOverview', { hideInternal: true }),
      getCommunityChatAdminReports({ status: 'pending', page: 1, pageSize: 1 }),
    ]);
    if (overviewResult.status === 'fulfilled') {
      const res: any = overviewResult.value;
      if (res?.status === 200) {
        pendingOpinion.value = Number(res.data?.pending?.opinion || 0);
        pendingSecurity.value = Number(res.data?.pending?.security || 0);
      }
    }
    if (moderationResult.status === 'fulfilled') {
      const res: any = moderationResult.value;
      if (res?.status === 200) pendingModeration.value = Number(res.data?.total || 0);
    }
  }

  // 在反馈/安全页操作完回到别处时刷新角标，避免处理完了角标还挂着
  watch(
    () => route.path,
    (path, prev) => {
      if (
        prev &&
        (prev.includes('userOpinion') || prev.includes('securityCenter') || prev.includes('communityChatModeration')) &&
        path !== prev
      )
        loadPending();
    },
  );

  onMounted(loadPending);
</script>

<style lang="less" scoped>
  @import '@/assets/css/admin-mixins.less';

  .admin-container {
    display: flex;
    gap: 10px;
    padding: 20px;
    box-sizing: border-box;
    height: 100%; /* 子路由根被内联固定高度;这里撑满,让内容区在框内滚动而非被裁 */
  }

  .admin-nav {
    width: 200px;
    flex: 0 0 200px;
    min-height: 0;
    overflow-y: auto;
    padding: 4px 0;
  }

  .admin-nav__groups,
  .admin-nav__items {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .admin-nav__group + .admin-nav__group {
    margin-top: 10px;
  }

  /* 组内条目必须留缝：选中态和 hover 都是整块填充圆角背景，零间距时相邻两项的
     背景会拼成一整片，圆角互相抵消，看不出「哪一项被选中」。 */
  .admin-nav__items > li + li {
    margin-top: 3px;
  }

  /* 顶层条目（加粗、无组头）夹在两个分组之间时，若上下间距与组间距相同，会被读成
     上一组的最后一项。加大间距把它从相邻分组里断开。 */
  .admin-nav__group.is-standalone-group + .admin-nav__group,
  .admin-nav__group + .admin-nav__group.is-standalone-group {
    margin-top: 16px;
  }

  .admin-nav__group-title {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 0 4px;
    padding: 0 8px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--desc-color);
  }

  .admin-nav__group-icon {
    flex-shrink: 0;
    opacity: 0.75;
  }

  .admin-nav__item.b_btn {
    .admin-focus-ring(8px);

    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 6px;
    width: 100%;
    padding: 5px 10px 5px 26px; /* 左缩进对齐分组标题的文字起点，让层级一眼可见 */
    height: auto;
    min-height: 30px;
    line-height: 1.3;
    border: none;
    border-radius: 8px;
    background: none;
    font: inherit;
    font-size: 12.5px;
    text-align: left;
    color: var(--text-color);
    cursor: pointer;

    &:hover {
      background: var(--category-item-ba-color);
    }

    &.is-active {
      background: var(--category-item-ba-color);
      font-weight: 600;
    }
  }

  /* 无组头的顶层条目（总览、安全中心）：不缩进，自带类别图标，与分组标题同一层级 */
  .admin-nav__item.b_btn.is-standalone {
    padding-left: 8px;
    font-weight: 600;
  }

  .admin-nav__item-icon {
    flex-shrink: 0;
    opacity: 0.75;
  }

  .admin-nav__item-text {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .admin-nav__badge {
    position: relative; /* 兜住内部只给读屏的绝对定位说明，否则它会挂到更外层的定位祖先上 */
    flex-shrink: 0;
    min-width: 18px;
    padding: 0 5px;
    border-radius: 999px;
    background: var(--danger-fill-bg);
    color: var(--danger-fill-fg);
    font-size: 11px;
    line-height: 17px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  /* 数字本身对读屏用户没有意义，补一段只给读屏的完整说明 */
  .admin-nav__badge-sr {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .admin-nav__external {
    flex-shrink: 0;
    font-size: 11px;
    color: var(--desc-color);
  }

  .admin-view-panel {
    flex: 1 1 0;
    width: calc(100% - 210px);
    min-width: 0; /* 子路由中的宽表格/网格不得以 min-content 撑宽整个后台 */
    min-height: 0; /* flex 子项允许收缩,配合 overflow 才能滚 */
    overflow-x: hidden;
    overflow-y: auto; /* 内容超高时自身滚动(如积分运营页) */
  }
</style>
