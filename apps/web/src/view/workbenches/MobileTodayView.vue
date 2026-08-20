<template>
  <!--
    移动端「今日」。

    顶部总览与桌面工作台使用同一统计口径，下面的行动明细仍只回答
    「我今天先做什么、有哪些资料还没整理」。资源总量、增长趋势、文件类型分布、
    常用标签排行和最近更新都留在桌面工作台。
  -->
  <div
    ref="scrollRef"
    class="mobile-today"
    data-mobile-resource-scroll
    @touchstart.passive="pullRefresh.onTouchStart"
    @touchmove="pullRefresh.onTouchMove"
    @touchend.passive="pullRefresh.onTouchEnd"
    @touchcancel.passive="pullRefresh.onTouchCancel"
  >
    <header class="mobile-today__head">
      <span class="mobile-today__date">{{ dateLabel }}</span>
      <h1>{{ greetingLine }}</h1>
    </header>

    <div v-if="loadFailed" class="mobile-today__error" role="alert">
      <span>{{ t('common.requestFailedDescription') }}</span>
      <BButton size="small" :loading="loading" @click="loadToday">{{ t('common.retry') }}</BButton>
    </div>

    <section class="mobile-today__pending" :aria-label="t('workbench.panel.todaySummary')">
      <div class="mobile-today__pending-head">
        <strong>{{ t('workbench.panel.todaySummary') }}</strong>
        <span>{{ t('workbench.panel.todaySummaryHint') }}</span>
      </div>
      <div class="mobile-today__summary">
        <BButton
          v-for="item in summaryItems"
          :key="item.key"
          class="mobile-today__summary-item"
          :class="`is-${item.key}`"
          :title="`${item.value} ${item.label}`"
          :aria-label="`${item.value} ${item.label}`"
          @click="openSummaryItem(item.key)"
          v-click-log="{ module: '今日', operation: `查看${item.label}` }"
        >
          <SvgIcon class="mobile-today__summary-icon" :src="item.icon" size="16" aria-hidden="true" />
          <strong class="mobile-today__summary-value">{{ item.value }}</strong>
          <span class="mobile-today__summary-label">{{ item.label }}</span>
        </BButton>
      </div>
      <div class="mobile-today__pending-details">
        <TodayActionSection
          :todo-total="counts.overdue + counts.dueToday"
          :inbox-total="counts.inbox"
          :overdue-todos="overdueTodos"
          :due-today-todos="dueTodayTodos"
          :inbox-items="inboxItems"
          :loading="initialTodayLoading"
          :show-header="false"
          compact-empty
          compact-actions
          @refresh="loadToday"
        />
      </div>
    </section>

    <!-- 首屏摘要稳定后再挂载下方内容，避免骨架屏高度变化把真实卡片来回推移。 -->
    <section v-if="todaySettled" class="mobile-today__capture">
      <div class="mobile-today__capture-head">
        <strong>{{ t('workbench.mobileToday.quickCaptureTitle') }}</strong>
        <span>{{ t('workbench.mobileToday.quickCaptureHint') }}</span>
      </div>
      <div class="mobile-today__capture-grid">
        <BButton
          v-for="action in captureActions"
          :key="action.key"
          class="mobile-today__capture-action"
          :class="`is-${action.key}`"
          @click="runCapture(action)"
          v-click-log="{ module: '今日', operation: `快速记录-${action.label}` }"
        >
          <span class="mobile-today__capture-icon" aria-hidden="true">
            <SvgIcon :src="action.icon" size="20" />
          </span>
          <span>{{ action.label }}</span>
        </BButton>
      </div>
    </section>

    <section v-if="todaySettled && continueItems.length" class="mobile-today__continue">
      <div class="mobile-today__continue-head">
        <strong>{{ t('workbench.mobileToday.continueTitle') }}</strong>
        <span>{{ t('workbench.mobileToday.continueHint') }}</span>
      </div>
      <div class="mobile-today__continue-list">
        <BButton
          v-for="item in continueItems"
          :key="`${item.type}-${item.id}`"
          class="mobile-today__continue-item"
          @click="openContinueItem(item)"
          v-click-log="{ module: '今日', operation: `继续处理-${item.type}` }"
        >
          <span class="mobile-today__continue-icon" :class="`is-${item.type}`" aria-hidden="true">
            <SvgIcon :src="item.type === 'note' ? icon.resource.note : icon.resource.file" size="16" />
          </span>
          <span class="mobile-today__continue-main">
            <strong>{{ item.title }}</strong>
            <small>{{ continueMeta(item) }}</small>
          </span>
        </BButton>
      </div>
    </section>

    <WorkbenchGrowth v-if="todaySettled" class="mobile-today__growth-card" compact-today />

    <section v-if="todaySettled && showDailyGrowthTasks" class="mobile-today__growth">
      <DailyQuests
        :quests="dailyGrowthQuests"
        :bonus="dailyGrowthBonus"
        :claiming="claimingDailyGrowth || claimingRewards"
        :read-only="growthReadOnly"
        :show-claim-action="false"
        @claim="claimDailyGrowth"
      />
    </section>

    <section v-if="todaySettled && showGrowthTasks" class="mobile-today__growth">
      <GrowthTasks
        :data="growthTasks"
        compact
        :max-visible="3"
        show-view-all
        :read-only="growthReadOnly"
        @view="openGrowthTasks"
      />
    </section>

    <!-- 不放「查看全部待办」：底部导航已有待办一级入口，这里重复只会占位 -->
  </div>
</template>

<script setup lang="ts">
  import { computed, onActivated, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import TodayActionSection from '@/components/workbenches/TodayActionSection.vue';
  import WorkbenchGrowth from '@/components/workbenches/WorkbenchGrowth.vue';
  import DailyQuests from '@/components/growth/DailyQuests.vue';
  import GrowthTasks from '@/components/growth/GrowthTasks.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import icon from '@/config/icon';
  import { apiBasePost } from '@/http/request';
  import { inboxStore, useUserStore } from '@/store';
  import type { ActionCaptureType } from '@/store/inbox';
  import type { TodoItem } from '@/api/todoApi';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import { useMobileTopBar } from '@/composables/useMobileTopBar';
  import { useGrowth } from '@/composables/useGrowth.ts';
  import { recordOperation } from '@/api/commonApi';
  import { useAndroidPullRefresh } from '@/composables/useAndroidPullRefresh';
  import { useForegroundRefresh } from '@/composables/useForegroundRefresh';
  import { dailyQuestClaimLogText, resolveDailyQuestClaimFeedback } from '@/utils/dailyQuestClaim';

  interface TodayInboxItem {
    resourceType: 'bookmark' | 'note' | 'file';
    resourceId: string;
    title: string;
    collectedAt?: string;
  }

  interface TodayContinueItem {
    type: 'note' | 'file';
    id: string;
    title: string;
    activeAt?: string;
    route: string;
  }

  const { t, locale } = useI18n();
  const router = useRouter();
  const inbox = inboxStore();
  const user = useUserStore();
  const scrollRef = ref<HTMLElement | null>(null);
  const { dashboard, growthTasks, claimingRewards, loadDashboard, loadGrowthTasks, loadClaimable, claimDailyBonus } =
    useGrowth();
  const growthReadOnly = computed(() => Boolean(user.adminContext));
  const dailyGrowthQuests = computed(() => dashboard.value?.quests || []);
  const dailyGrowthBonus = computed(
    () => dashboard.value?.questBonus || { exp: 0, points: 0, claimed: false, claimable: false },
  );
  // 「今日」只展示当天尚未收口的任务：保留待领奖入口，奖励领取后不再占用首屏空间。
  const showDailyGrowthTasks = computed(() => Boolean(dashboard.value && !dailyGrowthBonus.value.claimed));
  const claimingDailyGrowth = ref(false);
  const showGrowthTasks = computed(() => Boolean(growthTasks.value?.tasks.some((task) => !task.claimed)));
  async function claimDailyGrowth() {
    if (growthReadOnly.value || claimingDailyGrowth.value || claimingRewards.value) return;
    claimingDailyGrowth.value = true;
    try {
      const res = await claimDailyBonus();
      if (res?.status === 200 && res.data?.ok) {
        const feedback = resolveDailyQuestClaimFeedback(res.data);
        if (feedback.level === 'success') {
          message.success(t(feedback.key, feedback.params));
          recordOperation({ module: '工作台', operation: dailyQuestClaimLogText(res.data) });
        } else {
          message.info(t(feedback.key, feedback.params));
        }
      }
    } catch (error) {
      console.error('今日领取每日奖励失败:', error);
    } finally {
      claimingDailyGrowth.value = false;
    }
  }

  const loading = ref(false);
  const todaySettled = ref(false);
  const initialTodayLoading = computed(() => loading.value && !todaySettled.value);
  const loadFailed = ref(false);
  const overdueTodos = ref<TodoItem[]>([]);
  const dueTodayTodos = ref<TodoItem[]>([]);
  const inboxItems = ref<TodayInboxItem[]>([]);
  const continueItems = ref<TodayContinueItem[]>([]);
  const counts = ref({ overdue: 0, dueToday: 0, inbox: 0, todoPending: 0, unreadNotification: 0 });
  let todayRequestId = 0;
  let currentTodayRequest: Promise<void> | null = null;

  /*
   * 日期和问候语取的是"现在",但 computed 只认响应式依赖 —— 直接读 new Date()
   * 等于算一次就永久缓存。页面挂一夜再回来,数据被前台刷新换成了今天的,
   * 标题却还写着昨天,比不刷更糟。clockTick 就是那个显式依赖:
   * 回到前台时递增一次,强制两个 computed 重算。不要因为"看起来没用"删掉它。
   */
  const clockTick = ref(0);

  const dateLabel = computed(() => {
    void clockTick.value;
    return new Intl.DateTimeFormat(locale.value, { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());
  });

  const greetingLine = computed(() => {
    void clockTick.value;
    const hour = new Date().getHours();
    const greeting =
      hour < 11
        ? t('workbench.mobileToday.greetingMorning')
        : hour < 13
          ? t('workbench.mobileToday.greetingNoon')
          : hour < 18
            ? t('workbench.mobileToday.greetingAfternoon')
            : t('workbench.mobileToday.greetingEvening');
    // 问候语只算需要今天优先处理的事，不跟下方「全部待处理」总览混用口径。
    const pending = counts.value.overdue + counts.value.dueToday + counts.value.inbox;
    const tail = pending
      ? t('workbench.mobileToday.pendingSummary', { count: pending })
      : t('workbench.mobileToday.pendingSummaryEmpty');
    return `${greeting}，${tail}`;
  });

  const summaryItems = computed(() => [
    {
      key: 'todo' as const,
      label: t('workbench.today.todoPending'),
      value: counts.value.todoPending,
      icon: icon.noteDetail.toolbar.todo,
    },
    {
      key: 'inbox' as const,
      label: t('workbench.mobileToday.inbox'),
      value: counts.value.inbox,
      icon: icon.contextMenu.inbox,
    },
    {
      key: 'notification' as const,
      label: t('workbench.today.unreadNotification'),
      value: counts.value.unreadNotification,
      icon: icon.settings.notification,
    },
  ]);

  // 四类快速记录共用同一快速添加抽屉，待办先走轻量表单，需要时再展开完整详情。
  const captureActions = computed(() => [
    {
      key: 'note' as const,
      type: 'note' as ActionCaptureType,
      label: t('workbench.mobileToday.captureNote'),
      icon: icon.resource.note,
    },
    {
      key: 'todo' as const,
      type: 'todo' as ActionCaptureType,
      label: t('workbench.mobileToday.captureTodo'),
      icon: icon.noteDetail.toolbar.todo,
    },
    {
      key: 'bookmark' as const,
      type: 'bookmark' as ActionCaptureType,
      label: t('workbench.mobileToday.captureBookmark'),
      icon: icon.resource.bookmark,
    },
    {
      key: 'file' as const,
      type: 'file' as ActionCaptureType,
      label: t('workbench.mobileToday.captureFile'),
      icon: icon.resource.file,
    },
  ]);

  // 今日顶栏：宽全局搜索 + 快速创建 + 通知（通知由共享顶栏按登录态决定）
  useMobileTopBar(['workbenches'], {
    onAdd: () => runCapture({ type: 'note' }),
    addLabel: () => t('inbox.quickCapture'),
  });

  function goToTodo(tab: 'todo' | 'all') {
    void router.push({ path: '/inbox', query: { tab } });
  }

  function openSummaryItem(key: 'todo' | 'inbox' | 'notification') {
    if (key === 'notification') {
      void router.push({ name: 'notifications' });
      return;
    }
    goToTodo(key === 'todo' ? 'todo' : 'all');
  }

  function openGrowthTasks() {
    void router.push({ path: '/growth', hash: '#growth-tasks' });
  }

  function continueMeta(item: TodayContinueItem) {
    const typeLabel = t(`resourceCenter.types.${item.type}`);
    if (!item.activeAt) return typeLabel;
    const date = new Date(item.activeAt);
    if (Number.isNaN(date.getTime())) return typeLabel;
    return `${typeLabel} · ${new Intl.DateTimeFormat(locale.value, { dateStyle: 'short' }).format(date)}`;
  }

  function openContinueItem(item: TodayContinueItem) {
    if (item.type !== 'note') {
      void router.push(item.route);
      return;
    }
    const target = router.resolve(item.route);
    void router.push({
      path: target.path,
      query: { ...target.query, from: router.currentRoute.value.fullPath },
      hash: target.hash,
    });
  }

  function runCapture(action: { type: ActionCaptureType | null }) {
    if (blockGuestWrite('today-capture', t('inbox.guestPrompt'))) return;
    if (!action.type) return;
    inbox.openQuickCapture(action.type);
  }

  function loadToday(): Promise<void> {
    if (currentTodayRequest) return currentTodayRequest;
    const requestId = todayRequestId;
    loading.value = true;
    loadFailed.value = false;
    let request!: Promise<void>;
    request = (async () => {
      try {
        const res = await apiBasePost('/api/workbench/today', {}, { silent: true });
        if (requestId !== todayRequestId) return;
        if (res.status !== 200) {
          loadFailed.value = true;
          return;
        }
        const data = res.data || {};
        overdueTodos.value = Array.isArray(data.overdueTodos) ? data.overdueTodos : [];
        dueTodayTodos.value = Array.isArray(data.dueTodayTodos) ? data.dueTodayTodos : [];
        inboxItems.value = Array.isArray(data.inboxItems) ? data.inboxItems : [];
        continueItems.value = Array.isArray(data.continueItems) ? data.continueItems : [];
        counts.value = {
          overdue: Number(data.counts?.overdue || 0),
          dueToday: Number(data.counts?.dueToday || 0),
          inbox: Number(data.counts?.inbox || 0),
          todoPending: Number(data.counts?.todoPending || 0),
          unreadNotification: Number(data.counts?.unreadNotification || 0),
        };
        // 底部导航角标与今日摘要共用同一份计数，避免两处数字不一致。
        // overdue / dueToday 来自 listTodoPage 的 due=overdue|today（includeTotal 权威总数），
        // 与 /inbox/count 的注意力口径同源同边界，可以直接喂给角标字段；
        // 少了这两行，进过今日页后角标会被下面的库存口径稀释回「全部未完成」。
        inbox.pendingTotal = counts.value.inbox;
        inbox.todoPendingTotal = counts.value.todoPending;
        inbox.todoOverdueTotal = counts.value.overdue;
        inbox.todoDueTodayTotal = counts.value.dueToday;
        inbox.todoAttentionTotal = counts.value.overdue + counts.value.dueToday;
      } catch {
        if (requestId === todayRequestId) loadFailed.value = true;
      } finally {
        if (requestId === todayRequestId) {
          loading.value = false;
          todaySettled.value = true;
        }
        if (currentTodayRequest === request) currentTodayRequest = null;
      }
    })();
    currentTodayRequest = request;
    return request;
  }

  // 手势细节(阈值、阻尼、方向锁、顶部判定、浮层拦截、竞态)全部收口在 composable 里,
  // 这里只声明「什么时候能刷」和「刷什么」。
  const pullRefresh = useAndroidPullRefresh({
    enabled: true,
    externalBusy: initialTodayLoading,
    getScrollContainer: () => scrollRef.value,
    onRefresh: () => Promise.all([loadToday(), loadDashboard(), loadGrowthTasks(true), loadClaimable()]),
  });
  /*
   * 从后台切回来时补一次数据。今日页最需要这个:日期、待办和签到状态都跟"今天"绑定,
   * 用户很可能昨天开着页面睡了,今天回来看到的还是昨天的内容。
   * 提示由顶栏那条全局细条负责(composable 内部已注册)。
   */
  useForegroundRefresh({
    refresh: () => {
      // 先让日期/问候语跟上真实时间,再取数据,避免出现"今天的数据 + 昨天的标题"。
      clockTick.value += 1;
      return Promise.all([loadToday(), loadDashboard(), loadGrowthTasks(true), loadClaimable()]);
    },
    canRefresh: () => !initialTodayLoading.value,
  });

  // 账号切换后必须重新取数，不能把上一个账号的待办留在屏幕上
  watch(
    () => user.id,
    () => {
      todayRequestId += 1;
      currentTodayRequest = null;
      loading.value = false;
      todaySettled.value = false;
      overdueTodos.value = [];
      dueTodayTodos.value = [];
      inboxItems.value = [];
      continueItems.value = [];
      counts.value = { overdue: 0, dueToday: 0, inbox: 0, todoPending: 0, unreadNotification: 0 };
      if (user.id) void Promise.all([loadToday(), loadDashboard(), loadGrowthTasks(true), loadClaimable()]);
    },
  );

  // 在组件首次渲染前同步进入 loading，不能先渲染一次“已清空”的短空状态。
  void loadToday();

  onMounted(() => {
    void loadDashboard();
    void loadGrowthTasks();
    void loadClaimable();
  });

  /*
   * 注意:本项目当前没有任何 keep-alive,路由切换会重建页面,所以这段 onActivated
   * 实际不会执行(留着是为了将来真启用 keep-alive 时仍有正确行为)。
   * 「离开一段时间再回来要刷新」这件事现在由上面的 useForegroundRefresh 兜住。
   */
  onActivated(() => {
    if (dashboard.value) void loadDashboard();
    if (growthTasks.value) void loadGrowthTasks(true);
    void loadClaimable();
  });
</script>

<style scoped lang="less">
  .mobile-today {
    position: relative;
    width: 100%;
    height: 100%;
    padding: 12px 12px calc(18px + env(safe-area-inset-bottom));
    box-sizing: border-box;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: contain;
    color: var(--text-color);
  }

  /* 下拉刷新指示器现在是全站唯一一个,挂在 MobileAppShell 的内容区顶部 */

  .mobile-today__head {
    margin: 1px 2px 13px;
  }

  .mobile-today__growth {
    margin: 12px 0;
    padding: 13px;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--card-background);
  }

  .mobile-today__growth-card {
    margin: 14px 0;
  }

  .mobile-today__pending {
    position: relative;
    overflow: hidden;
    margin-bottom: 14px;
    padding: 15px 13px 13px;
    border: 1px solid var(--surface-border-color);
    border-radius: 17px;
    background: var(--card-background);
    box-shadow: 0 10px 28px rgba(37, 40, 72, 0.06);
  }

  .mobile-today__pending::before {
    position: absolute;
    inset: 0 0 auto;
    height: 3px;
    background: var(--primary-color);
    content: '';
  }

  .mobile-today__pending-head {
    display: grid;
    gap: 3px;
    margin-bottom: 10px;
  }

  .mobile-today__pending-head strong {
    font-size: 16px;
    font-weight: 700;
  }

  .mobile-today__pending-head span {
    color: var(--desc-color);
    font-size: 12px;
  }

  .mobile-today__date {
    color: var(--desc-color);
    font-size: 12px;
  }

  .mobile-today__head h1 {
    margin: 4px 0 0;
    font-size: 21px;
    font-weight: 760;
    line-height: 1.3;
  }

  .mobile-today__error {
    margin-bottom: 12px;
    padding: 10px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    color: var(--desc-color);
    background: var(--card-background);
    font-size: 12px;
  }

  .mobile-today__summary {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0;
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 13px;
    background: var(--workspace-panel-bg-color, var(--card-background));
  }

  .mobile-today__pending-details {
    margin-top: 10px;
  }

  .mobile-today__summary-item {
    /* 三项共用一条紧凑总览，不再让三个统计数各占一张纵向卡片。 */
    position: relative;
    width: 100%;
    min-width: 0;
    height: 52px;
    padding: 0 3px;
    gap: 3px;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 0;
    color: var(--text-color);
    background: transparent !important;
  }

  .mobile-today__summary-item:active,
  .mobile-today__summary-item:focus-visible {
    z-index: 1;
    outline: 1px solid var(--primary-color);
    outline-offset: -1px;
    background: var(--card-background) !important;
  }

  .mobile-today__summary-item:not(:last-child)::after {
    position: absolute;
    top: 13px;
    right: 0;
    width: 1px;
    height: 26px;
    background: var(--surface-divider-color);
    content: '';
  }

  .mobile-today__pending-details :deep(.today-actions__group) {
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }

  /* 骨架与加载后的分组共用同一层级：真实列表已去掉内层外框，加载态也不能
     凭空多出一张圆角卡片，否则数据回来时会出现明显的边框闪变。 */
  .mobile-today__pending-details :deep(.today-actions__skeleton-group) {
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  .mobile-today__pending-details :deep(.today-actions__group + .today-actions__group) {
    border-top: 1px solid var(--surface-divider-color);
  }

  .mobile-today__summary-icon {
    flex: 0 0 auto;
  }

  .mobile-today__summary-value {
    flex: 0 0 auto;
    font-size: 16px;
    font-weight: 720;
    line-height: 1;
  }

  .mobile-today__summary-label {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--desc-color);
    font-size: clamp(10px, 2.9vw, 11px);
    line-height: 1.2;
  }

  .mobile-today__summary-item.is-todo .mobile-today__summary-icon,
  .mobile-today__summary-item.is-todo .mobile-today__summary-value {
    color: var(--primary-color);
  }

  .mobile-today__summary-item.is-inbox .mobile-today__summary-icon,
  .mobile-today__summary-item.is-inbox .mobile-today__summary-value {
    color: var(--resource-note-color, #00a884);
  }

  .mobile-today__summary-item.is-notification .mobile-today__summary-icon,
  .mobile-today__summary-item.is-notification .mobile-today__summary-value {
    color: var(--resource-bookmark-color, #615ced);
  }

  .mobile-today__capture {
    margin-bottom: 14px;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  .mobile-today__capture-head {
    margin-bottom: 10px;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }

  .mobile-today__capture-head strong {
    font-size: 16px;
  }

  .mobile-today__capture-head span {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--desc-color);
    font-size: 12px;
  }

  .mobile-today__capture-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }

  .mobile-today__capture-action {
    width: 100%;
    min-width: 0;
    height: 86px;
    padding: 9px 4px;
    gap: 6px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    color: var(--text-color);
    background: var(--card-background) !important;
    box-shadow: 0 8px 22px rgba(37, 40, 72, 0.045);
    font-size: 12px;
  }

  .mobile-today__capture-action:active,
  .mobile-today__capture-action:focus-visible {
    border-color: var(--capture-accent, var(--primary-color));
    outline: none;
  }

  .mobile-today__capture-icon {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    margin-inline: auto;
    border: 1px solid var(--surface-border-color);
    border-radius: 11px;
    color: var(--capture-accent, var(--primary-color));
    background: var(--card-background);
    line-height: 0;
  }

  /* 图标是 column flex 的子项，不锁定收缩会被压扁成一条（实测 22px 只剩 9px） */
  .mobile-today__capture-action :deep(.icon-base64),
  .mobile-today__capture-action :deep(svg) {
    flex: 0 0 auto;
  }

  .mobile-today__capture-action.is-note {
    --capture-accent: var(--resource-note-color, #00a884);
  }

  .mobile-today__capture-action.is-note .mobile-today__capture-icon {
    border-color: color-mix(in srgb, var(--resource-note-color, #00a884) 18%, var(--surface-border-color));
    background: color-mix(in srgb, var(--resource-note-color, #00a884) 11%, var(--card-background));
  }

  .mobile-today__capture-action.is-bookmark {
    --capture-accent: var(--resource-bookmark-color, #615ced);
  }

  .mobile-today__capture-action.is-bookmark .mobile-today__capture-icon {
    border-color: color-mix(in srgb, var(--resource-bookmark-color, #615ced) 18%, var(--surface-border-color));
    background: color-mix(in srgb, var(--resource-bookmark-color, #615ced) 11%, var(--card-background));
  }

  .mobile-today__capture-action.is-file {
    --capture-accent: var(--resource-file-color, #ff8a00);
  }

  .mobile-today__capture-action.is-file .mobile-today__capture-icon {
    border-color: color-mix(in srgb, var(--resource-file-color, #ff8a00) 18%, var(--surface-border-color));
    background: color-mix(in srgb, var(--resource-file-color, #ff8a00) 11%, var(--card-background));
  }

  .mobile-today__capture-action.is-todo {
    --capture-accent: var(--todo-accent-color, #0ea5e9);
  }

  .mobile-today__capture-action.is-todo .mobile-today__capture-icon {
    border-color: color-mix(in srgb, var(--todo-accent-color, #0ea5e9) 18%, var(--surface-border-color));
    background: color-mix(in srgb, var(--todo-accent-color, #0ea5e9) 11%, var(--card-background));
  }

  .mobile-today__capture-action > span:last-child {
    color: var(--text-color);
  }

  .mobile-today__continue {
    margin-top: 14px;
  }

  .mobile-today__continue-head {
    margin-bottom: 8px;
    padding: 0 2px;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }

  .mobile-today__continue-head strong {
    font-size: 14px;
  }

  .mobile-today__continue-head span {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--desc-color);
    font-size: 11px;
  }

  .mobile-today__continue-list {
    overflow: hidden;
    padding: 0 11px;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--card-background);
    box-shadow: 0 8px 22px rgba(37, 40, 72, 0.04);
  }

  .mobile-today__continue-item {
    width: 100%;
    min-height: 60px;
    padding: 10px 1px;
    gap: 10px;
    justify-content: flex-start;
    border: 0;
    border-radius: 0;
    color: var(--text-color);
    background: transparent !important;
    text-align: left;
  }

  .mobile-today__continue-item + .mobile-today__continue-item {
    border-top: 1px solid var(--surface-divider-color);
  }

  .mobile-today__continue-icon {
    width: 30px;
    height: 30px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    border-radius: 9px;
  }

  .mobile-today__continue-icon.is-note {
    color: var(--resource-note-color);
    background: color-mix(in srgb, var(--resource-note-color) 12%, transparent);
  }

  .mobile-today__continue-icon.is-file {
    color: var(--resource-file-color);
    background: color-mix(in srgb, var(--resource-file-color) 12%, transparent);
  }

  .mobile-today__continue-main {
    min-width: 0;
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .mobile-today__continue-main strong {
    display: block;
    max-width: 100%;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 14px;
    font-weight: 600;
    line-height: 1.35;
  }

  .mobile-today__continue-main small {
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.3;
  }
</style>
