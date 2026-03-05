<template>
  <div class="workbenches-container">
    <div class="workbench-header">
      <div class="title">{{ t('workbench.title', '工作台') }}</div>
      <div class="subtitle">{{
        t('workbench.subtitle', '聚合查看书签、笔记、文件与标签状态，快速完成常用操作。')
      }}</div>
    </div>

    <div class="summary-grid">
      <template v-if="summaryLoading">
        <div v-for="n in 4" :key="`summary-skeleton-${n}`" class="summary-card summary-skeleton">
          <div class="summary-top">
            <div class="sk-line sk-label"></div>
            <div class="sk-pill"></div>
          </div>
          <div class="sk-line sk-value"></div>
          <div class="summary-mini-track">
            <div class="sk-mini-bar"></div>
          </div>
          <div class="sk-line sk-extra"></div>
        </div>
      </template>
      <div
        v-else
        v-for="item in summaryCards"
        :key="item.key"
        :class="['summary-card', 'dom-hover', `summary-card--${item.key}`]"
        @click="router.push(item.to)"
      >
        <div class="summary-top">
          <div class="summary-label">{{ item.label }}</div>
          <div v-if="item.key === 'cloud'" class="summary-pill">{{ storagePercent }}%</div>
        </div>
        <div class="summary-value">{{ item.value }}</div>
        <div v-if="item.key === 'cloud'" class="summary-mini-track">
          <div class="summary-mini-bar" :style="{ width: `${storagePercent}%` }"></div>
        </div>
        <div class="summary-extra">{{ item.extra }}</div>
      </div>
    </div>

    <div class="insight-grid">
      <div class="panel-card activity-panel">
        <div class="panel-title">{{ t('workbench.panel.weeklyActive', '最近 7 天活跃') }}</div>
        <div v-if="activityLoading" class="activity-grid">
          <div class="activity-item activity-skeleton-item" v-for="n in 3" :key="`activity-skeleton-${n}`">
            <div class="sk-line sk-label"></div>
            <div class="sk-line sk-number"></div>
          </div>
        </div>
        <div v-else class="activity-grid">
          <div class="activity-item">
            <div class="activity-label">{{ t('workbench.panel.newBookmarks', '新增书签') }}</div>
            <div class="activity-value">{{ weeklyStats.bookmark }}</div>
          </div>
          <div class="activity-item">
            <div class="activity-label">{{ t('workbench.panel.updatedNotes', '更新笔记') }}</div>
            <div class="activity-value">{{ weeklyStats.note }}</div>
          </div>
          <div class="activity-item">
            <div class="activity-label">{{ t('workbench.panel.uploadedFiles', '上传文件') }}</div>
            <div class="activity-value">{{ weeklyStats.file }}</div>
          </div>
        </div>
      </div>

      <div class="panel-card quick-panel">
        <div class="panel-title">{{ t('workbench.panel.quickActions', '快捷操作') }}</div>
        <div v-if="quickActionsLoading" class="quick-action-grid">
          <div class="quick-action-item quick-skeleton-item" v-for="n in 8" :key="`action-skeleton-${n}`">
            <div class="sk-line sk-action-title"></div>
            <div class="sk-line sk-action-desc"></div>
          </div>
        </div>
        <div v-else class="quick-action-grid">
          <button
            v-for="action in quickActions"
            :key="action.key"
            class="quick-action-item dom-hover"
            @click="router.push(action.to)"
          >
            <span class="action-name">{{ action.label }}</span>
            <span class="action-desc">{{ action.desc }}</span>
          </button>
        </div>
      </div>

      <div class="panel-card update-log-panel">
        <div class="panel-title">{{ t('workbench.panel.updateLogs', '更新日志') }}</div>
        <div v-if="updateLogsLoading" class="update-log-content skeleton-log-content">
          <div class="update-log-list skeleton-log-list">
            <div class="update-log-title" v-for="n in 4" :key="`log-skeleton-${n}`">
              <div class="sk-line"></div>
            </div>
          </div>
          <div class="update-log-detail">
            <div class="sk-line sk-short"></div>
            <div class="detail-list">
              <div class="sk-line" v-for="n in 3" :key="`detail-skeleton-${n}`"></div>
            </div>
          </div>
        </div>
        <div v-else class="update-log-content">
          <div class="update-log-list" v-if="updateLogList.length">
            <button
              v-for="(log, index) in updateLogList"
              :key="`${log.label || 'log'}-${index}`"
              class="update-log-title dom-hover"
              :class="{ active: activeUpdateLogIndex === index }"
              @click="toggleUpdateLog(index)"
            >
              <span class="log-label" v-html="log.label || `${t('workbench.logs.update', '更新')} ${index + 1}`"></span>
              <span class="log-time">{{ log.time || '-' }}</span>
            </button>
          </div>
          <div v-else class="empty-log list-empty">{{ t('workbench.logs.empty', '暂无更新日志') }}</div>

          <div class="update-log-detail">
            <template v-if="activeUpdateLog">
              <div class="detail-title">{{ activeUpdateLog.time || t('workbench.logs.latest', '最近更新') }}</div>
              <div class="detail-list" v-if="Array.isArray(activeUpdateLog.list) && activeUpdateLog.list.length">
                <div class="detail-item" v-for="(item, index) in activeUpdateLog.list" :key="`detail-${index}`">
                  <span class="detail-index">{{ Number(index) + 1 }}.</span>
                  <span class="detail-text" v-html="item"></span>
                </div>
              </div>
            </template>
            <div class="empty-log" v-else>{{ t('workbench.logs.clickForDetail', '点击上方日志标题查看详情') }}</div>
          </div>
        </div>
      </div>
    </div>

    <WorkbenchCharts
      :loading="activityLoading"
      :themeKey="user.preferences?.theme || 'day'"
      :trendData="trendChartData"
      :fileTypeData="fileTypeChartData"
    />

    <div class="table-grid">
      <div class="table-card">
        <div v-if="commonBookmarksLoading" class="table-skeleton">
          <div class="table-skeleton-title sk-line sk-title"></div>
          <div class="table-skeleton-body">
            <div class="sk-line" v-for="n in 8" :key="`tb1-skeleton-${n}`"></div>
          </div>
        </div>
        <CommonDataTable
          v-else
          :tableData="commonBookmarkTable"
          titleType="bookmark"
          rowClickable
          @rowClick="handleCommonBookmarkClick"
          :title="t('workbench.table.frequentBookmarks', '高频书签')"
          :columns="commonBookmarkColumns"
        />
      </div>

      <div class="table-card">
        <div v-if="hotTagsLoading" class="table-skeleton">
          <div class="table-skeleton-title sk-line sk-title"></div>
          <div class="table-skeleton-body">
            <div class="sk-line" v-for="n in 8" :key="`tb2-skeleton-${n}`"></div>
          </div>
        </div>
        <CommonDataTable
          v-else
          :tableData="hotTagTable"
          titleType="tag"
          rowClickable
          @rowClick="handleHotTagClick"
          :title="t('workbench.table.tagHotTop10', '标签热度（Top 10）')"
          :columns="hotTagColumns"
        />
      </div>
    </div>

    <div class="table-grid">
      <div class="table-card">
        <div v-if="recentNotesLoading" class="table-skeleton">
          <div class="table-skeleton-title sk-line sk-title"></div>
          <div class="table-skeleton-body">
            <div class="sk-line" v-for="n in 8" :key="`tb3-skeleton-${n}`"></div>
          </div>
        </div>
        <CommonDataTable
          v-else
          :tableData="recentNoteTable"
          titleType="note"
          rowClickable
          @rowClick="handleRecentNoteClick"
          :title="t('workbench.table.recentNotes', '近期笔记')"
          :columns="recentNoteColumns"
        />
      </div>

      <div class="table-card">
        <div v-if="recentFilesLoading" class="table-skeleton">
          <div class="table-skeleton-title sk-line sk-title"></div>
          <div class="table-skeleton-body">
            <div class="sk-line" v-for="n in 8" :key="`tb4-skeleton-${n}`"></div>
          </div>
        </div>
        <CommonDataTable
          v-else
          titleType="file"
          rowClickable
          @rowClick="handleViewFile"
          :tableData="recentFileTable"
          :title="t('workbench.table.recentFiles', '近期文件')"
          :columns="recentFileColumns"
        />
        <FilePreview v-model:visible="fileVisible" :fileInfo="activeFile" @close="fileVisible = false" />
      </div>
    </div>

    <div v-if="user.role === 'root'" class="admin-table-card">
      <div v-if="userStatsLoading" class="table-skeleton">
        <div class="table-skeleton-title sk-line sk-title"></div>
        <div class="table-skeleton-body">
          <div class="sk-line" v-for="n in 8" :key="`tb5-skeleton-${n}`"></div>
        </div>
      </div>
      <CommonDataTable
        v-else
        :tableData="userStatsData"
        :columns="userStatsColumns"
        :title="t('workbench.table.userStats', '用户统计')"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed, ref, watch } from 'vue';
  import { apiBasePost, apiQueryPost } from '@/http/request.ts';
  import { getJsonInfo } from '@/config/jsonCfg.ts';
  import { API_TEXTS } from '@/config/constants.ts';
  import { bookmarkStore, cloudSpaceStore, useUserStore } from '@/store';
  import CommonDataTable from '@/components/workbenches/CommonDataTable.vue';
  import { useRouter } from 'vue-router';
  import { useI18n } from 'vue-i18n';
  import FilePreview from '@/components/FilePreview.vue';
  import WorkbenchCharts from '@/components/workbenches/WorkbenchCharts.vue';

  const bookmark = bookmarkStore();
  const cloud = cloudSpaceStore();
  const user = useUserStore();
  const router = useRouter();
  const { t } = useI18n();

  const bookmarkList = ref<any[]>([]);
  const noteList = ref<any[]>([]);
  const loadingTag = ref(true);
  const loadingBookmarks = ref(true);
  const loadingNotes = ref(true);
  const loadingCommonBookmarks = ref(true);
  const loadingCloud = ref(true);
  const loadingUpdateLogs = ref(true);
  const loadingUserStats = ref(false);
  const summaryLoading = computed(
    () => loadingTag.value || loadingBookmarks.value || loadingNotes.value || loadingCloud.value,
  );
  const activityLoading = computed(() => loadingBookmarks.value || loadingNotes.value || loadingCloud.value);
  const quickActionsLoading = computed(() => loadingBookmarks.value || loadingNotes.value);
  const updateLogsLoading = computed(() => loadingUpdateLogs.value);
  const commonBookmarksLoading = computed(() => loadingCommonBookmarks.value);
  const hotTagsLoading = computed(() => loadingBookmarks.value || loadingNotes.value);
  const recentNotesLoading = computed(() => loadingNotes.value);
  const recentFilesLoading = computed(() => loadingCloud.value);
  const userStatsLoading = computed(() => user.role === 'root' && loadingUserStats.value);

  const commonBookmarkTable = ref<any[]>([]);
  const updateLogList = ref<any[]>([]);
  const activeUpdateLogIndex = ref<number | null>(null);
  const userStatsData = ref<any[]>([]);
  const userStatsColumns = computed(() => [
    { title: t('workbench.table.alias', '别名'), key: 'alias' },
    { title: t('workbench.table.email', '邮箱'), key: 'email' },
    { title: t('workbench.table.password', '密码'), key: 'password' },
    { title: t('workbench.table.lastActiveTime', '最近活跃时间'), key: 'lastActiveTime' },
    { title: t('workbench.table.registerTime', '注册时间'), key: 'createTime' },
    { title: t('workbench.table.bookmarkCount', '书签数'), key: 'bookmarkTotal' },
    { title: t('workbench.table.tagCount', '标签数'), key: 'tagTotal' },
    { title: t('workbench.table.noteCount', '笔记数'), key: 'noteTotal' },
    { title: t('workbench.table.storageUsedMb', '云空间使用量 (MB)'), key: 'storageUsed' },
  ]);

  const summaryCards = computed(() => [
    {
      key: 'bookmark',
      label: t('workbench.summary.bookmarkTotal', '书签总数'),
      value: `${bookmarkList.value.length}`,
      extra: t('workbench.summary.toBookmarks', '点击进入书签页'),
      to: '/home',
    },
    {
      key: 'tag',
      label: t('workbench.summary.tagTotal', '标签总数'),
      value: `${bookmark.tagList.length}`,
      extra: t('workbench.summary.toTags', '点击进入标签管理'),
      to: '/manage/tagMg',
    },
    {
      key: 'note',
      label: t('workbench.summary.noteTotal', '笔记总数'),
      value: `${noteList.value.length}`,
      extra: t('workbench.summary.toNotes', '点击进入笔记库'),
      to: '/noteLibrary',
    },
    {
      key: 'cloud',
      label: t('workbench.summary.cloudUsage', '云空间使用'),
      value: `${cloud.usedSpace.toFixed(2)} / ${cloud.maxSpace} MB`,
      extra: t(
        'workbench.summary.cloudExtra',
        { percent: storagePercent.value },
        '当前使用率 {percent}% · 点击进入云空间',
      ),
      to: '/cloudSpace',
    },
  ]);

  const quickActions = computed(() => [
    {
      key: 'add-bookmark',
      label: t('workbench.actions.addBookmark.label', '新增书签'),
      desc: t('workbench.actions.addBookmark.desc', '快速收藏链接'),
      to: '/manage/editBookmark/add',
    },
    {
      key: 'add-tag',
      label: t('workbench.actions.addTag.label', '新增标签'),
      desc: t('workbench.actions.addTag.desc', '创建分类标签'),
      to: '/manage/editTag/add',
    },
    {
      key: 'add-note',
      label: t('workbench.actions.addNote.label', '新建笔记'),
      desc: t('workbench.actions.addNote.desc', '创建空白笔记'),
      to: '/noteLibrary/add',
    },
    {
      key: 'upload-file',
      label: t('workbench.actions.uploadFile.label', '上传文件'),
      desc: t('workbench.actions.uploadFile.desc', '进入云空间上传'),
      to: '/cloudSpace',
    },
    {
      key: 'bookmark-mg',
      label: t('workbench.actions.bookmarkManage.label', '书签管理'),
      desc: t('workbench.actions.bookmarkManage.desc', '整理全部书签'),
      to: '/manage/bookmarkMg',
    },
    {
      key: 'tag-mg',
      label: t('workbench.actions.tagManage.label', '标签管理'),
      desc: t('workbench.actions.tagManage.desc', '维护标签体系'),
      to: '/manage/tagMg',
    },
    {
      key: 'note-lib',
      label: t('workbench.actions.noteLibrary.label', '进入笔记库'),
      desc: t('workbench.actions.noteLibrary.desc', '查看全部笔记'),
      to: '/noteLibrary',
    },
    {
      key: 'update-log',
      label: t('workbench.actions.updateLogs.label', '更新日志'),
      desc: t('workbench.actions.updateLogs.desc', '查看最近更新'),
      to: '/updateLogs',
    },
  ]);

  const commonBookmarkColumns = computed(() => [
    { title: t('workbench.table.rank', '排名'), key: 'index', width: '70px' },
    { title: t('workbench.table.bookmark', '书签'), key: 'name', width: '300px' },
    { title: t('workbench.table.visits', '访问次数'), key: 'count' },
  ]);

  const hotTagColumns = computed(() => [
    { title: t('workbench.table.rank', '排名'), key: 'index', width: '70px' },
    { title: t('workbench.table.tag', '标签'), key: 'name' },
    { title: t('workbench.table.relatedBookmarks', '关联书签'), key: 'bookmarkCount', width: '110px' },
    { title: t('workbench.table.relatedNotes', '关联笔记'), key: 'noteCount', width: '110px' },
    { title: t('workbench.table.totalHeat', '总热度'), key: 'total', width: '90px' },
  ]);

  const recentNoteColumns = computed(() => [
    { title: t('workbench.table.title', '标题'), key: 'title' },
    { title: t('workbench.table.updateTime', '更新时间'), key: 'updateTime', width: '200px' },
    { title: t('workbench.table.tagCount', '标签数'), key: 'tagCount', width: '90px' },
  ]);

  const recentFileColumns = computed(() => [
    { title: t('workbench.table.fileName', '文件名'), key: 'fileName' },
    { title: t('workbench.table.uploadTime', '上传时间'), key: 'uploadTime', width: '200px' },
    { title: t('workbench.table.sizeMb', '大小(MB)'), key: 'fileSizeMB', width: '100px' },
  ]);

  const storagePercent = computed(() => {
    if (!cloud.maxSpace) return 0;
    return Math.min(100, Number(((cloud.usedSpace / cloud.maxSpace) * 100).toFixed(1)));
  });

  const trendChartData = computed(() => {
    const days = Array.from({ length: 7 }, (_, index) => {
      const current = new Date();
      current.setHours(0, 0, 0, 0);
      current.setDate(current.getDate() - (6 - index));
      return current;
    });

    const dayLabel = (date: Date) => {
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${month}-${day}`;
    };

    const dateCount = (items: any[], dateField: string) => {
      const map: Record<string, number> = {};
      days.forEach((date) => {
        map[dayLabel(date)] = 0;
      });
      items.forEach((item) => {
        const raw = item?.[dateField];
        if (!raw) return;
        const date = new Date(raw);
        if (Number.isNaN(date.getTime())) return;
        const key = dayLabel(date);
        if (Object.prototype.hasOwnProperty.call(map, key)) {
          map[key] += 1;
        }
      });
      return map;
    };

    const bookmarkMap = dateCount(bookmarkList.value, 'createTime');
    const noteMap = dateCount(noteList.value, 'updateTime');
    const fileMap = dateCount(cloud.fileList || [], 'uploadTime');

    const data: { date: string; type: string; value: number }[] = [];
    days.forEach((date) => {
      const label = dayLabel(date);
      data.push({ date: label, type: t('workbench.chart.bookmark', '书签'), value: bookmarkMap[label] || 0 });
      data.push({ date: label, type: t('workbench.chart.note', '笔记'), value: noteMap[label] || 0 });
      data.push({ date: label, type: t('workbench.chart.file', '文件'), value: fileMap[label] || 0 });
    });

    return data;
  });

  const fileTypeChartData = computed(() => {
    const map: Record<string, number> = {};

    const getType = (item: any) => {
      const fileType = (item?.fileType || '').toLowerCase();
      const fileName = (item?.fileName || '').toLowerCase();

      if (fileType.includes('image') || /\.(png|jpg|jpeg|gif|webp|svg|bmp)$/.test(fileName)) return '图片';
      if (fileType.includes('video') || /\.(mp4|avi|mov|wmv|flv|webm)$/.test(fileName)) return '视频';
      if (fileType.includes('audio') || /\.(mp3|wav|ogg|flac|aac)$/.test(fileName)) return '音频';
      if (fileType.includes('pdf') || fileName.endsWith('.pdf')) return 'PDF';
      if (fileType.includes('word') || /\.(doc|docx)$/.test(fileName)) return 'Word';
      if (fileType.includes('excel') || /\.(xls|xlsx)$/.test(fileName)) return 'Excel';
      if (fileType.includes('text') || /\.(txt|md|json|xml|csv|log)$/.test(fileName)) return '文本';
      return '其他';
    };

    (cloud.fileList || []).forEach((item) => {
      const type = getType(item);
      map[type] = (map[type] || 0) + 1;
    });

    return Object.entries(map).map(([type, value]) => ({ type, value }));
  });

  const weeklyStats = computed(() => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const bookmark = bookmarkList.value.filter((item) => new Date(item.createTime || 0).getTime() >= weekAgo).length;
    const note = noteList.value.filter(
      (item) => new Date(item.updateTime || item.createTime || 0).getTime() >= weekAgo,
    ).length;
    const file = (cloud.fileList || []).filter((item) => new Date(item.uploadTime || 0).getTime() >= weekAgo).length;
    return { bookmark, note, file };
  });

  const activeUpdateLog = computed(() => {
    if (activeUpdateLogIndex.value === null) {
      return null;
    }
    return updateLogList.value[activeUpdateLogIndex.value] || null;
  });

  const recentNoteTable = computed(() => {
    return [...noteList.value]
      .sort(
        (a, b) =>
          new Date(b.updateTime || b.createTime || 0).getTime() - new Date(a.updateTime || a.createTime || 0).getTime(),
      )
      .slice(0, 10)
      .map((item) => ({
        id: item.id,
        title: item.title || t('noteDetail.unnamedDoc', '未命名文档'),
        updateTime: item.updateTime || item.createTime || '-',
        tagCount: Array.isArray(item.tags) ? item.tags.length : 0,
      }));
  });

  const recentFileTable = computed(() => {
    return [...(cloud.fileList || [])]
      .sort((a, b) => new Date(b.uploadTime || 0).getTime() - new Date(a.uploadTime || 0).getTime())
      .slice(0, 10)
      .map((item) => ({
        fileName: item.fileName,
        fileType: item.fileType,
        fileSizeMB: Number(((item.fileSize || 0) / 1024 / 1024).toFixed(2)),
        uploadTime: item.uploadTime || '-',
        fileUrl: item.fileUrl,
        id: item.id,
      }));
  });

  const hotTagTable = computed(() => {
    const hotMap: Record<
      string,
      { id: string; name: string; bookmarkCount: number; noteCount: number; total: number }
    > = {};
    bookmarkList.value.forEach((item) => {
      (item.tagList || []).forEach((tag) => {
        if (!hotMap[tag.id]) {
          hotMap[tag.id] = { id: tag.id, name: tag.name, bookmarkCount: 0, noteCount: 0, total: 0 };
        }
        hotMap[tag.id].bookmarkCount += 1;
        hotMap[tag.id].total += 1;
      });
    });

    noteList.value.forEach((item) => {
      (item.tags || []).forEach((tag) => {
        if (!hotMap[tag.id]) {
          hotMap[tag.id] = { id: tag.id, name: tag.name, bookmarkCount: 0, noteCount: 0, total: 0 };
        }
        hotMap[tag.id].noteCount += 1;
        hotMap[tag.id].total += 1;
      });
    });

    const res = Object.values(hotMap)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
    return res.map((item, index) => ({ ...item, index: index + 1 }));
  });

  function handleCommonBookmarkClick(record) {
    if (record?.id) {
      router.push(`/manage/editBookmark/${record.id}`);
      return;
    }
    router.push('/home');
  }

  function handleHotTagClick(record) {
    if (record?.id) {
      router.push(`/home/${record.id}`);
      return;
    }
    router.push('/manage/tagMg');
  }

  function handleRecentNoteClick(record) {
    if (record?.id) {
      router.push(`/noteLibrary/${record.id}`);
      return;
    }
    router.push('/noteLibrary');
  }

  const fileVisible = ref(false);
  const activeFile = ref<any>(null);
  function handleViewFile(file) {
    activeFile.value = file;
    fileVisible.value = true;
  }

  function toggleUpdateLog(index: number) {
    activeUpdateLogIndex.value = activeUpdateLogIndex.value === index ? null : index;
  }

  async function init() {
    loadingTag.value = true;
    loadingBookmarks.value = true;
    loadingNotes.value = true;
    loadingCommonBookmarks.value = true;
    loadingCloud.value = true;
    loadingUpdateLogs.value = true;
    loadingUserStats.value = user.role === 'root';

    const tasks: Promise<any>[] = [
      fetchTagList(),
      fetchBookmarkList(),
      fetchNoteList(),
      fetchCommonBookmarks(),
      fetchCloudData(),
      fetchUpdateLogs(),
    ];
    if (user.role === 'root') {
      tasks.push(fetchUserStats());
    }
    await Promise.allSettled(tasks);
  }

  async function fetchUpdateLogs() {
    loadingUpdateLogs.value = true;
    try {
      const res = await getJsonInfo(API_TEXTS.CHANGELOG);
      const content =
        typeof res.data.jsonContent === 'string' ? JSON.parse(res.data.jsonContent || '[]') : res.data.jsonContent;
      const logs = Array.isArray(content) ? [...content].reverse() : [];
      updateLogList.value = logs;
      activeUpdateLogIndex.value = logs.length ? 0 : null;
    } catch (error) {
      console.warn('fetchUpdateLogs fallback', error);
      updateLogList.value = [];
      activeUpdateLogIndex.value = null;
    } finally {
      loadingUpdateLogs.value = false;
    }
  }

  // 获取标签列表
  async function fetchTagList() {
    loadingTag.value = true;
    try {
      const res = await apiQueryPost('/api/bookmark/queryTagList', {
        filters: { userId: user.id },
      });
      if (res.status === 200) {
        bookmark.tagList = res.data || [];
        user.tagTotal = bookmark.tagList.length;
      }
    } finally {
      loadingTag.value = false;
    }
  }

  // 获取书签列表
  async function fetchBookmarkList() {
    loadingBookmarks.value = true;
    try {
      const res = await apiQueryPost('/api/bookmark/getBookmarkList', {
        filters: { userId: user.id, type: 'all' },
      });
      if (res.status === 200) {
        bookmarkList.value = res.data.items || [];
        bookmark.bookmarkList = bookmarkList.value;
        user.bookmarkTotal = bookmarkList.value.length;
      }
    } finally {
      loadingBookmarks.value = false;
    }
  }

  // 获取笔记列表
  async function fetchNoteList() {
    loadingNotes.value = true;
    try {
      const res = await apiBasePost('/api/note/queryNoteList');
      if (res.status === 200) {
        noteList.value = res.data || [];
        bookmark.noteList = noteList.value;
        user.noteTotal = noteList.value.length;
      }
    } finally {
      loadingNotes.value = false;
    }
  }

  // 获取常用书签
  async function fetchCommonBookmarks() {
    loadingCommonBookmarks.value = true;
    try {
      const res = await apiBasePost('/api/bookmark/getCommonBookmarks');
      if (res.status === 200 && Array.isArray(res.data.items)) {
        commonBookmarkTable.value = res.data.items.map((item, index) => ({ ...item, index: index + 1 }));
      } else {
        commonBookmarkTable.value = [];
      }
    } finally {
      loadingCommonBookmarks.value = false;
    }
  }

  async function fetchCloudData() {
    loadingCloud.value = true;
    try {
      const fileRes = await apiQueryPost('/api/file/queryFiles', {
        filters: {
          fileName: '',
          type: cloud.typeCheckValue,
          folderId: 'all',
        },
      });
      if (fileRes.status === 200) {
        cloud.fileList = fileRes.data || [];
      }

      const sizeRes = await apiBasePost('/api/file/queryTotalFileSize');
      if (sizeRes.status === 200) {
        cloud.usedSpace = sizeRes.data.totalSizeMB || 0;
      }
    } finally {
      loadingCloud.value = false;
    }
  }

  async function fetchUserStats() {
    loadingUserStats.value = true;
    try {
      const res = await apiQueryPost('/api/user/getUserList', {
        currentPage: 1,
        pageSize: 100,
        filters: {
          key: '',
        },
      });
      if (res.status === 200) {
        userStatsData.value = res.data.items;
      }
    } finally {
      loadingUserStats.value = false;
    }
  }

  const hasInitedOnce = ref(false);
  const initRunning = ref(false);

  watch(
    () => user.id,
    async (val, oldVal) => {
      if (!val) return;
      if (initRunning.value) return;
      if (hasInitedOnce.value && val === oldVal) return;
      initRunning.value = true;
      try {
        await init();
        hasInitedOnce.value = true;
      } finally {
        initRunning.value = false;
      }
    },
    { immediate: true },
  );
</script>

<style lang="less" scoped>
  .workbenches-container {
    height: 100%;
    width: 100%;
    padding: 20px;
    gap: 14px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    overflow-x: hidden;
    border-radius: 14px;
  }

  .workbenches-container > * {
    flex-shrink: 0;
  }

  .workbench-header {
    display: flex;
    flex-direction: column;
    gap: 6px;
    .title {
      font-size: 22px;
      font-weight: 600;
    }
    .subtitle {
      font-size: 13px;
      opacity: 0.8;
    }
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(180px, 1fr));
    gap: 12px;
  }

  .sk-line {
    width: 100%;
    height: 12px;
    border-radius: 6px;
    background: linear-gradient(
      90deg,
      var(--bl-input-noBorder-bg-color) 20%,
      var(--skeleton-body-bg-color) 50%,
      var(--bl-input-noBorder-bg-color) 80%
    );
    background-size: 200% 100%;
    animation: workbench-skeleton-shine 1.2s infinite;
  }

  .sk-line.sk-short {
    width: 40%;
  }

  .sk-line.sk-title {
    width: 60%;
    height: 18px;
  }

  .sk-line.sk-label {
    width: 34%;
    height: 12px;
  }

  .sk-line.sk-value {
    width: 72%;
    height: 23px;
  }

  .sk-line.sk-extra {
    width: 58%;
    height: 12px;
  }

  .sk-line.sk-number {
    width: 30%;
    height: 18px;
  }

  .sk-line.sk-action-title {
    width: 55%;
    height: 12px;
  }

  .sk-line.sk-action-desc {
    width: 72%;
    height: 11px;
  }

  .sk-pill {
    width: 46px;
    height: 18px;
    border-radius: 999px;
    background: linear-gradient(
      90deg,
      var(--bl-input-noBorder-bg-color) 20%,
      var(--skeleton-body-bg-color) 50%,
      var(--bl-input-noBorder-bg-color) 80%
    );
    background-size: 200% 100%;
    animation: workbench-skeleton-shine 1.2s infinite;
  }

  .sk-mini-bar {
    height: 100%;
    width: 52%;
    border-radius: 999px;
    background: linear-gradient(
      90deg,
      var(--bl-input-noBorder-bg-color) 20%,
      var(--skeleton-body-bg-color) 50%,
      var(--bl-input-noBorder-bg-color) 80%
    );
    background-size: 200% 100%;
    animation: workbench-skeleton-shine 1.2s infinite;
  }

  .summary-card {
    --summary-accent-start: var(--workbench-accent-bookmark-start);
    --summary-accent-end: var(--workbench-accent-bookmark-end);
    position: relative;
    padding: 14px;
    border-radius: 12px;
    box-sizing: border-box;
    cursor: pointer;
    overflow: hidden;
    box-shadow:
      0 14px 22px -20px var(--workbench-summary-shadow-color),
      inset 0 1px 0 var(--workbench-summary-inner-line);
    background:
      linear-gradient(180deg, var(--workbench-summary-surface-top), var(--workbench-summary-surface-bottom)),
      linear-gradient(135deg, transparent 0%, var(--workbench-summary-pattern-color) 100%);
    color: var(--text-color);
    border: 1px solid var(--workbench-summary-border-color);
    transition:
      transform 0.2s ease,
      border-color 0.2s ease;

    &::before,
    &::after {
      content: '';
      position: absolute;
      pointer-events: none;
      z-index: 0;
    }

    &::before {
      left: 0;
      right: 0;
      top: 0;
      height: 3px;
      background: linear-gradient(90deg, var(--summary-accent-start), var(--summary-accent-end));
      opacity: 0.96;
    }

    &::after {
      width: 120px;
      height: 120px;
      right: -44px;
      bottom: -52px;
      border-radius: 20px;
      background: radial-gradient(circle, var(--workbench-summary-pattern-color) 0%, transparent 70%);
      opacity: 0.75;
    }

    > * {
      position: relative;
      z-index: 1;
    }

    &:hover {
      transform: translateY(-2px);
      border-color: var(--noteType-border-color);
    }

    .summary-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .summary-label {
      font-size: 13px;
      opacity: 0.8;
    }

    .summary-pill {
      font-size: 12px;
      padding: 2px 8px;
      border-radius: 999px;
      background: linear-gradient(120deg, var(--summary-accent-start), var(--summary-accent-end));
      color: #fff;
      border: none;
      box-shadow: none;
    }

    .summary-value {
      margin-top: 10px;
      font-size: 23px;
      font-weight: 600;
    }

    .summary-mini-track {
      margin-top: 10px;
      width: 100%;
      height: 6px;
      border-radius: 999px;
      background-color: var(--bl-input-noBorder-bg-color);
      overflow: hidden;
    }

    .summary-mini-bar {
      height: 100%;
      border-radius: 999px;
      background: linear-gradient(90deg, var(--summary-accent-start), var(--summary-accent-end));
    }

    .summary-extra {
      margin-top: 8px;
      font-size: 12px;
      opacity: 0.65;
    }
  }

  .summary-card--bookmark {
    --summary-accent-start: var(--workbench-accent-bookmark-start);
    --summary-accent-end: var(--workbench-accent-bookmark-end);
  }

  .summary-card--tag {
    --summary-accent-start: var(--workbench-accent-tag-start);
    --summary-accent-end: var(--workbench-accent-tag-end);
  }

  .summary-card--note {
    --summary-accent-start: var(--workbench-accent-note-start);
    --summary-accent-end: var(--workbench-accent-note-end);
  }

  .summary-card--cloud {
    --summary-accent-start: var(--workbench-accent-file-start);
    --summary-accent-end: var(--workbench-accent-file-end);
  }

  [data-theme='night'] .summary-card::after {
    opacity: 0.9;
  }

  .summary-skeleton {
    pointer-events: none;
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow: hidden;
  }

  .insight-grid {
    --insight-card-height: 270px;
    display: grid;
    grid-template-columns: minmax(210px, 0.65fr) minmax(0, 1.55fr) minmax(280px, 1.1fr);
    gap: 12px;
    align-items: stretch;
  }

  .panel-card {
    --panel-accent: var(--workbench-insight-activity-accent);
    position: relative;
    border-radius: 12px;
    padding: 14px;
    box-sizing: border-box;
    background: linear-gradient(160deg, var(--workbench-surface-start), var(--workbench-surface-end));
    box-shadow:
      0 14px 26px -20px var(--workbench-shadow-color),
      inset 0 1px 0 rgba(255, 255, 255, 0.18);
    color: var(--text-color);
    height: var(--insight-card-height);
    border: 1px solid var(--workbench-border-color);
    display: flex;
    flex-direction: column;
    overflow: hidden;

    &::before,
    &::after {
      content: '';
      position: absolute;
      pointer-events: none;
      z-index: 0;
    }

    &::before {
      width: 180px;
      height: 180px;
      right: -92px;
      top: -96px;
      border-radius: 999px;
      background: radial-gradient(circle, color-mix(in srgb, var(--panel-accent) 26%, transparent) 0%, transparent 72%);
      opacity: 0.95;
    }

    &::after {
      left: -56px;
      bottom: -64px;
      width: 180px;
      height: 180px;
      border-radius: 44px;
      transform: rotate(-18deg);
      background: linear-gradient(140deg, var(--workbench-pattern-color), transparent 68%);
      opacity: 0.9;
    }

    > * {
      position: relative;
      z-index: 1;
    }
  }

  .panel-title {
    font-size: 13px;
    opacity: 0.9;
    font-weight: 600;
    display: inline-flex;
    align-items: center;
    gap: 8px;

    &::before {
      content: '';
      width: 6px;
      height: 6px;
      border-radius: 999px;
      background: var(--panel-accent);
      box-shadow: 0 0 0 4px color-mix(in srgb, var(--panel-accent) 18%, transparent);
      flex-shrink: 0;
    }
  }

  .panel-desc {
    margin-top: 10px;
    font-size: 12px;
    opacity: 0.7;
  }

  .activity-grid {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 8px;
    flex: 1;
    min-height: 0;
  }

  .activity-item {
    border-radius: 10px;
    padding: 8px;
    background: linear-gradient(150deg, var(--workbench-subcard-bg), transparent 160%);
    border: 1px solid var(--workbench-subcard-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex: 1;
    min-height: 0;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
  }

  .activity-label {
    font-size: 12px;
    opacity: 0.75;
  }

  .activity-skeleton-item {
    justify-content: space-between;
  }

  .activity-value {
    font-size: 18px;
    font-weight: 600;
    margin-top: 0;
  }

  .quick-action-grid {
    margin-top: 8px;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    grid-template-rows: repeat(2, minmax(0, 1fr));
    gap: 8px;
    flex: 1;
    min-height: 0;

    > * {
      min-width: 0;
      min-height: 0;
    }
  }

  .quick-action-item {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    width: 100%;
    box-sizing: border-box;
    border: 1px solid var(--workbench-subcard-border);
    border-radius: 10px;
    background: linear-gradient(145deg, var(--workbench-subcard-bg), transparent 140%);
    color: var(--text-color);
    padding: 16px;
    text-align: left;
    cursor: pointer;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
    transition:
      transform 0.2s ease,
      border-color 0.2s ease,
      background-color 0.2s ease;
    justify-content: center;
    height: 100%;

    &:hover {
      transform: translateY(-2px);
      border-color: color-mix(in srgb, var(--panel-accent) 48%, var(--workbench-subcard-border));
      background-color: var(--workbench-subcard-hover);
    }
  }

  .action-name {
    font-size: 12px;
    font-weight: 600;
    color: color-mix(in srgb, var(--panel-accent) 66%, var(--text-color));
  }

  .action-desc {
    font-size: 11px;
    opacity: 0.72;
  }

  .quick-skeleton-item {
    pointer-events: none;
    box-shadow: none;
    height: auto;
    overflow: hidden;
  }

  .quick-panel {
    --panel-accent: var(--workbench-insight-quick-accent);
    height: var(--insight-card-height);
  }

  .activity-panel {
    --panel-accent: var(--workbench-insight-activity-accent);
    height: var(--insight-card-height);
  }

  .update-log-panel {
    --panel-accent: var(--workbench-insight-log-accent);
    height: var(--insight-card-height);
  }

  .update-log-content {
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 1;
    min-height: 0;
  }

  .update-log-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .skeleton-log-list {
    overflow: hidden;
  }

  .update-log-title {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid var(--workbench-subcard-border);
    border-radius: 8px;
    background: linear-gradient(145deg, var(--workbench-subcard-bg), transparent 140%);
    color: var(--text-color);
    text-align: left;
    padding: 7px 9px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    transition:
      border-color 0.2s ease,
      background-color 0.2s ease;

    &:hover {
      border-color: color-mix(in srgb, var(--panel-accent) 44%, var(--workbench-subcard-border));
      background-color: var(--workbench-subcard-hover);
    }
  }

  .table-skeleton {
    height: 100%;
    border-radius: 12px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: linear-gradient(160deg, var(--workbench-subcard-bg), transparent 130%);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
    box-sizing: border-box;
    overflow: hidden;
  }

  .skeleton-log-content {
    overflow: hidden;
  }

  .table-skeleton-title {
    flex-shrink: 0;
  }

  .table-skeleton-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .update-log-title.active {
    border-color: var(--workbench-active-border);
    background: linear-gradient(120deg, var(--workbench-active-bg), var(--workbench-subcard-bg));
  }

  .log-label {
    font-size: 12px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .log-time {
    font-size: 11px;
    opacity: 0.7;
    flex-shrink: 0;
  }

  .update-log-detail {
    border-radius: 10px;
    border: 1px solid var(--workbench-subcard-border);
    background: linear-gradient(160deg, var(--workbench-subcard-bg), transparent 120%);
    padding: 8px;
    margin-right: -8px; // 让滚动条和标题列表的滚动条对齐
    flex: 0.6;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .detail-title {
    font-size: 12px;
    font-weight: 600;
    opacity: 0.85;
  }

  .detail-list {
    margin-top: 6px;
    display: flex;
    flex-direction: column;
    gap: 5px;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  .detail-item {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    font-size: 12px;
  }

  .detail-index {
    opacity: 0.75;
  }

  .detail-text {
    opacity: 0.9;
    word-break: break-word;
  }

  .empty-log {
    margin-top: 8px;
    font-size: 12px;
    opacity: 0.65;
  }

  .list-empty {
    flex: 1;
    min-height: 0;
    margin-top: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    border: 1px dashed var(--workbench-table-empty-border);
    background-color: var(--workbench-table-empty-bg);
  }

  @keyframes workbench-skeleton-shine {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  .table-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    grid-auto-rows: 320px;
    align-items: stretch;
  }

  .table-card,
  .admin-table-card {
    position: relative;
    min-height: 0;
    border-radius: 12px;
    padding: 8px;
    background: linear-gradient(160deg, var(--workbench-surface-start), var(--workbench-surface-end));
    border: 1px solid var(--workbench-border-color);
    box-shadow:
      0 14px 26px -22px var(--workbench-shadow-color),
      inset 0 1px 0 rgba(255, 255, 255, 0.14);
    box-sizing: border-box;
    overflow: hidden;

    > * {
      position: relative;
      z-index: 1;
    }
  }

  .table-card {
    height: 100%;

    &::before {
      content: '';
      position: absolute;
      width: 180px;
      height: 180px;
      right: -88px;
      top: -96px;
      border-radius: 999px;
      background: radial-gradient(circle, var(--workbench-pattern-color) 0%, transparent 70%);
      pointer-events: none;
      z-index: 0;
    }
  }

  .admin-table-card {
    height: 380px;

    &::before {
      content: '';
      position: absolute;
      width: 220px;
      height: 220px;
      left: -120px;
      bottom: -122px;
      border-radius: 999px;
      background: radial-gradient(circle, var(--workbench-pattern-color) 0%, transparent 72%);
      pointer-events: none;
      z-index: 0;
    }
  }

  @media (max-width: 1200px) {
    .summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .insight-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      --insight-card-height: 260px;
    }
    .update-log-panel {
      grid-column: 1 / -1;
    }
    .table-grid {
      grid-template-columns: 1fr;
    }
    .quick-action-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 768px) {
    .summary-grid {
      grid-template-columns: 1fr;
    }
    .insight-grid {
      grid-template-columns: 1fr;
      --insight-card-height: 240px;
    }
    .quick-action-grid {
      grid-template-columns: 1fr;
    }
    .update-log-panel {
      grid-column: auto;
    }
  }
</style>
