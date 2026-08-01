<template>
  <!--
    移动端「今日」。

    它只回答「我今天先做什么、有哪些资料还没整理」，不是统计工作台：
    资源总量、增长趋势、文件类型分布、常用标签排行和最近更新都留在桌面工作台。
  -->
  <div class="mobile-today" data-mobile-resource-scroll>
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
          @click="openSummaryItem(item.key)"
          v-click-log="{ module: '今日', operation: `查看${item.label}` }"
        >
          <strong>{{ item.value }}</strong>
          <span>{{ item.label }}</span>
        </BButton>
      </div>
      <div class="mobile-today__pending-details">
        <TodayActionSection
          :todo-total="counts.overdue + counts.dueToday"
          :inbox-total="counts.inbox"
          :overdue-todos="overdueTodos"
          :due-today-todos="dueTodayTodos"
          :inbox-items="inboxItems"
          :loading="loading"
          :show-header="false"
          @refresh="loadToday"
        />
      </div>
    </section>

    <section v-if="showDailyGrowthTasks" class="mobile-today__growth">
      <DailyQuests
        :quests="dailyGrowthQuests"
        :bonus="dailyGrowthBonus"
        :claiming="claimingDailyGrowth"
        :read-only="growthReadOnly"
        @claim="claimDailyGrowth"
      />
    </section>

    <section v-if="showGrowthTasks" class="mobile-today__growth">
      <GrowthTasks :data="growthTasks" compact :max-visible="3" show-view-all @view="openGrowthTasks" />
    </section>

    <section class="mobile-today__capture">
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
          <SvgIcon :src="action.icon" size="22" aria-hidden="true" />
          <span>{{ action.label }}</span>
        </BButton>
      </div>
    </section>

    <section v-if="continueItems.length" class="mobile-today__continue">
      <div class="mobile-today__continue-head">
        <strong>{{ t('workbench.mobileToday.continueTitle') }}</strong>
        <span>{{ t('workbench.mobileToday.continueHint') }}</span>
      </div>
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
  const { dashboard, growthTasks, loadDashboard, loadGrowthTasks, claimDailyBonus } = useGrowth();
  const growthReadOnly = computed(() => Boolean(user.adminContext));
  const dailyGrowthQuests = computed(() => dashboard.value?.quests || []);
  const dailyGrowthBonus = computed(() => dashboard.value?.questBonus || { exp: 0, claimed: false, claimable: false });
  const showDailyGrowthTasks = computed(() => Boolean(dashboard.value && dashboard.value.questsEnabled !== false));
  const claimingDailyGrowth = ref(false);
  const showGrowthTasks = computed(() => Boolean(growthTasks.value?.tasks.some((task) => !task.completed)));

  async function claimDailyGrowth() {
    if (growthReadOnly.value || claimingDailyGrowth.value) return;
    claimingDailyGrowth.value = true;
    try {
      const res = await claimDailyBonus();
      if (res?.status === 200 && res.data?.ok) {
        if (res.data.already) {
          message.info(t('growth.questClaimedAlready'));
        } else if (res.data.capped) {
          message.info(t('growth.questCapped'));
        } else {
          const points = res.data.pointsEarned || 0;
          message.success(
            points > 0
              ? t('growth.questClaimOkPts', { n: res.data.expGained, p: points })
              : t('growth.questClaimOk', { n: res.data.expGained }),
          );
          recordOperation({
            module: '工作台',
            operation: `领取每日任务奖励（经验+${res.data.expGained}、积分+${points}）`,
          });
        }
      }
    } catch (error) {
      console.error('今日领取每日奖励失败:', error);
    } finally {
      claimingDailyGrowth.value = false;
    }
  }

  const loading = ref(false);
  const loadFailed = ref(false);
  const overdueTodos = ref<TodoItem[]>([]);
  const dueTodayTodos = ref<TodoItem[]>([]);
  const inboxItems = ref<TodayInboxItem[]>([]);
  const continueItems = ref<TodayContinueItem[]>([]);
  const counts = ref({ overdue: 0, dueToday: 0, inbox: 0, todoPending: 0 });

  const dateLabel = computed(() =>
    new Intl.DateTimeFormat(locale.value, { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date()),
  );

  const greetingLine = computed(() => {
    const hour = new Date().getHours();
    const greeting =
      hour < 11
        ? t('workbench.mobileToday.greetingMorning')
        : hour < 13
          ? t('workbench.mobileToday.greetingNoon')
          : hour < 18
            ? t('workbench.mobileToday.greetingAfternoon')
            : t('workbench.mobileToday.greetingEvening');
    // 摘要只算需要今天处理的事，不把「以后到期」的待办也算进来吓人
    const pending = counts.value.overdue + counts.value.dueToday + counts.value.inbox;
    const tail = pending
      ? t('workbench.mobileToday.pendingSummary', { count: pending })
      : t('workbench.mobileToday.pendingSummaryEmpty');
    return `${greeting}，${tail}`;
  });

  const summaryItems = computed(() => [
    { key: 'overdue' as const, label: t('workbench.mobileToday.overdue'), value: counts.value.overdue },
    { key: 'dueToday' as const, label: t('workbench.mobileToday.dueToday'), value: counts.value.dueToday },
    { key: 'inbox' as const, label: t('workbench.mobileToday.inbox'), value: counts.value.inbox },
  ]);

  // 移动端快速添加只覆盖书签/笔记/文件；待办按既有约定从待办模块新建
  const captureActions = computed(() => [
    {
      key: 'note' as const,
      type: 'note' as ActionCaptureType,
      label: t('workbench.mobileToday.captureNote'),
      icon: icon.resource.note,
    },
    {
      key: 'todo' as const,
      type: null,
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

  function openSummaryItem(key: 'overdue' | 'dueToday' | 'inbox') {
    goToTodo(key === 'inbox' ? 'all' : 'todo');
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
    void router.push(item.route);
  }

  function runCapture(action: { type: ActionCaptureType | null }) {
    if (blockGuestWrite('today-capture', t('inbox.guestPrompt'))) return;
    if (!action.type) {
      goToTodo('todo');
      return;
    }
    inbox.openQuickCapture(action.type);
  }

  async function loadToday() {
    if (loading.value) return;
    loading.value = true;
    loadFailed.value = false;
    try {
      const res = await apiBasePost('/api/workbench/today', {}, { silent: true });
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
      };
      // 底部导航角标与今日摘要共用同一份计数，避免两处数字不一致
      inbox.pendingTotal = counts.value.inbox;
      inbox.todoPendingTotal = counts.value.todoPending;
    } catch {
      loadFailed.value = true;
    } finally {
      loading.value = false;
    }
  }

  // 账号切换后必须重新取数，不能把上一个账号的待办留在屏幕上
  watch(
    () => user.id,
    () => {
      overdueTodos.value = [];
      dueTodayTodos.value = [];
      inboxItems.value = [];
      continueItems.value = [];
      counts.value = { overdue: 0, dueToday: 0, inbox: 0, todoPending: 0 };
      if (user.id) void loadToday();
    },
  );

  onMounted(() => {
    void loadToday();
    void loadDashboard();
    void loadGrowthTasks();
  });

  onActivated(() => {
    if (dashboard.value) void loadDashboard();
    if (growthTasks.value) void loadGrowthTasks(true);
  });
</script>

<style scoped lang="less">
  .mobile-today {
    width: 100%;
    height: 100%;
    padding: 14px 12px calc(18px + env(safe-area-inset-bottom));
    box-sizing: border-box;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    color: var(--text-color);
  }

  .mobile-today__head {
    margin-bottom: 14px;
  }

  .mobile-today__growth {
    margin: 12px 0;
    padding: 13px;
    border: 1px solid color-mix(in srgb, var(--primary-color) 16%, var(--card-border-color));
    border-radius: 14px;
    background: var(--menu-body-bg-color, var(--background-color));
  }

  .mobile-today__pending {
    margin-bottom: 14px;
    padding: 12px;
    border: 1px solid color-mix(in srgb, var(--primary-color) 24%, var(--card-border-color));
    border-radius: 14px;
    background: var(--card-background);
    box-shadow: 0 8px 24px -22px color-mix(in srgb, var(--primary-color) 60%, transparent);
  }

  .mobile-today__pending-head {
    display: grid;
    gap: 3px;
    margin-bottom: 10px;
  }

  .mobile-today__pending-head strong {
    font-size: 15px;
    font-weight: 700;
  }

  .mobile-today__pending-head span {
    color: var(--desc-color);
    font-size: 11px;
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
    gap: 8px;
  }

  .mobile-today__pending-details {
    margin-top: 10px;
  }

  .mobile-today__summary-item {
    /* BButton 默认按内容收缩，在 grid 里必须显式撑满，否则三格宽度不一致；
       column 主轴还要显式居中，否则数字会贴着卡片上边。 */
    width: 100%;
    min-width: 0;
    height: 74px;
    padding: 12px 8px;
    gap: 5px;
    flex-direction: column;
    justify-content: center;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    color: var(--text-color);
    background: var(--card-background) !important;
  }

  .mobile-today__summary-item strong {
    font-size: 19px;
    font-weight: 720;
    line-height: 1.1;
  }

  .mobile-today__summary-item span {
    color: var(--desc-color);
    font-size: 11px;
  }

  .mobile-today__summary-item.is-overdue strong {
    color: var(--danger-color, #e5484d);
  }

  .mobile-today__summary-item.is-dueToday strong {
    color: var(--primary-color);
  }

  .mobile-today__summary-item.is-inbox strong {
    color: var(--resource-file-color);
  }

  .mobile-today__capture {
    margin-bottom: 14px;
    padding: 12px;
    border: 1px solid color-mix(in srgb, var(--primary-color) 30%, transparent);
    border-radius: 14px;
    background: color-mix(in srgb, var(--primary-color) 6%, var(--card-background));
  }

  .mobile-today__capture-head {
    margin-bottom: 10px;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }

  .mobile-today__capture-head strong {
    font-size: 14px;
  }

  .mobile-today__capture-head span {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--desc-color);
    font-size: 11px;
  }

  .mobile-today__capture-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }

  .mobile-today__capture-action {
    width: 100%;
    min-width: 0;
    height: 72px;
    padding: 12px 4px;
    gap: 7px;
    flex-direction: column;
    justify-content: center;
    border-radius: 11px;
    color: var(--text-color);
    background: var(--card-background) !important;
    font-size: 11px;
  }

  /* 图标是 column flex 的子项，不锁定收缩会被压扁成一条（实测 22px 只剩 9px） */
  .mobile-today__capture-action :deep(.icon-base64),
  .mobile-today__capture-action :deep(svg) {
    flex: 0 0 auto;
  }

  .mobile-today__capture-action.is-note {
    color: var(--resource-note-color);
  }

  .mobile-today__capture-action.is-bookmark {
    color: var(--resource-bookmark-color);
  }

  .mobile-today__capture-action.is-file {
    color: var(--resource-file-color);
  }

  .mobile-today__capture-action.is-todo {
    color: var(--primary-color);
  }

  .mobile-today__capture-action span {
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

  .mobile-today__continue-item {
    width: 100%;
    min-height: 60px;
    padding: 12px;
    gap: 10px;
    justify-content: flex-start;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    color: var(--text-color);
    background: var(--card-background) !important;
    text-align: left;
  }

  .mobile-today__continue-item + .mobile-today__continue-item {
    margin-top: 8px;
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
