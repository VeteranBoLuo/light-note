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
          <small v-if="lastUpdatedAt" class="workbench-data-scope">
            {{ t('workbench.meta.todayRange') }} · {{ t('workbench.meta.lastUpdated', { time: lastUpdatedAt }) }}
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

      <section class="today-summary" :aria-label="t('workbench.panel.todaySummary')">
        <div class="today-summary-heading">
          <span class="today-summary-heading__icon" aria-hidden="true">
            <SvgIcon :src="icon.noteDetail.toolbar.todo" size="22" />
          </span>
          <span class="today-summary-heading__copy">
            <strong>{{ t('workbench.panel.todaySummary') }}</strong>
            <small>{{ t('workbench.panel.todaySummaryHint') }}</small>
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
      </section>

      <TodayActionSection
        :overdue-todos="todayOverdueTodos"
        :due-today-todos="todayDueTodos"
        :inbox-items="todayInboxItems"
        :loading="summaryLoading"
        @refresh="fetchWorkbenchSummary"
      />

      <section class="summary-grid" :aria-label="t('workbench.panel.resourceOverview')">
        <template v-if="summaryLoading">
          <div v-for="index in 4" :key="`summary-skeleton-${index}`" class="summary-card summary-skeleton">
            <span class="skeleton-block skeleton-icon"></span>
            <span class="skeleton-block skeleton-label"></span>
            <span class="skeleton-block skeleton-value"></span>
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
          <div class="summary-icon">
            <SvgIcon :src="card.icon" size="22" />
          </div>
          <div class="summary-copy">
            <div class="summary-topline">
              <span class="summary-label">{{ card.label }}</span>
              <span class="summary-weekly">+{{ card.weekly }} {{ card.weeklyLabel }}</span>
            </div>
            <strong class="summary-value">{{ card.value }}</strong>
            <template v-if="card.key === 'cloud'">
              <div class="storage-track" aria-hidden="true">
                <span :style="{ width: `${storagePercent}%` }"></span>
              </div>
              <span class="summary-meta">{{ card.meta }}</span>
            </template>
            <span v-else class="summary-meta">{{ card.meta }}</span>
          </div>
        </RouterLink>
      </section>

      <section class="primary-grid">
        <article class="panel-card continue-panel">
          <div class="panel-header">
            <div>
              <h2>{{ t('workbench.panel.continueWorking') }}</h2>
              <p>{{ t('workbench.panel.continueHint') }}</p>
            </div>
            <BButton size="small" class="quiet-button" @click="openActiveCollection">
              {{ t('workbench.panel.viewAll') }}
            </BButton>
          </div>

          <BTabs v-model:active-tab="activeContinueTab" variant="pill" :options="continueTabOptions" />

          <div v-if="summaryLoading" class="content-list content-list--loading">
            <div v-for="index in 5" :key="`content-skeleton-${index}`" class="content-skeleton-row">
              <span class="skeleton-block skeleton-row-icon"></span>
              <span class="skeleton-block skeleton-row-main"></span>
              <span class="skeleton-block skeleton-row-meta"></span>
            </div>
          </div>
          <div v-else-if="activeContinueItems.length" class="content-list">
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
          <div v-else class="compact-empty">
            <strong>{{ t('workbench.empty.continueTitle') }}</strong>
            <span>{{ t('workbench.empty.continueDesc') }}</span>
          </div>
        </article>

        <aside class="side-column">
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
          <WorkbenchGrowth />
        </aside>
      </section>

      <section class="analytics-section">
        <div class="section-heading">
          <div>
            <h2>{{ t('workbench.panel.contentOverview') }}</h2>
            <p>{{ t('workbench.panel.contentOverviewHint') }}</p>
          </div>
        </div>
        <WorkbenchCharts
          :loading="summaryLoading"
          :theme-key="user.currentTheme || 'day'"
          :trend-data="trendChartData"
          :file-type-data="fileTypeChartData"
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
            <span v-for="index in 5" :key="`tag-skeleton-${index}`" class="skeleton-block tag-skeleton"></span>
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
  import {
    listUpdateLogs,
    updateLogMarkdownSummaryItems,
    type UpdateLogItem,
  } from '@/api/updateLogApi.ts';
  import { cloudSpaceStore, inboxStore, useUserStore } from '@/store';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import TodayActionSection from '@/components/workbenches/TodayActionSection.vue';
  import WorkbenchCharts from '@/components/workbenches/WorkbenchCharts.vue';
  import WorkbenchGrowth from '@/components/workbenches/WorkbenchGrowth.vue';
  import icon from '@/config/icon.ts';
  import { CLOUD_FILE_CATEGORY_LABEL_KEY } from '@/constants/cloudFileCategory.ts';
  import { formatStorageSize } from '@/utils/common.ts';
  import { recordOperation } from '@/api/commonApi.ts';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';
  import { blockGuestWrite } from '@/composables/useGuestGuard.ts';
  import { useGrowth } from '@/composables/useGrowth.ts';
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
  const { growth } = useGrowth();

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

  const maxSpaceMb = computed(() => growth.value?.spaceMb || cloud.maxSpace || 512);
  const storagePercent = computed(() => {
    if (!maxSpaceMb.value) return 0;
    return Math.min(100, Number(((cloud.usedSpace / maxSpaceMb.value) * 100).toFixed(1)));
  });

  const summaryCards = computed(() => [
    {
      key: 'bookmark',
      label: t('workbench.summary.bookmarkTotal'),
      value: workbenchCounts.value.bookmarkTotal,
      weekly: Number(weeklyStats.value.bookmark || 0),
      weeklyLabel: t('workbench.summary.weeklyAdded'),
      meta: t('workbench.summary.bookmarkMeta'),
      icon: icon.resource.bookmark,
      to: '/home',
    },
    {
      key: 'note',
      label: t('workbench.summary.noteTotal'),
      value: workbenchCounts.value.noteTotal,
      weekly: Number(weeklyStats.value.note || 0),
      weeklyLabel: t('workbench.summary.weeklyUpdated'),
      meta: t('workbench.summary.noteMeta'),
      icon: icon.resource.note,
      to: '/noteLibrary',
    },
    {
      key: 'cloud',
      label: t('workbench.summary.cloudOverview'),
      value: workbenchCounts.value.fileTotal,
      weekly: Number(weeklyStats.value.file || 0),
      weeklyLabel: t('workbench.summary.weeklyUploaded'),
      meta: t('workbench.summary.cloudOverviewExtra', {
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
      weekly: Number(weeklyStats.value.tag || 0),
      weeklyLabel: t('workbench.summary.weeklyAdded'),
      meta: t('workbench.summary.tagMeta'),
      icon: icon.resource.tag,
      to: '/manage/tagMg',
    },
  ]);

  const continueTabOptions = computed(() => [
    { key: 'notes', label: t('workbench.tabs.recentNotes'), badge: recentNoteTable.value.length },
    { key: 'files', label: t('workbench.tabs.recentFiles'), badge: recentFileTable.value.length },
    { key: 'bookmarks', label: t('workbench.tabs.frequentBookmarks'), badge: commonBookmarkTable.value.length },
  ]);

  const activeContinueItems = computed<ContinueItem[]>(() => {
    if (activeContinueTab.value === 'files') {
      return recentFileTable.value.slice(0, 5).map((file) => ({
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
      return commonBookmarkTable.value.slice(0, 5).map((bookmark) => ({
        key: `bookmark-${bookmark.id || bookmark.name}`,
        type: 'bookmark',
        title: bookmark.name || t('workbench.table.bookmark'),
        description: bookmark.url || t('workbench.meta.savedBookmark'),
        meta: t('workbench.meta.visitCount', { count: Number(bookmark.count || 0) }),
        icon: icon.resource.bookmark,
        raw: bookmark,
      }));
    }
    return recentNoteTable.value.slice(0, 5).map((note) => ({
      key: `note-${note.id || note.title}`,
      type: 'note',
      title: note.title || t('noteDetail.unnamedDoc'),
      description: t('workbench.meta.tagCount', { count: Number(note.tagCount || 0) }),
      meta: formatDateLabel(note.updateTime),
      icon: icon.resource.note,
      raw: note,
    }));
  });

  const quickCreateActions = computed(() => [
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
  ].sort((a, b) => Number(quickActionUsage.value[b.key] || 0) - Number(quickActionUsage.value[a.key] || 0)));

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
  const topHotTags = computed(() => hotTagTable.value.slice(0, 5));
  const latestUpdateLog = computed(() => updateLogList.value[0] || null);
  const latestUpdateItems = computed(() => {
    const item = latestUpdateLog.value;
    if (item?.contentMarkdown) return updateLogMarkdownSummaryItems(item.contentMarkdown, 4);
    if (Array.isArray(item?.highlights)) return item.highlights.slice(0, 4);
    return Array.isArray(item?.list) ? item.list.slice(0, 4) : [];
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
      router.push(item.raw?.id ? `/noteLibrary/${item.raw.id}` : '/noteLibrary');
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

  async function fetchWorkbenchSummary() {
    loadingWorkbench.value = true;
    workbenchError.value = null;
    try {
      const res = await apiBasePost('/api/workbench/summary');
      if (res.status !== 200) {
        workbenchError.value = {
          message: res.msg || t('common.requestFailedDescription'),
          requestId: res.requestId,
        };
        return;
      }
      const data = res.data || {};
      workbenchCounts.value = {
        bookmarkTotal: Number(data.counts?.bookmarkTotal || 0),
        tagTotal: Number(data.counts?.tagTotal || 0),
        noteTotal: Number(data.counts?.noteTotal || 0),
        fileTotal: Number(data.counts?.fileTotal || 0),
        usedSpace: Number(data.counts?.usedSpace || 0),
      };
      user.bookmarkTotal = workbenchCounts.value.bookmarkTotal;
      user.tagTotal = workbenchCounts.value.tagTotal;
      user.noteTotal = workbenchCounts.value.noteTotal;
      cloud.usedSpace = workbenchCounts.value.usedSpace;
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
      workbenchError.value = {
        message: error?.message || t('common.requestFailedDescription'),
        requestId: error?.requestId,
      };
    } finally {
      loadingWorkbench.value = false;
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
      await Promise.allSettled([fetchWorkbenchSummary(), fetchUpdateLogs()]);
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
    margin: 5px 0 0 17px;
    color: var(--desc-color);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
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
    background: linear-gradient(
      90deg,
      var(--primary-color),
      color-mix(in srgb, var(--primary-color) 38%, transparent)
    );
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
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }

  .summary-card {
    --summary-accent: var(--primary-color);
    position: relative;
    min-width: 0;
    min-height: 112px;
    padding: 15px;
    box-sizing: border-box;
    display: flex;
    align-items: flex-start;
    gap: 12px;
    border: 1px solid color-mix(in srgb, var(--summary-accent) 20%, var(--card-border-color));
    border-radius: 14px;
    color: var(--text-color);
    text-decoration: none;
    background: linear-gradient(
      145deg,
      color-mix(in srgb, var(--summary-accent) 5%, var(--menu-body-bg-color)),
      var(--menu-body-bg-color)
    );
    box-shadow: 0 10px 26px -24px color-mix(in srgb, var(--summary-accent) 80%, transparent);
    transition:
      transform 0.18s ease,
      border-color 0.18s ease,
      box-shadow 0.18s ease;
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
    width: 38px;
    height: 38px;
    flex: 0 0 auto;
    border-radius: 11px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--summary-accent);
    background: color-mix(in srgb, var(--summary-accent) 10%, var(--menu-body-bg-color));
  }

  .summary-copy {
    flex: 1;
    min-width: 0;
  }

  .summary-topline {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .summary-label {
    min-width: 0;
    color: var(--desc-color);
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .summary-weekly {
    flex: 0 0 auto;
    padding: 3px 7px;
    border-radius: 999px;
    color: var(--summary-accent);
    background: color-mix(in srgb, var(--summary-accent) 9%, transparent);
    font-size: 10.5px;
    font-weight: 650;
  }

  .summary-value {
    display: block;
    margin-top: 5px;
    font-size: 26px;
    line-height: 1.1;
    font-weight: 760;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.025em;
  }

  .summary-meta {
    display: block;
    margin-top: 7px;
    color: var(--desc-color);
    font-size: 11.5px;
    line-height: 1.25;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .storage-track {
    height: 4px;
    margin-top: 7px;
    border-radius: 999px;
    overflow: hidden;
    background: color-mix(in srgb, var(--card-border-color) 56%, transparent);
  }

  .storage-track span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--summary-accent);
  }

  .summary-skeleton {
    pointer-events: none;
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
    width: 38px;
    height: 38px;
    flex: 0 0 auto;
  }

  .skeleton-label,
  .skeleton-value,
  .skeleton-meta {
    position: absolute;
    left: 65px;
  }

  .skeleton-label {
    top: 16px;
    width: 34%;
    height: 11px;
  }

  .skeleton-value {
    top: 38px;
    width: 22%;
    height: 25px;
  }

  .skeleton-meta {
    top: 78px;
    width: 52%;
    height: 10px;
  }

  .primary-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) clamp(330px, 28vw, 460px);
    gap: 12px;
    align-items: stretch;
  }

  .side-column {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
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
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 7%, var(--menu-body-bg-color));
  }

  .continue-panel {
    min-height: 344px;
  }

  .continue-panel :deep(.tab-container) {
    margin-bottom: 8px;
  }

  .content-list {
    display: flex;
    flex-direction: column;
  }

  .content-row {
    width: 100%;
    height: 50px;
    padding: 0 9px;
    gap: 10px;
    justify-content: flex-start;
    border-radius: 9px;
    line-height: 1.2;
    background: transparent;
  }

  .content-row:hover {
    background: color-mix(in srgb, var(--primary-color) 6%, var(--menu-body-bg-color));
  }

  .content-row-icon {
    width: 31px;
    height: 31px;
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
    gap: 2px;
  }

  .content-skeleton-row {
    height: 48px;
    padding: 0 9px;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .skeleton-row-icon {
    width: 31px;
    height: 31px;
    flex: 0 0 auto;
  }

  .skeleton-row-main {
    width: 45%;
    height: 12px;
  }

  .skeleton-row-meta {
    width: 16%;
    height: 10px;
    margin-left: auto;
  }

  .quick-create-panel {
    flex: 1 1 auto;
  }

  .quick-create-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .quick-create-action {
    width: 100%;
    height: 66px;
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
    gap: 10px;
  }

  .section-heading {
    padding: 2px 2px 0;
  }

  .lower-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .hot-tags-panel,
  .latest-update-panel {
    min-height: 220px;
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
    min-height: 142px;
    padding: 12px;
    box-sizing: border-box;
    border-radius: 11px;
    background: color-mix(in srgb, var(--primary-color) 5%, var(--bl-input-noBorder-bg-color));
  }

  .latest-update-title {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 9px;
  }

  .update-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--primary-color);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--primary-color) 10%, transparent);
  }

  .latest-update-title strong {
    min-width: 0;
    font-size: 12.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .latest-update-title time {
    color: var(--desc-color);
    font-size: 10.5px;
    font-variant-numeric: tabular-nums;
  }

  .latest-update-items {
    margin-top: 11px;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .latest-update-item {
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr);
    gap: 7px;
    align-items: start;
  }

  .latest-update-item > span {
    width: 20px;
    height: 20px;
    border-radius: 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 9%, transparent);
    font-size: 10px;
    font-weight: 700;
  }

  .latest-update-item p {
    margin: 1px 0 0;
    color: var(--desc-color);
    font-size: 11px;
    line-height: 1.55;
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .update-skeleton {
    min-height: 142px;
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

  @keyframes workbench-skeleton {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  @media (max-width: 1180px) {
    .summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .primary-grid {
      grid-template-columns: 1fr;
    }

    .side-column {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: stretch;
    }

    .quick-create-panel {
      height: 100%;
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
    .side-column,
    .lower-grid {
      grid-template-columns: 1fr;
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
