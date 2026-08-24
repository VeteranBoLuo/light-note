<template>
  <div class="workbenches-container">
    <div class="workbench-shell">
      <header class="workbench-header">
        <div class="workbench-heading">
          <div class="workbench-title-row">
            <span class="workbench-title-accent" aria-hidden="true"></span>
            <h1>
              <BButton
                class="workbench-title-action"
                role="button"
                tabindex="0"
                @click="refreshWorkbench"
                @keydown.enter="refreshWorkbench"
                @keydown.space.prevent="refreshWorkbench"
              >
                {{ t('workbench.title') }}
              </BButton>
            </h1>
          </div>
          <p>{{ t('workbench.subtitle') }}</p>
          <small class="workbench-data-scope">
            {{ t('workbench.meta.todayRange') }}
            <span class="workbench-data-updated" :aria-busy="!lastUpdatedAt" aria-live="polite">
              ·
              {{ lastUpdatedAt ? t('workbench.meta.lastUpdated', { time: lastUpdatedAt }) : t('common.loading') }}
            </span>
          </small>
        </div>
        <div class="header-actions">
          <BButton type="primary" class="capture-button" @click="openQuickCapture('note')">
            <SvgIcon :src="icon.common.add" size="17" />
            <span>{{ t('workbench.header.quickCapture') }}</span>
          </BButton>
        </div>
      </header>

      <div v-if="workbenchError" class="workbench-error" role="alert" aria-live="assertive">
        <div>
          <strong>{{ t('common.requestFailed') }}</strong>
          <span>{{ workbenchError.message }}</span>
          <small v-if="workbenchError.requestId">
            {{ t('common.requestIdLabel') }}: {{ workbenchError.requestId }}
          </small>
        </div>
        <BButton size="small" :loading="loadingWorkbench" @click="refreshWorkbench">
          {{ t('common.retry') }}
        </BButton>
      </div>

      <!--
        这一块统计的是「全部未完成待办 + 全部待整理」，不是今天的范围，所以标题用
        「待处理总览」而不是「今日待处理」—— 后者会让人以为它该等于顶栏待办角标
        （逾期 + 今天）。统计口径不变，只收口用户可见文案。
        内部命名沿用 todaySummary*，留给后续专门的工作台命名重构，不在此处机械改名。
      -->
      <section class="workbench-first-fold">
        <section class="today-summary" :aria-label="t('workbench.panel.actionOverview')">
          <div class="today-summary-heading">
            <span class="today-summary-heading__icon" aria-hidden="true">
              <SvgIcon :src="icon.noteDetail.toolbar.todo" size="22" />
            </span>
            <span class="today-summary-heading__copy">
              <strong>{{ t('workbench.panel.actionOverview') }}</strong>
              <small>{{ t('workbench.panel.actionOverviewHint') }}</small>
            </span>
            <span class="today-summary-total">
              <strong>{{ displayCount(inbox.actionTotal) }}</strong>
              <small>{{ t('workbench.today.actionTotalUnit') }}</small>
            </span>
          </div>
          <div class="today-summary-grid">
            <BButton
              v-for="item in todaySummaryItems"
              :key="item.key"
              class="today-summary-item"
              :class="`today-summary-item--${item.key}`"
              @click="openTodaySummaryItem(item.key)"
            >
              <span class="today-summary-item__icon" aria-hidden="true">
                <SvgIcon :src="item.icon" size="17" />
              </span>
              <span class="today-summary-item__copy">
                <span>{{ item.label }}</span>
                <small>{{ item.hint }}</small>
              </span>
              <strong>{{ item.value }}</strong>
            </BButton>
          </div>
          <div class="today-summary-body">
            <div class="today-summary-details">
              <!-- 只传待整理总数：summary 接口的 todoPendingTotal 是「全部未完成」，
                 不是这里展示的「逾期 + 今天」，传错反而误导；待办计数回落到明细条数。 -->
              <TodayActionSection
                :inbox-total="todayStats.inboxPendingTotal"
                :overdue-todos="todayOverdueTodos"
                :due-today-todos="todayDueTodos"
                :inbox-items="todayInboxItems"
                :loading="summaryLoading"
                :show-header="false"
                contained
                @refresh="fetchWorkbenchSummary"
              />
            </div>

            <article class="today-continue">
              <div class="panel-header today-continue__header">
                <div>
                  <h2>{{ t('workbench.panel.continueWorking') }}</h2>
                  <p>{{ t('workbench.panel.continueHint') }}</p>
                </div>
                <BButton size="small" class="quiet-button" @click="openActiveCollection">
                  {{ t('workbench.panel.viewAll') }}
                </BButton>
              </div>

              <BTabs v-model:active-tab="activeContinueTab" variant="pill" :options="continueTabOptions" />

              <div v-if="summaryLoading" class="content-list content-list--loading content-list--distributed">
                <div
                  v-for="index in CONTINUE_ITEM_LIMIT"
                  :key="`content-skeleton-${index}`"
                  class="content-skeleton-row"
                >
                  <span class="skeleton-block skeleton-row-icon"></span>
                  <span class="content-skeleton-copy">
                    <span class="skeleton-block content-skeleton-title"></span>
                    <span class="skeleton-block content-skeleton-subtitle"></span>
                  </span>
                  <span class="skeleton-block skeleton-row-meta"></span>
                </div>
              </div>
              <div
                v-else-if="activeContinueItems.length"
                class="content-list"
                :class="{ 'content-list--distributed': activeContinueItems.length === CONTINUE_ITEM_LIMIT }"
              >
                <BButton
                  v-for="item in activeContinueItems"
                  :key="item.key"
                  class="content-row"
                  @click="openContinueItem(item)"
                >
                  <span class="content-row-icon" :class="`content-row-icon--${item.type}`">
                    <SvgIcon :src="item.icon" size="18" />
                  </span>
                  <span class="content-row-main">
                    <strong>{{ item.title }}</strong>
                    <span>{{ item.description }}</span>
                  </span>
                  <span class="content-row-meta">{{ item.meta }}</span>
                </BButton>
              </div>
              <div v-else class="compact-empty compact-empty--continue">
                <strong>{{ t('workbench.empty.continueTitle') }}</strong>
                <span>{{ t('workbench.empty.continueDesc') }}</span>
              </div>
            </article>
          </div>
        </section>

        <aside class="workbench-first-fold__rail" :aria-label="t('workbench.panel.quickCreate')">
          <article class="panel-card quick-create-panel">
            <div class="panel-header">
              <div>
                <h2>{{ t('workbench.panel.quickCreate') }}</h2>
                <p>{{ t('workbench.panel.quickCreateHint') }}</p>
              </div>
            </div>
            <div class="quick-create-grid">
              <BButton
                v-for="action in quickCreateActions"
                :key="action.key"
                class="quick-create-action"
                @click="openQuickCapture(action.type)"
              >
                <span class="quick-create-icon" :class="`quick-create-icon--${action.key}`">
                  <SvgIcon :src="action.icon" size="19" />
                </span>
                <span>
                  <strong>{{ action.label }}</strong>
                  <small>{{ action.desc }}</small>
                </span>
              </BButton>
            </div>
          </article>
          <WorkbenchGrowth expanded />
        </aside>
      </section>

      <section v-if="growthSectionLoading" class="growth-task-grid growth-task-grid--loading" aria-hidden="true">
        <article v-for="panel in 2" :key="`growth-panel-skeleton-${panel}`" class="panel-card growth-panel-skeleton">
          <div class="growth-panel-skeleton__header">
            <span class="skeleton-block growth-panel-skeleton__title"></span>
            <span class="skeleton-block growth-panel-skeleton__count"></span>
          </div>
          <span class="skeleton-block growth-panel-skeleton__bar"></span>
          <span class="skeleton-block growth-panel-skeleton__hint"></span>
          <div class="growth-panel-skeleton__list">
            <span v-for="row in panel === 1 ? 3 : 2" :key="row" class="growth-panel-skeleton__row">
              <span class="skeleton-block growth-panel-skeleton__marker"></span>
              <span class="growth-panel-skeleton__copy">
                <span class="skeleton-block"></span>
                <span class="skeleton-block"></span>
              </span>
              <span class="skeleton-block growth-panel-skeleton__action"></span>
            </span>
          </div>
          <span class="skeleton-block growth-panel-skeleton__footer"></span>
        </article>
      </section>

      <section
        v-else-if="showDailyGrowthTasks || showGrowthTasks"
        class="growth-task-grid"
        :class="{ 'growth-task-grid--single': !showDailyGrowthTasks || !showGrowthTasks }"
        :aria-label="t('growth.pageTitle')"
      >
        <article v-if="showDailyGrowthTasks" class="panel-card today-growth-panel">
          <DailyQuests
            :quests="dailyGrowthQuests"
            :bonus="dailyGrowthBonus"
            :read-only="growthReadOnly"
            :show-claim-action="false"
          />
        </article>

        <article v-if="showGrowthTasks" class="panel-card today-growth-panel">
          <GrowthTasks
            :data="growthTasks"
            compact
            :max-visible="2"
            show-view-all
            :read-only="growthReadOnly"
            @view="openGrowthTasks"
          />
        </article>
      </section>

      <section class="primary-grid" :aria-label="t('workbench.panel.resourceOverview')">
        <section class="summary-grid">
          <template v-if="summaryLoading">
            <div v-for="index in 4" :key="`summary-skeleton-${index}`" class="summary-card summary-skeleton">
              <div class="summary-skeleton__header">
                <span class="skeleton-block skeleton-icon"></span>
                <span class="skeleton-block skeleton-label"></span>
              </div>
              <span class="skeleton-block skeleton-value"></span>
              <div class="summary-skeleton__stats">
                <span class="skeleton-block skeleton-stat"></span>
                <span class="skeleton-block skeleton-stat"></span>
              </div>
              <span class="skeleton-block skeleton-meta"></span>
            </div>
          </template>
          <RouterLink
            v-for="card in summaryCards"
            v-else
            :key="card.key"
            :to="card.to"
            class="summary-card"
            :class="`summary-card--${card.key}`"
            @click="recordSummaryNavigation(card.label)"
          >
            <div class="summary-card__header">
              <span class="summary-icon">
                <SvgIcon :src="card.icon" size="22" />
              </span>
              <span class="summary-heading-copy">
                <strong class="summary-label">{{ card.label }}</strong>
                <span class="summary-meta">{{ card.meta }}</span>
              </span>
              <span class="summary-arrow" aria-hidden="true">
                <SvgIcon :src="icon.arrow_right" size="16" />
              </span>
            </div>

            <div class="summary-card__metric">
              <strong class="summary-value">
                <span>{{ card.value.toLocaleString() }}</span>
                <small>{{ card.unit }}</small>
              </strong>
              <div class="summary-stats">
                <span v-for="stat in card.stats" :key="stat.label" class="summary-stat">
                  <small>{{ stat.label }}</small>
                  <strong>{{ stat.value }}</strong>
                </span>
              </div>
            </div>

            <div class="summary-progress">
              <div class="summary-progress__track" aria-hidden="true">
                <span :style="{ width: `${card.progress}%` }"></span>
              </div>
              <div class="summary-progress__footer">
                <span>{{ card.progressLabel }}</span>
                <strong>{{ t('workbench.summary.openModule') }}</strong>
              </div>
            </div>
          </RouterLink>
        </section>
      </section>

      <section class="analytics-section">
        <WorkbenchCharts
          :loading="summaryLoading"
          :theme-key="user.currentTheme || 'day'"
          :trend-data="trendChartData"
          :file-type-data="fileTypeChartData"
          @open-files="openQuickCapture('file')"
        />
      </section>

      <section class="lower-grid">
        <article class="panel-card hot-tags-panel">
          <div class="panel-header">
            <div>
              <h2>{{ t('workbench.panel.popularTags') }}</h2>
              <p>{{ t('workbench.panel.popularTagsHint') }}</p>
            </div>
            <BButton size="small" class="quiet-button" @click="router.push('/manage/tagMg')">
              {{ t('workbench.panel.manageTags') }}
            </BButton>
          </div>

          <div v-if="summaryLoading" class="tag-list tag-list--loading">
            <span
              v-for="index in HOT_TAG_LIMIT"
              :key="`tag-skeleton-${index}`"
              class="skeleton-block tag-skeleton"
            ></span>
          </div>
          <div v-else-if="topHotTags.length" class="tag-list">
            <BButton
              v-for="tag in topHotTags"
              :key="tag.id || tag.name"
              class="tag-row"
              @click="handleHotTagClick(tag)"
            >
              <span class="tag-rank">{{ tag.index }}</span>
              <span class="tag-name">{{ tag.name }}</span>
              <span class="tag-resource-count">
                {{ t('workbench.meta.resourceCount', { count: Number(tag.resourceTotal || 0) }) }}
              </span>
            </BButton>
          </div>
          <div v-else class="compact-empty compact-empty--small">
            <strong>{{ t('workbench.empty.tagsTitle') }}</strong>
            <span>{{ t('workbench.empty.tagsDesc') }}</span>
          </div>
        </article>

        <article class="panel-card latest-update-panel">
          <div class="panel-header">
            <div>
              <h2>{{ t('workbench.panel.latestUpdate') }}</h2>
              <p>{{ t('workbench.panel.latestUpdateHint') }}</p>
            </div>
            <BButton size="small" class="quiet-button" @click="openUpdateLogs">
              {{ t('workbench.panel.viewAll') }}
              <SvgIcon :src="icon.arrow_right" size="13" aria-hidden="true" />
            </BButton>
          </div>

          <div v-if="updateLogsLoading" class="update-skeleton">
            <span class="skeleton-block skeleton-update-title"></span>
            <span class="skeleton-block"></span>
            <span class="skeleton-block skeleton-update-short"></span>
          </div>
          <div v-else-if="latestUpdateLog" class="latest-update-content">
            <div class="latest-update-title">
              <span class="update-dot"></span>
              <strong>{{ latestUpdateLog.title || latestUpdateLog.label || t('workbench.logs.latest') }}</strong>
              <BChip class="latest-update-badge" tone="pin" size="small">
                {{ t('workbench.logs.latest') }}
              </BChip>
              <time>{{ latestUpdateLog.publishDate || latestUpdateLog.time || '-' }}</time>
            </div>
            <div v-if="latestUpdateItems.length" class="latest-update-items">
              <div
                v-for="(item, index) in latestUpdateItems"
                :key="`latest-update-${index}`"
                class="latest-update-item"
              >
                <span>{{ index + 1 }}</span>
                <p>{{ item }}</p>
              </div>
            </div>
          </div>
          <div v-else class="compact-empty compact-empty--small">
            <strong>{{ t('workbench.logs.empty') }}</strong>
          </div>
        </article>
      </section>

      <FilePreview v-model:visible="fileVisible" :file-info="activeFile" @close="fileVisible = false" />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed, defineAsyncComponent, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import { apiBasePost } from '@/http/request.ts';
  import { openBookmarkUrl } from '@/utils/openBookmark.ts';
  import { listUpdateLogs, updateLogMarkdownSummaryItems, type UpdateLogItem } from '@/api/updateLogApi.ts';
  import { cloudSpaceStore, inboxStore, useUserStore } from '@/store';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import TodayActionSection from '@/components/workbenches/TodayActionSection.vue';
  import WorkbenchCharts from '@/components/workbenches/WorkbenchCharts.vue';
  import WorkbenchGrowth from '@/components/workbenches/WorkbenchGrowth.vue';
  import DailyQuests from '@/components/growth/DailyQuests.vue';
  import GrowthTasks from '@/components/growth/GrowthTasks.vue';
  import icon from '@/config/icon.ts';
  import { CLOUD_FILE_CATEGORY_LABEL_KEY } from '@/constants/cloudFileCategory.ts';
  import { formatStorageSize } from '@/utils/common.ts';
  import { recordOperation } from '@/api/commonApi.ts';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';
  import { blockGuestWrite } from '@/composables/useGuestGuard.ts';
  import { useGrowth } from '@/composables/useGrowth.ts';
  import { useForegroundRefresh } from '@/composables/useForegroundRefresh';
  import type { ActionCaptureType } from '@/store/inbox.ts';
  import { openNotificationPanel } from '@/utils/notificationEntry';

  type ContinueTab = 'notes' | 'files' | 'bookmarks';
  type ContinueItemType = 'note' | 'file' | 'bookmark';

  interface ContinueItem {
    key: string;
    type: ContinueItemType;
    title: string;
    description: string;
    meta: string;
    icon: string;
    raw: any;
  }

  const FilePreview = defineAsyncComponent(() => import('@/components/FilePreview.vue'));
  const { t } = useI18n();
  const router = useRouter();
  const user = useUserStore();
  const cloud = cloudSpaceStore();
  const inbox = inboxStore();
  const { growth, dashboard, dashboardLoading, growthTasks, growthTasksLoading, loadDashboard, loadGrowthTasks } =
    useGrowth();
  const growthReadOnly = computed(() => Boolean(user.adminContext));
  const dailyGrowthQuests = computed(() => dashboard.value?.quests || []);
  const dailyGrowthBonus = computed(
    () => dashboard.value?.questBonus || { exp: 0, points: 0, claimed: false, claimable: false },
  );
  // 工作台只承载今天仍需处理的任务：领取统一由上方成长卡的一键领取处理，领取后隐藏任务卡。
  const showDailyGrowthTasks = computed(() => Boolean(dashboard.value && !dailyGrowthBonus.value.claimed));
  const showGrowthTasks = computed(() => Boolean(growthTasks.value?.tasks.some((task) => !task.claimed)));
  const growthSectionLoading = computed(
    () => (dashboardLoading.value && !dashboard.value) || (growthTasksLoading.value && !growthTasks.value),
  );

  const loadingWorkbench = ref(true);
  const loadingUpdateLogs = ref(true);
  const summaryLoading = computed(() => loadingWorkbench.value);
  const updateLogsLoading = computed(() => loadingUpdateLogs.value);
  const workbenchError = ref<{ message: string; requestId?: string } | null>(null);

  const workbenchCounts = ref({
    bookmarkTotal: 0,
    tagTotal: 0,
    noteTotal: 0,
    fileTotal: 0,
    usedSpace: 0,
    trashFileSize: 0,
  });
  const weeklyStats = ref({ bookmark: 0, note: 0, file: 0, tag: 0 });
  const todayStats = ref({
    actionTotal: 0,
    todoPendingTotal: 0,
    unreadNotificationTotal: 0,
    inboxPendingTotal: 0,
  });
  const todayOverdueTodos = ref<any[]>([]);
  const todayDueTodos = ref<any[]>([]);
  const todayInboxItems = ref<any[]>([]);
  const generatedAt = ref('');
  const quickActionUsage = ref<Record<string, number>>(readQuickActionUsage());
  const trendSummary = ref<any[]>([]);
  const fileTypeSummary = ref<any[]>([]);
  const commonBookmarkTable = ref<any[]>([]);
  const hotTagTable = ref<any[]>([]);
  const recentNoteTable = ref<any[]>([]);
  const recentFileTable = ref<any[]>([]);
  const updateLogList = ref<UpdateLogItem[]>([]);
  const activeContinueTab = ref<ContinueTab>('notes');
  const fileVisible = ref(false);
  const activeFile = ref<any>(null);

  const maxSpaceMb = computed(() => growth.value?.spaceMb || cloud.maxSpace || 1024);
  const storagePercent = computed(() => {
    if (!maxSpaceMb.value) return 0;
    return Math.min(100, Number(((cloud.usedSpace / maxSpaceMb.value) * 100).toFixed(1)));
  });

  const primaryResourceTotal = computed(
    () => workbenchCounts.value.bookmarkTotal + workbenchCounts.value.noteTotal + workbenchCounts.value.fileTotal,
  );
  const summaryTopTag = computed(() => hotTagTable.value[0] || null);

  function resourceShare(value: number) {
    if (!primaryResourceTotal.value) return 0;
    return Math.min(100, Math.round((Number(value || 0) / primaryResourceTotal.value) * 100));
  }

  const summaryCards = computed(() => [
    {
      key: 'bookmark',
      label: t('workbench.summary.bookmarkTotal'),
      value: workbenchCounts.value.bookmarkTotal,
      unit: t('workbench.summary.itemUnit'),
      meta: t('workbench.summary.bookmarkMeta'),
      stats: [
        {
          label: t('workbench.summary.weeklyAdded'),
          value: `+${Number(weeklyStats.value.bookmark || 0)}`,
        },
        {
          label: t('workbench.summary.resourceShare'),
          value: `${resourceShare(workbenchCounts.value.bookmarkTotal)}%`,
        },
      ],
      progress: resourceShare(workbenchCounts.value.bookmarkTotal),
      progressLabel: t('workbench.summary.resourceShareDetail', {
        percent: resourceShare(workbenchCounts.value.bookmarkTotal),
      }),
      icon: icon.resource.bookmark,
      to: '/home',
    },
    {
      key: 'note',
      label: t('workbench.summary.noteTotal'),
      value: workbenchCounts.value.noteTotal,
      unit: t('workbench.summary.itemUnit'),
      meta: t('workbench.summary.noteMeta'),
      stats: [
        {
          label: t('workbench.summary.weeklyUpdated'),
          value: `+${Number(weeklyStats.value.note || 0)}`,
        },
        {
          label: t('workbench.summary.resourceShare'),
          value: `${resourceShare(workbenchCounts.value.noteTotal)}%`,
        },
      ],
      progress: resourceShare(workbenchCounts.value.noteTotal),
      progressLabel: t('workbench.summary.resourceShareDetail', {
        percent: resourceShare(workbenchCounts.value.noteTotal),
      }),
      icon: icon.resource.note,
      to: '/noteLibrary',
    },
    {
      key: 'cloud',
      label: t('workbench.summary.cloudOverview'),
      value: workbenchCounts.value.fileTotal,
      unit: t('workbench.summary.fileUnit'),
      meta: t('workbench.summary.cloudMeta'),
      stats: [
        {
          label: t('workbench.summary.weeklyUploaded'),
          value: `+${Number(weeklyStats.value.file || 0)}`,
        },
        {
          label: t('workbench.summary.storageUsage'),
          value: `${storagePercent.value}%`,
        },
      ],
      progress: storagePercent.value,
      progressLabel: t('workbench.summary.cloudOverviewExtra', {
        used: formatStorageSize(cloud.usedSpace),
        total: formatStorageSize(maxSpaceMb.value),
        percent: storagePercent.value,
      }),
      icon: icon.resource.file,
      to: '/cloudSpace',
    },
    {
      key: 'tag',
      label: t('workbench.summary.tagTotal'),
      value: workbenchCounts.value.tagTotal,
      unit: t('workbench.summary.itemUnit'),
      meta: t('workbench.summary.tagMeta'),
      stats: [
        {
          label: t('workbench.summary.weeklyAdded'),
          value: `+${Number(weeklyStats.value.tag || 0)}`,
        },
        {
          label: t('workbench.summary.mostUsedTag'),
          value: summaryTopTag.value?.name || t('workbench.summary.noTopTag'),
        },
      ],
      progress: resourceShare(Number(summaryTopTag.value?.resourceTotal || 0)),
      progressLabel: summaryTopTag.value
        ? t('workbench.summary.topTagDetail', {
            name: summaryTopTag.value.name,
            count: Number(summaryTopTag.value.resourceTotal || 0),
          })
        : t('workbench.summary.noTagRelations'),
      icon: icon.resource.tag,
      to: '/manage/tagMg',
    },
  ]);

  const CONTINUE_ITEM_LIMIT = 5;
  const continueTabOptions = computed(() => [
    { key: 'notes', label: t('workbench.tabs.recentNotes'), badge: recentNoteTable.value.length },
    { key: 'files', label: t('workbench.tabs.recentFiles'), badge: recentFileTable.value.length },
    { key: 'bookmarks', label: t('workbench.tabs.frequentBookmarks'), badge: commonBookmarkTable.value.length },
  ]);

  const activeContinueItems = computed<ContinueItem[]>(() => {
    if (activeContinueTab.value === 'files') {
      return recentFileTable.value.slice(0, CONTINUE_ITEM_LIMIT).map((file) => ({
        key: `file-${file.id || file.fileName}`,
        type: 'file',
        title: file.fileName || t('workbench.table.fileName'),
        description: file.folderName || t('workbench.meta.cloudFile'),
        meta: `${formatDateLabel(file.uploadTime)} · ${formatStorageSize(Number(file.fileSizeMB || 0))}`,
        icon: icon.resource.file,
        raw: file,
      }));
    }
    if (activeContinueTab.value === 'bookmarks') {
      return commonBookmarkTable.value.slice(0, CONTINUE_ITEM_LIMIT).map((bookmark) => ({
        key: `bookmark-${bookmark.id || bookmark.name}`,
        type: 'bookmark',
        title: bookmark.name || t('workbench.table.bookmark'),
        description: bookmark.url || t('workbench.meta.savedBookmark'),
        meta: t('workbench.meta.visitCount', { count: Number(bookmark.count || 0) }),
        icon: icon.resource.bookmark,
        raw: bookmark,
      }));
    }
    return recentNoteTable.value.slice(0, CONTINUE_ITEM_LIMIT).map((note) => ({
      key: `note-${note.id || note.title}`,
      type: 'note',
      title: note.title || t('noteDetail.unnamedDoc'),
      description: t('workbench.meta.tagCount', { count: Number(note.tagCount || 0) }),
      meta: formatDateLabel(note.updateTime),
      icon: icon.resource.note,
      raw: note,
    }));
  });

  const quickCreateActions = computed(() =>
    [
      {
        key: 'bookmark',
        type: 'bookmark' as ActionCaptureType,
        label: t('workbench.actions.addBookmark.label'),
        desc: t('workbench.actions.addBookmark.desc'),
        icon: icon.resource.bookmark,
      },
      {
        key: 'note',
        type: 'note' as ActionCaptureType,
        label: t('workbench.actions.addNote.label'),
        desc: t('workbench.actions.addNote.desc'),
        icon: icon.resource.note,
      },
      {
        key: 'file',
        type: 'file' as ActionCaptureType,
        label: t('workbench.actions.uploadFile.label'),
        desc: t('workbench.actions.uploadFile.quickDesc'),
        icon: icon.resource.file,
      },
      {
        key: 'todo',
        type: 'todo' as ActionCaptureType,
        label: t('workbench.actions.addTodo.label'),
        desc: t('workbench.actions.addTodo.desc'),
        icon: icon.noteDetail.toolbar.todo,
      },
    ].sort((a, b) => Number(quickActionUsage.value[b.key] || 0) - Number(quickActionUsage.value[a.key] || 0)),
  );

  const todaySummaryItems = computed(() => [
    {
      key: 'todo',
      label: t('workbench.today.todoPending'),
      value: inbox.todoPendingTotal,
      hint: t('workbench.today.todoPendingHint'),
      icon: icon.noteDetail.toolbar.todo,
    },
    {
      key: 'inbox',
      label: t('workbench.today.inboxPending'),
      value: inbox.pendingTotal,
      hint: t('workbench.today.inboxPendingHint'),
      icon: icon.contextMenu.inbox,
    },
    {
      key: 'notification',
      label: t('workbench.today.unreadNotification'),
      value: todayStats.value.unreadNotificationTotal,
      hint: t('workbench.today.unreadNotificationHint'),
      icon: icon.settings.notification,
    },
  ]);
  const lastUpdatedAt = computed(() => {
    if (!generatedAt.value) return '';
    const date = new Date(generatedAt.value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(date);
  });

  function readQuickActionUsage() {
    try {
      const value = JSON.parse(localStorage.getItem('workbench-quick-action-usage') || '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch {
      return {};
    }
  }

  const trendChartData = computed(() => {
    const data: { date: string; type: string; value: number }[] = [];
    trendSummary.value.forEach((item) => {
      data.push({ date: item.date, type: t('workbench.chart.bookmark'), value: Number(item.bookmark || 0) });
      data.push({ date: item.date, type: t('workbench.chart.note'), value: Number(item.note || 0) });
      data.push({ date: item.date, type: t('workbench.chart.file'), value: Number(item.file || 0) });
    });
    return data;
  });

  const fileTypeChartData = computed(() =>
    fileTypeSummary.value.map((item) => ({
      type: t(CLOUD_FILE_CATEGORY_LABEL_KEY[item.category] || 'workbench.table.other'),
      value: Number(item.value || 0),
    })),
  );
  const HOT_TAG_LIMIT = 10;
  const LATEST_UPDATE_ITEM_LIMIT = 5;
  const topHotTags = computed(() => hotTagTable.value.slice(0, HOT_TAG_LIMIT));
  const latestUpdateLog = computed(() => updateLogList.value[0] || null);
  const latestUpdateItems = computed(() => {
    const item = latestUpdateLog.value;
    if (item?.contentMarkdown) return updateLogMarkdownSummaryItems(item.contentMarkdown, LATEST_UPDATE_ITEM_LIMIT);
    if (Array.isArray(item?.highlights)) return item.highlights.slice(0, LATEST_UPDATE_ITEM_LIMIT);
    return Array.isArray(item?.list) ? item.list.slice(0, LATEST_UPDATE_ITEM_LIMIT) : [];
  });

  function displayCount(value: number) {
    return value > 99 ? '99+' : String(Number(value || 0));
  }

  function formatDateLabel(value: string | number | undefined) {
    if (!value) return '-';
    const date = new Date(typeof value === 'string' ? value.replace(' ', 'T') : value);
    if (Number.isNaN(date.getTime())) return String(value);
    const now = new Date();
    const sameDay = date.toDateString() === now.toDateString();
    const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    if (sameDay) return t('workbench.meta.todayAt', { time });
    return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${time}`;
  }

  function recordSummaryNavigation(label: string) {
    recordOperation({ module: '工作台', operation: `查看${label}` });
  }

  function openTodaySummaryItem(key: string) {
    if (key === 'notification') {
      recordOperation({ module: '工作台', operation: '从今日待处理打开通知铃铛' });
      openNotificationPanel();
      return;
    }
    const tab = key === 'todo' ? 'todo' : 'all';
    recordOperation({
      module: '工作台',
      operation: key === 'todo' ? '从今日待处理查看未完成待办' : '从今日待处理查看待整理资源',
    });
    router.push({ path: '/inbox', query: { tab } });
  }

  function openGrowthTasks() {
    void router.push({ path: '/growth', hash: '#growth-tasks' });
  }

  function openQuickCapture(type: ActionCaptureType) {
    if (blockGuestWrite('workbench-quick-capture', t('inbox.guestPrompt'))) return;
    recordOperation(OPERATION_LOG_MAP.inbox.openCapture);
    quickActionUsage.value = { ...quickActionUsage.value, [type]: Date.now() };
    localStorage.setItem('workbench-quick-action-usage', JSON.stringify(quickActionUsage.value));
    inbox.openQuickCapture(type);
  }

  function openActiveCollection() {
    const routeMap: Record<ContinueTab, string> = {
      notes: '/noteLibrary',
      files: '/cloudSpace',
      bookmarks: '/manage/bookmarkMg',
    };
    router.push(routeMap[activeContinueTab.value]);
  }

  function openContinueItem(item: ContinueItem) {
    if (item.type === 'note') {
      recordOperation({ module: '工作台', operation: `查看近期笔记【${item.title}】` });
      router.push(
        item.raw?.id
          ? {
              path: `/noteLibrary/${item.raw.id}`,
              query: { from: router.currentRoute.value.fullPath },
            }
          : '/noteLibrary',
      );
      return;
    }
    if (item.type === 'file') {
      recordOperation({ module: '工作台', operation: `预览近期文件【${item.title}】` });
      activeFile.value = item.raw;
      fileVisible.value = true;
      return;
    }
    recordOperation({ module: '工作台', operation: `打开高频书签【${item.title}】` });
    if (item.raw?.url) {
      openBookmarkUrl(item.raw.url);
      return;
    }
    router.push('/home');
  }

  function handleHotTagClick(tag: any) {
    recordOperation({ module: '工作台', operation: `查看热门标签【${tag?.name || '未知标签'}】` });
    router.push(tag?.id ? `/tag/${tag.id}` : '/manage/tagMg');
  }

  function openUpdateLogs() {
    recordOperation(OPERATION_LOG_MAP.workbenches.moreLog);
    router.push('/updateLogs');
  }

  /**
   * silent: 回到前台的静默补刷 —— 不进骨架屏、失败不弹错误条(保留屏上旧数据),
   * 并把失败抛给调用方，让 useForegroundRefresh 保留陈旧计时、下次唤醒再试。
   * 用户点刷新按钮走的仍是非静默路径：主动操作要有 loading 和失败反馈。
   */
  async function fetchWorkbenchSummary(options: { silent?: boolean } = {}) {
    const silent = options.silent === true;
    if (!silent) {
      loadingWorkbench.value = true;
      workbenchError.value = null;
    }
    try {
      const res = await apiBasePost('/api/workbench/summary');
      if (res.status !== 200) {
        const failure = {
          message: res.msg || t('common.requestFailedDescription'),
          requestId: res.requestId,
        };
        if (silent) throw Object.assign(new Error(failure.message), { requestId: failure.requestId });
        workbenchError.value = failure;
        return;
      }
      const data = res.data || {};
      workbenchCounts.value = {
        bookmarkTotal: Number(data.counts?.bookmarkTotal || 0),
        tagTotal: Number(data.counts?.tagTotal || 0),
        noteTotal: Number(data.counts?.noteTotal || 0),
        fileTotal: Number(data.counts?.fileTotal || 0),
        usedSpace: Number(data.counts?.usedSpace || 0),
        trashFileSize: Number(data.counts?.trashFileSize || 0),
      };
      user.bookmarkTotal = workbenchCounts.value.bookmarkTotal;
      user.tagTotal = workbenchCounts.value.tagTotal;
      user.noteTotal = workbenchCounts.value.noteTotal;
      cloud.usedSpace = workbenchCounts.value.usedSpace;
      cloud.trashSpace = workbenchCounts.value.trashFileSize;
      cloud.activeSpace = Math.max(0, workbenchCounts.value.usedSpace - workbenchCounts.value.trashFileSize);
      weeklyStats.value = {
        bookmark: Number(data.weeklyStats?.bookmark || 0),
        note: Number(data.weeklyStats?.note || 0),
        file: Number(data.weeklyStats?.file || 0),
        tag: Number(data.weeklyStats?.tag || 0),
      };
      todayStats.value = {
        actionTotal: Number(data.today?.actionTotal || 0),
        todoPendingTotal: Number(data.today?.todoPendingTotal || 0),
        unreadNotificationTotal: Number(data.today?.unreadNotificationTotal || 0),
        inboxPendingTotal: Number(data.today?.inboxPendingTotal || 0),
      };
      todayOverdueTodos.value = Array.isArray(data.today?.overdueTodos) ? data.today.overdueTodos : [];
      todayDueTodos.value = Array.isArray(data.today?.dueTodayTodos) ? data.today.dueTodayTodos : [];
      todayInboxItems.value = Array.isArray(data.today?.inboxItems) ? data.today.inboxItems : [];
      inbox.pendingTotal = todayStats.value.inboxPendingTotal;
      inbox.todoPendingTotal = todayStats.value.todoPendingTotal;
      inbox.actionTotal = todayStats.value.actionTotal;
      generatedAt.value = String(data.generatedAt || new Date().toISOString());
      trendSummary.value = Array.isArray(data.trend) ? data.trend : [];
      fileTypeSummary.value = Array.isArray(data.fileTypeStats) ? data.fileTypeStats : [];
      commonBookmarkTable.value = Array.isArray(data.commonBookmarks) ? data.commonBookmarks : [];
      hotTagTable.value = Array.isArray(data.hotTags) ? data.hotTags : [];
      recentNoteTable.value = Array.isArray(data.recentNotes) ? data.recentNotes : [];
      recentFileTable.value = Array.isArray(data.recentFiles) ? data.recentFiles : [];
    } catch (error: any) {
      if (silent) throw error;
      workbenchError.value = {
        message: error?.message || t('common.requestFailedDescription'),
        requestId: error?.requestId,
      };
    } finally {
      if (!silent) loadingWorkbench.value = false;
    }
  }

  async function fetchUpdateLogs() {
    loadingUpdateLogs.value = true;
    try {
      const res = await listUpdateLogs();
      updateLogList.value = Array.isArray(res.data?.items) ? res.data.items : [];
    } catch (error) {
      console.warn('fetchUpdateLogs fallback', error);
      updateLogList.value = [];
    } finally {
      loadingUpdateLogs.value = false;
    }
  }

  const initRunning = ref(false);
  const initializedOwner = ref('');
  const pendingInitOwner = ref('');

  async function init(force = false) {
    const owner = `${user.id || 'visitor'}:${user.role || ''}`;
    if (initRunning.value) {
      pendingInitOwner.value = owner;
      return;
    }
    if (!force && initializedOwner.value === owner) return;
    initRunning.value = true;
    if (initializedOwner.value !== owner) {
      inbox.resetForOwner(user.id || 'visitor');
    }
    try {
      await Promise.allSettled([fetchWorkbenchSummary(), fetchUpdateLogs(), loadDashboard(), loadGrowthTasks(true)]);
      if (user.id && user.role !== 'visitor') {
        // 待处理数量以导航角标共用的计数接口为最终口径，避免工作台与快速添加显示不一致。
        await inbox.refreshCount();
      }
      initializedOwner.value = owner;
    } finally {
      initRunning.value = false;
      const pendingOwner = pendingInitOwner.value;
      pendingInitOwner.value = '';
      if (pendingOwner && pendingOwner !== initializedOwner.value) void init();
    }
  }

  async function refreshWorkbench() {
    if (initRunning.value) return;
    await init(true);
  }

  watch(
    () => [user.id, user.role],
    () => init(),
    { immediate: true },
  );

  /*
   * 从后台切回前台时补一次数据。原来这里是 onActivated（本意是「回到工作台时重新取数」），
   * 但全站没有 keep-alive，路由切回来就是重新挂载，那件事已由上面 immediate 的 watch 走 init 完成；
   * 剩下真正会拿到陈旧数据的只有「页面一直在、人离开了」—— 工作台正是最容易被丢在标签页里开一天的页面，
   * 而它满屏都是绑「今天」的内容（逾期/今日待办、收集箱、每日任务、签到）。
   * 三个请求都走静默路径：不进骨架屏、失败保留旧数据，唯一的反馈是顶部那条全局细进度条。
   */
  useForegroundRefresh({
    refresh: async () => {
      await Promise.all([fetchWorkbenchSummary({ silent: true }), loadDashboard(), loadGrowthTasks(true)]);
      // 与 init 同口径：角标计数最终以 /inbox/count 为准，否则静默刷新会把工作台自己的口径留给角标。
      if (user.id && user.role !== 'visitor') await inbox.refreshCount();
    },
    // 首屏还没成功过、或 init 正在跑时不插队：前者没有旧数据可保，后者会重复打同一批请求。
    canRefresh: () => Boolean(initializedOwner.value) && !initRunning.value,
  });
</script>

<style lang="less" scoped>
  .workbenches-container {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    overflow-x: hidden;
    overflow-y: auto;
    scrollbar-gutter: stable;
    padding: 18px clamp(16px, 1.6vw, 40px) 32px;
  }
  .workbench-error {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 16px;
    padding: 12px 14px;
    border: 1px solid color-mix(in srgb, var(--danger-color, #d14343) 32%, transparent);
    border-radius: 12px;
    background: color-mix(in srgb, var(--danger-color, #d14343) 8%, var(--card-background));
    > div {
      display: grid;
      gap: 3px;
    }
    strong {
      color: var(--text-color);
    }
    span,
    small {
      color: var(--desc-color);
    }
  }

  .workbench-shell {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .workbench-header {
    min-height: 54px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
  }

  .workbench-heading {
    min-width: 0;
  }

  .workbench-title-row {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 9px;
  }

  .workbench-title-accent {
    width: 8px;
    height: 8px;
    flex: 0 0 auto;
    border-radius: 999px;
    background: var(--primary-color);
    box-shadow: 0 0 0 5px color-mix(in srgb, var(--primary-color) 10%, transparent);
  }

  .workbench-heading h1,
  .panel-header h2,
  .section-heading h2 {
    margin: 0;
    color: var(--text-color);
  }

  .workbench-heading h1 {
    font-size: clamp(22px, 2vw, 28px);
    line-height: 1.2;
    font-weight: 750;
    letter-spacing: -0.025em;
  }

  .workbench-title-action {
    max-width: 100%;
    height: auto;
    padding: 0;
    overflow: hidden;
    border-radius: 5px;
    color: inherit;
    background: transparent !important;
    font: inherit;
    line-height: inherit;
    letter-spacing: inherit;
    text-overflow: ellipsis;
    transition: color 0.18s ease;

    &:hover,
    &:focus-visible {
      color: var(--primary-color);
      background: transparent !important;
      outline: none;
    }

    &:focus-visible {
      text-decoration: underline;
      text-underline-offset: 4px;
    }
  }

  .workbench-heading p,
  .panel-header p,
  .section-heading p {
    margin: 5px 0 0;
    color: var(--desc-color);
  }

  .workbench-heading p {
    margin-left: 17px;
    font-size: 13px;
  }

  .workbench-data-scope {
    display: block;
    min-height: 1.4em;
    margin: 5px 0 0 17px;
    color: var(--desc-color);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    line-height: 1.4;
  }

  .workbench-data-updated {
    display: inline-block;
    min-width: 12em;
  }

  .header-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    flex-wrap: wrap;
  }

  .capture-button {
    height: 36px;
    gap: 7px;
    border: 1px solid color-mix(in srgb, var(--card-border-color) 72%, transparent);
  }

  .capture-button {
    border-color: transparent;
  }

  .workbench-first-fold {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(330px, 0.29fr);
    align-items: stretch;
    gap: 12px;
  }

  .workbench-first-fold__rail {
    min-width: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    align-content: stretch;
    align-self: stretch;
    gap: 12px;
  }

  .workbench-first-fold__rail :deep(.growth-card) {
    height: 100%;
  }

  .today-summary {
    position: relative;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--primary-color) 24%, var(--card-border-color));
    border-radius: 16px;
    background: var(--card-background);
    box-shadow:
      0 8px 24px color-mix(in srgb, var(--primary-color) 9%, transparent),
      0 2px 6px color-mix(in srgb, var(--text-color) 7%, transparent);
  }

  .today-summary::before {
    content: '';
    position: absolute;
    z-index: 1;
    inset: 0 0 auto;
    height: 3px;
    background: linear-gradient(90deg, var(--primary-color), color-mix(in srgb, var(--primary-color) 38%, transparent));
  }

  .today-summary-heading {
    min-width: 0;
    padding: 13px 16px;
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr) auto;
    align-items: center;
    gap: 11px;
    border-bottom: 1px solid color-mix(in srgb, var(--primary-color) 20%, var(--card-border-color));
    color: var(--primary-color);
    background: linear-gradient(
      100deg,
      color-mix(in srgb, var(--primary-color) 13%, var(--card-background)),
      color-mix(in srgb, var(--primary-color) 5%, var(--card-background))
    );
  }

  .today-summary-heading__icon,
  .today-summary-item__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 11px;
  }

  .today-summary-heading__icon {
    width: 42px;
    height: 42px;
    background: color-mix(in srgb, var(--primary-color) 13%, transparent);
  }

  .today-summary-heading__copy {
    min-width: 0;
    display: grid;
    gap: 4px;
  }

  .today-summary-heading__copy strong {
    color: var(--text-color);
    font-size: 15px;
    line-height: 1.2;
  }

  .today-summary-heading__copy small,
  .today-summary-total small,
  .today-summary-item__copy > span,
  .today-summary-item__copy small {
    color: var(--desc-color);
    font-size: 11px;
  }

  .today-summary-total {
    min-width: 52px;
    display: grid;
    justify-items: end;
    gap: 1px;
  }

  .today-summary-total strong {
    color: var(--primary-color);
    font-size: 28px;
    line-height: 1;
    font-weight: 760;
    font-variant-numeric: tabular-nums;
  }

  .today-summary-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    margin: 10px;
    padding-left: 12px;
    border-left: 3px solid color-mix(in srgb, var(--primary-color) 55%, transparent);
  }

  .today-summary-body {
    --today-work-area-height: 280px;
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
    align-items: stretch;
    gap: 10px;
    padding: 0 10px 10px;
  }

  .today-summary-details {
    min-width: 0;
    min-height: var(--today-work-area-height);
    display: flex;
  }

  .today-summary-details :deep(.today-actions) {
    gap: 0;
  }

  .today-continue {
    min-width: 0;
    min-height: var(--today-work-area-height);
    padding: 8px 10px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    border: 1px solid color-mix(in srgb, var(--primary-color) 16%, var(--card-border-color));
    border-radius: 14px;
    background: var(--menu-body-bg-color, var(--background-color));
  }

  .today-continue__header {
    margin-bottom: 4px;
  }

  .today-continue__header p {
    display: none;
  }

  .today-continue :deep(.tab-container) {
    margin-bottom: 4px;
  }

  .today-continue :deep(.is-pill .tab) {
    min-height: 30px;
    padding: 4px 8px;
  }

  .today-summary-item {
    --today-accent: var(--primary-color);
    width: 100%;
    min-width: 0;
    padding: 11px 12px;
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    border: 1px solid color-mix(in srgb, var(--today-accent) 25%, var(--card-border-color));
    border-radius: 12px;
    background: color-mix(in srgb, var(--today-accent) 5%, var(--card-background));
    color: var(--text-color);
    height: auto;
    text-align: left;
    cursor: pointer;
    transition:
      border-color 0.16s ease,
      background-color 0.16s ease,
      transform 0.16s ease;
  }

  @media (hover: hover) {
    .today-summary-item:hover {
      border-color: color-mix(in srgb, var(--today-accent) 35%, var(--card-border-color));
      background: color-mix(in srgb, var(--today-accent) 7%, var(--card-background));
      transform: translateY(-1px);
    }
  }

  .today-summary-item--todo {
    --today-accent: var(--primary-color);
  }

  .today-summary-item--inbox {
    --today-accent: var(--resource-note-color, #00a884);
  }

  .today-summary-item--notification {
    --today-accent: var(--resource-bookmark-color, #615ced);
  }

  .today-summary-item__icon {
    width: 34px;
    height: 34px;
    color: var(--today-accent);
    background: color-mix(in srgb, var(--today-accent) 10%, transparent);
  }

  .today-summary-item__copy {
    min-width: 0;
    display: grid;
    gap: 3px;
  }

  .today-summary-item__copy > span {
    color: var(--text-color);
    font-weight: 650;
  }

  .today-summary-item__copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .today-summary-item strong {
    color: var(--today-accent);
    font-size: 22px;
    font-variant-numeric: tabular-nums;
  }

  .summary-grid {
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    grid-auto-rows: minmax(176px, 1fr);
    gap: 12px;
  }

  .growth-task-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: stretch;
    gap: 12px;
  }

  .growth-task-grid--single {
    grid-template-columns: 1fr;
  }

  .today-growth-panel {
    height: 100%;
    min-height: 250px;
  }

  .growth-task-grid--loading {
    min-height: 250px;
  }

  .growth-panel-skeleton {
    min-height: 250px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    pointer-events: none;
  }

  .growth-panel-skeleton__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .growth-panel-skeleton__title {
    width: 86px;
    height: 14px;
  }

  .growth-panel-skeleton__count {
    width: 46px;
    height: 12px;
  }

  .growth-panel-skeleton__bar {
    width: 100%;
    height: 6px;
    border-radius: 999px;
  }

  .growth-panel-skeleton__hint {
    width: 128px;
    height: 10px;
  }

  .growth-panel-skeleton__list {
    min-height: 0;
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .growth-panel-skeleton__row {
    min-height: 34px;
    padding: 5px 10px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 10px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--primary-color) 3%, var(--background-color));
  }

  .growth-panel-skeleton__marker {
    width: 18px;
    height: 18px;
    flex: 0 0 auto;
    border-radius: 50%;
  }

  .growth-panel-skeleton__copy {
    min-width: 0;
    flex: 1 1 auto;
    display: grid;
    gap: 5px;
  }

  .growth-panel-skeleton__copy .skeleton-block:first-child {
    width: 42%;
    height: 11px;
  }

  .growth-panel-skeleton__copy .skeleton-block:last-child {
    width: 68%;
    height: 8px;
  }

  .growth-panel-skeleton__action {
    width: 58px;
    height: 24px;
    flex: 0 0 auto;
  }

  .growth-panel-skeleton__footer {
    width: 116px;
    height: 24px;
  }

  .summary-card {
    --summary-accent: var(--primary-color);
    position: relative;
    isolation: isolate;
    overflow: hidden;
    min-width: 0;
    min-height: 176px;
    padding: 16px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 14px;
    border: 1px solid color-mix(in srgb, var(--summary-accent) 20%, var(--card-border-color));
    border-radius: 14px;
    color: var(--text-color);
    text-decoration: none;
    background:
      radial-gradient(
        circle at 100% 115%,
        color-mix(in srgb, var(--summary-accent) 10%, transparent) 0 84px,
        transparent 85px
      ),
      linear-gradient(
        145deg,
        color-mix(in srgb, var(--summary-accent) 7%, var(--menu-body-bg-color)),
        var(--menu-body-bg-color) 62%
      );
    box-shadow: 0 10px 26px -24px color-mix(in srgb, var(--summary-accent) 80%, transparent);
    transition:
      transform 0.18s ease,
      border-color 0.18s ease,
      box-shadow 0.18s ease;
  }

  .summary-card::before {
    content: '';
    position: absolute;
    z-index: -1;
    inset: 0 auto 0 0;
    width: 3px;
    background: linear-gradient(180deg, var(--summary-accent), transparent 88%);
  }

  .summary-card:hover {
    transform: translateY(-2px);
    border-color: color-mix(in srgb, var(--summary-accent) 40%, var(--card-border-color));
    box-shadow: 0 16px 32px -26px color-mix(in srgb, var(--summary-accent) 92%, transparent);
  }

  .summary-card--bookmark {
    --summary-accent: var(--resource-bookmark-color, #635bff);
  }

  .summary-card--note {
    --summary-accent: var(--resource-note-color, #00a67e);
  }

  .summary-card--cloud {
    --summary-accent: var(--resource-file-color, #ff8a00);
  }

  .summary-card--tag {
    --summary-accent: var(--resource-tag-color, #e85aad);
  }

  .summary-icon {
    width: 40px;
    height: 40px;
    flex: 0 0 auto;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--summary-accent);
    background: color-mix(in srgb, var(--summary-accent) 10%, var(--menu-body-bg-color));
  }

  .summary-card__header {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 11px;
  }

  .summary-heading-copy {
    min-width: 0;
    flex: 1 1 auto;
    display: grid;
    gap: 3px;
  }

  .summary-arrow {
    width: 28px;
    height: 28px;
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 9px;
    color: var(--summary-accent);
    background: color-mix(in srgb, var(--summary-accent) 8%, transparent);
    transition: transform 0.18s ease;
  }

  .summary-card:hover .summary-arrow {
    transform: translateX(2px);
  }

  .summary-label {
    min-width: 0;
    color: var(--text-color);
    font-size: 13px;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .summary-meta {
    min-width: 0;
    color: var(--desc-color);
    font-size: 10.5px;
    line-height: 1.25;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .summary-card__metric {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
  }

  .summary-value {
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 6px;
  }

  .summary-value > span {
    color: var(--text-color);
    font-size: 30px;
    line-height: 1.1;
    font-weight: 780;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.025em;
  }

  .summary-value small {
    color: var(--desc-color);
    font-size: 10.5px;
    font-weight: 500;
    white-space: nowrap;
  }

  .summary-stats {
    min-width: min(210px, 56%);
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 7px;
  }

  .summary-stat {
    min-width: 0;
    padding: 7px 8px;
    display: grid;
    gap: 2px;
    border-radius: 9px;
    background: color-mix(in srgb, var(--summary-accent) 6%, var(--menu-body-bg-color));
  }

  .summary-stat small,
  .summary-stat strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .summary-stat small {
    color: var(--desc-color);
    font-size: 9.5px;
  }

  .summary-stat strong {
    color: var(--summary-accent);
    font-size: 11.5px;
    font-weight: 700;
  }

  .summary-progress {
    margin-top: auto;
    display: grid;
    gap: 7px;
  }

  .summary-progress__track {
    height: 5px;
    overflow: hidden;
    border-radius: 999px;
    background: color-mix(in srgb, var(--card-border-color) 58%, transparent);
  }

  .summary-progress__track span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(
      90deg,
      var(--summary-accent),
      color-mix(in srgb, var(--summary-accent) 58%, var(--menu-body-bg-color))
    );
  }

  .summary-progress__footer {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font-size: 10px;
  }

  .summary-progress__footer span {
    min-width: 0;
    color: var(--desc-color);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .summary-progress__footer strong {
    flex: 0 0 auto;
    color: var(--summary-accent);
    font-weight: 700;
  }

  .summary-skeleton {
    pointer-events: none;
  }

  .summary-skeleton__header {
    display: flex;
    align-items: center;
    gap: 11px;
  }

  .summary-skeleton__stats {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 7px;
  }

  .skeleton-block {
    display: block;
    border-radius: 7px;
    background: linear-gradient(
      90deg,
      var(--bl-input-noBorder-bg-color) 20%,
      var(--skeleton-body-bg-color) 50%,
      var(--bl-input-noBorder-bg-color) 80%
    );
    background-size: 200% 100%;
    animation: workbench-skeleton 1.2s infinite;
  }

  .skeleton-icon {
    width: 40px;
    height: 40px;
    flex: 0 0 auto;
  }

  .skeleton-label {
    width: 36%;
    height: 13px;
  }

  .skeleton-value {
    width: 25%;
    height: 30px;
  }

  .skeleton-stat {
    height: 38px;
  }

  .skeleton-meta {
    width: 78%;
    height: 7px;
    margin-top: auto;
  }

  .primary-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
    align-items: stretch;
  }

  .panel-card {
    min-width: 0;
    padding: 16px;
    box-sizing: border-box;
    border: 1px solid color-mix(in srgb, var(--card-border-color) 72%, transparent);
    border-radius: 14px;
    color: var(--text-color);
    background: var(--menu-body-bg-color);
    box-shadow: 0 12px 30px -28px color-mix(in srgb, var(--text-color) 38%, transparent);
  }

  .panel-header,
  .section-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .panel-header {
    margin-bottom: 12px;
  }

  .panel-header h2,
  .section-heading h2 {
    font-size: 15px;
    line-height: 1.3;
    font-weight: 700;
  }

  .panel-header p,
  .section-heading p {
    font-size: 11.5px;
    line-height: 1.4;
  }

  .quiet-button {
    flex: 0 0 auto;
    gap: 4px;
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 7%, var(--menu-body-bg-color));
  }

  .content-list {
    min-height: 0;
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .content-row {
    width: 100%;
    height: 38px;
    padding: 0 7px;
    gap: 8px;
    justify-content: flex-start;
    border-radius: 9px;
    line-height: 1.2;
    background: transparent;
  }

  .content-list--distributed > .content-row,
  .content-list--distributed > .content-skeleton-row {
    min-height: 38px;
    height: auto;
    flex: 1 1 0;
  }

  .content-row:hover {
    background: color-mix(in srgb, var(--primary-color) 6%, var(--menu-body-bg-color));
  }

  .content-row-icon {
    width: 26px;
    height: 26px;
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 9px;
    background: color-mix(in srgb, var(--primary-color) 8%, transparent);
  }

  .content-row-icon--bookmark {
    color: var(--resource-bookmark-color, #635bff);
    background: color-mix(in srgb, var(--resource-bookmark-color, #635bff) 9%, transparent);
  }

  .content-row-icon--note {
    color: var(--resource-note-color, #00a67e);
    background: color-mix(in srgb, var(--resource-note-color, #00a67e) 9%, transparent);
  }

  .content-row-icon--file {
    color: var(--resource-file-color, #ff8a00);
    background: color-mix(in srgb, var(--resource-file-color, #ff8a00) 9%, transparent);
  }

  .content-row-main {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
  }

  .content-row-main strong,
  .content-row-main span {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .content-row-main strong {
    color: var(--text-color);
    font-size: 12.5px;
    font-weight: 620;
  }

  .content-row-main span,
  .content-row-meta {
    color: var(--desc-color);
    font-size: 10.5px;
  }

  .content-row-meta {
    max-width: 145px;
    flex: 0 0 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .content-list--loading {
    gap: 0;
  }

  .content-skeleton-row {
    height: 38px;
    padding: 0 7px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .skeleton-row-icon {
    width: 26px;
    height: 26px;
    flex: 0 0 auto;
  }

  .content-skeleton-copy {
    min-width: 0;
    flex: 1 1 auto;
    display: grid;
    gap: 4px;
  }

  .content-skeleton-title {
    width: min(62%, 180px);
    height: 10px;
  }

  .content-skeleton-subtitle {
    width: min(38%, 110px);
    height: 7px;
  }

  .skeleton-row-meta {
    width: 16%;
    height: 10px;
    margin-left: auto;
  }

  .quick-create-panel {
    height: auto;
  }

  .quick-create-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .quick-create-action {
    width: 100%;
    height: 58px;
    padding: 0 10px;
    gap: 9px;
    justify-content: flex-start;
    line-height: 1.2;
    border: 1px solid color-mix(in srgb, var(--card-border-color) 64%, transparent);
    background: color-mix(in srgb, var(--primary-color) 3%, var(--menu-body-bg-color));
  }

  .quick-create-action:hover {
    border-color: color-mix(in srgb, var(--primary-color) 24%, var(--card-border-color));
    background: color-mix(in srgb, var(--primary-color) 7%, var(--menu-body-bg-color));
  }

  .quick-create-icon {
    width: 32px;
    height: 32px;
    flex: 0 0 auto;
    border-radius: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 9%, transparent);
  }

  .quick-create-icon--bookmark {
    color: var(--resource-bookmark-color, #635bff);
    background: color-mix(in srgb, var(--resource-bookmark-color, #635bff) 10%, transparent);
  }

  .quick-create-icon--note {
    color: var(--resource-note-color, #00a67e);
    background: color-mix(in srgb, var(--resource-note-color, #00a67e) 10%, transparent);
  }

  .quick-create-icon--file {
    color: var(--resource-file-color, #ff8a00);
    background: color-mix(in srgb, var(--resource-file-color, #ff8a00) 10%, transparent);
  }

  .quick-create-action > span:last-child {
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }

  .quick-create-action strong {
    color: var(--text-color);
    font-size: 12px;
    font-weight: 650;
  }

  .quick-create-action small {
    max-width: 100%;
    color: var(--desc-color);
    font-size: 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .analytics-section {
    display: flex;
    flex-direction: column;
  }

  .section-heading {
    padding: 2px 2px 0;
  }

  .lower-grid {
    display: grid;
    grid-template-columns: minmax(280px, 0.72fr) minmax(0, 1.28fr);
    gap: 12px;
  }

  .hot-tags-panel,
  .latest-update-panel {
    min-height: 300px;
  }

  .latest-update-panel {
    padding: 20px;
    border-radius: 18px;
    background: linear-gradient(
      145deg,
      var(--menu-body-bg-color) 0%,
      color-mix(in srgb, var(--primary-color) 2.5%, var(--menu-body-bg-color)) 100%
    );
    box-shadow: 0 18px 44px -38px rgba(30, 27, 75, 0.38);
  }

  .latest-update-panel .panel-header {
    margin-bottom: 16px;
  }

  .latest-update-panel .panel-header > div {
    position: relative;
    padding-left: 14px;
  }

  .latest-update-panel .panel-header > div::before {
    content: '';
    position: absolute;
    left: 0;
    top: 1px;
    width: 4px;
    height: 34px;
    border-radius: 999px;
    background: var(--primary-color);
  }

  .latest-update-panel .panel-header h2 {
    font-size: 18px;
    font-weight: 750;
    letter-spacing: -0.01em;
  }

  .latest-update-panel .panel-header p {
    margin-top: 5px;
    font-size: 11.5px;
  }

  .latest-update-panel .quiet-button {
    min-height: 34px;
    padding: 0 12px;
    border: 1px solid var(--primary-color);
    border-radius: 10px;
    background: var(--menu-body-bg-color);
  }

  .tag-list {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .tag-row {
    width: 100%;
    height: 30px;
    padding: 0 8px;
    gap: 9px;
    justify-content: flex-start;
    background: transparent;
  }

  .tag-row:hover {
    background: color-mix(in srgb, var(--resource-tag-color, #e85aad) 7%, var(--menu-body-bg-color));
  }

  .tag-rank {
    width: 20px;
    color: var(--desc-color);
    font-size: 10px;
    font-variant-numeric: tabular-nums;
  }

  .tag-name {
    min-width: 0;
    flex: 1;
    color: var(--text-color);
    font-size: 12px;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tag-resource-count {
    flex: 0 0 auto;
    color: var(--desc-color);
    font-size: 10.5px;
  }

  .tag-list--loading {
    gap: 10px;
  }

  .tag-skeleton {
    width: 100%;
    height: 20px;
  }

  .latest-update-content {
    min-height: 216px;
    box-sizing: border-box;
    overflow: hidden;
    border: 1px solid var(--card-border-color);
    border-radius: 14px;
    background: color-mix(in srgb, var(--menu-body-bg-color) 94%, var(--bl-input-noBorder-bg-color));
  }

  .latest-update-title {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 10px;
    min-height: 54px;
    padding: 0 14px;
    border-bottom: 1px solid var(--card-border-color);
    background: color-mix(in srgb, var(--primary-color) 4%, var(--menu-body-bg-color));
  }

  .update-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--primary-color);
    border: 3px solid color-mix(in srgb, var(--primary-color) 18%, var(--menu-body-bg-color));
  }

  .latest-update-title strong {
    min-width: 0;
    font-size: 14px;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .latest-update-badge {
    flex: 0 0 auto;
  }

  .latest-update-title time {
    color: var(--desc-color);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  .latest-update-items {
    display: flex;
    flex-direction: column;
  }

  .latest-update-item {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr);
    gap: 10px;
    align-items: center;
    min-height: 40px;
    padding: 6px 14px;
    border-bottom: 1px solid var(--card-border-color);
  }

  .latest-update-item:last-child {
    border-bottom: 0;
  }

  .latest-update-item > span {
    width: 24px;
    height: 24px;
    border: 1px solid var(--primary-color);
    border-radius: 7px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 9%, transparent);
    font-size: 11px;
    font-weight: 700;
  }

  .latest-update-item p {
    margin: 0;
    color: var(--desc-color);
    font-size: 11.5px;
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .update-skeleton {
    min-height: 216px;
    padding: 14px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 13px;
    border-radius: 11px;
    background: var(--bl-input-noBorder-bg-color);
  }

  .update-skeleton .skeleton-block {
    width: 100%;
    height: 11px;
  }

  .update-skeleton .skeleton-update-title {
    width: 48%;
    height: 14px;
  }

  .update-skeleton .skeleton-update-short {
    width: 68%;
  }

  .compact-empty {
    min-height: 236px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 1px dashed color-mix(in srgb, var(--card-border-color) 70%, transparent);
    border-radius: 10px;
    color: var(--desc-color);
    text-align: center;
  }

  .compact-empty strong {
    color: var(--text-color);
    font-size: 12px;
  }

  .compact-empty span {
    font-size: 11px;
  }

  .compact-empty--small {
    min-height: 132px;
  }

  .compact-empty--continue {
    min-height: 0;
    flex: 1 1 auto;
  }

  @keyframes workbench-skeleton {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  @media (max-width: 1380px) {
    .workbench-first-fold {
      grid-template-columns: minmax(0, 1fr);
    }

    .workbench-first-fold__rail {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-template-rows: minmax(0, 1fr);
      align-items: stretch;
      align-self: stretch;
    }

    .quick-create-panel {
      height: 100%;
    }

    .summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 1050px) {
    .today-summary-body,
    .growth-task-grid {
      grid-template-columns: 1fr;
    }

    .today-summary-body {
      --today-work-area-height: 280px;
    }
  }

  @media (max-width: 760px) {
    .workbenches-container {
      padding: 14px 12px 24px;
    }

    .workbench-header {
      align-items: flex-start;
      flex-direction: column;
    }

    .header-actions {
      width: 100%;
      justify-content: flex-start;
    }

    .summary-grid,
    .today-summary-grid,
    .workbench-first-fold__rail,
    .lower-grid {
      grid-template-columns: 1fr;
    }

    .workbench-first-fold__rail {
      grid-template-rows: auto;
    }

    .workbench-first-fold__rail :deep(.growth-card) {
      height: auto;
    }

    .today-summary-grid {
      padding-left: 9px;
    }

    .content-row-meta {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .summary-card,
    .skeleton-block {
      animation: none !important;
      transition: none !important;
    }

    .summary-card:hover {
      transform: none;
    }
  }
</style>
