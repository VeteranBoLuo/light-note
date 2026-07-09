<template>
  <div class="workbenches-container">
    <div class="workbench-header">
      <div class="title">{{ t('workbench.title', '工作台') }}</div>
      <div class="subtitle">{{ t('workbench.subtitle', '聚合查看书签、笔记和云空间状态，快速完成常用操作。') }}</div>
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
        v-click-log="{ module: '工作台', operation: `查看【${item.label}】` }"
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

    <WorkbenchGrowth />

    <div class="insight-grid">
      <div class="panel-card activity-panel">
        <div class="panel-title">{{ t('workbench.panel.weeklyActive', '本周活跃') }}</div>
        <div v-if="activityLoading" class="activity-ring-wrap">
          <div class="ring-skeleton"></div>
        </div>
        <div v-else class="activity-ring-wrap">
          <div class="activity-ring-stage">
            <svg viewBox="0 0 160 160" class="activity-rings-svg" aria-hidden="true">
              <defs>
                <linearGradient
                  id="ring-gradient-bookmark"
                  x1="18"
                  y1="80"
                  x2="142"
                  y2="80"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset="0%" stop-color="var(--workbench-accent-bookmark-start)" />
                  <stop offset="52%" stop-color="var(--workbench-accent-bookmark-end)" />
                  <stop offset="100%" stop-color="var(--workbench-accent-bookmark-start)" />
                  <animateTransform
                    attributeName="gradientTransform"
                    type="rotate"
                    from="0 80 80"
                    to="360 80 80"
                    dur="5s"
                    repeatCount="indefinite"
                  />
                </linearGradient>
                <linearGradient id="ring-gradient-note" x1="32" y1="80" x2="128" y2="80" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stop-color="var(--workbench-accent-note-start)" />
                  <stop offset="52%" stop-color="var(--workbench-accent-note-end)" />
                  <stop offset="100%" stop-color="var(--workbench-accent-note-start)" />
                  <animateTransform
                    attributeName="gradientTransform"
                    type="rotate"
                    from="120 80 80"
                    to="480 80 80"
                    dur="4.6s"
                    repeatCount="indefinite"
                  />
                </linearGradient>
                <linearGradient id="ring-gradient-file" x1="48" y1="80" x2="112" y2="80" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stop-color="var(--workbench-accent-file-start)" />
                  <stop offset="52%" stop-color="var(--workbench-accent-file-end)" />
                  <stop offset="100%" stop-color="var(--workbench-accent-file-start)" />
                  <animateTransform
                    attributeName="gradientTransform"
                    type="rotate"
                    from="240 80 80"
                    to="600 80 80"
                    dur="4.2s"
                    repeatCount="indefinite"
                  />
                </linearGradient>
                <filter id="ring-glow-bookmark" x="-40%" y="-40%" width="180%" height="180%">
                  <feGaussianBlur stdDeviation="3.2" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="ring-glow-note" x="-40%" y="-40%" width="180%" height="180%">
                  <feGaussianBlur stdDeviation="3.2" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <filter id="ring-glow-file" x="-40%" y="-40%" width="180%" height="180%">
                  <feGaussianBlur stdDeviation="3.2" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <circle class="ring-halo" cx="80" cy="80" r="67" fill="none" />
              <circle class="ring-track ring-track--single" cx="80" cy="80" r="56" fill="none" />
              <path
                v-for="segment in activityRingSegments"
                :key="segment.key"
                :class="['ring-progress', `ring-${segment.key}`]"
                :d="segment.path"
                fill="none"
                :stroke="segment.stroke"
                stroke-width="15"
                stroke-linecap="round"
                :filter="segment.filter"
              />
            </svg>
            <div class="ring-center-info">
              <div class="ring-center-value">{{ animatedTotalActivityCount }}</div>
              <div class="ring-center-label">{{ t('workbench.panel.weeklyChanges', '本周变化') }}</div>
              <div class="ring-center-extra"
                >{{ animatedActiveDays }}/{{ weekDays }} {{ t('workbench.panel.activeDays', '活跃天数') }}</div
              >
              <div class="ring-center-tooltip">{{ activityChangeTooltip }}</div>
            </div>
          </div>
          <div class="activity-ring-legend">
            <div v-for="item in activityLegendItems" :key="item.key" class="ring-legend-item">
              <span :class="['rc-dot', `rc-dot--${item.key}`]"></span>
              <span class="ring-legend-label">{{ item.label }}</span>
              <span class="ring-legend-value">{{ item.count }}</span>
            </div>
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
            v-click-log="{ module: '工作台', operation: `点击快捷操作【${action.label}】` }"
          >
            <span class="action-name">{{ action.label }}</span>
            <span class="action-desc">{{ action.desc }}</span>
          </button>
        </div>
      </div>

      <div class="panel-card preferences-panel">
        <div class="panel-title">{{ t('workbench.panel.preferences', '快捷偏好') }}</div>
        <div class="preferences-subtitle">
          {{ t('workbench.preferences.subtitle', '在这里快速设置主题、语言和默认首页。') }}
        </div>
        <div class="preference-group preference-group--theme">
          <div class="preference-label">{{ t('workbench.preferences.theme', '主题') }}</div>
          <div class="preference-options">
            <button
              v-for="option in themePreferenceOptions"
              :key="option.value"
              type="button"
              class="preference-chip dom-hover"
              :class="{ active: user.preferences.theme === option.value }"
              :disabled="preferenceSaving"
              @click="updatePreference('theme', option.value)"
              v-click-log="{ module: '工作台', operation: `设置主题偏好【${option.label}】` }"
            >
              {{ option.label }}
            </button>
          </div>
        </div>
        <div class="preference-group preference-group--language">
          <div class="preference-label">{{ t('workbench.preferences.language', '语言') }}</div>
          <div class="preference-options">
            <button
              v-for="option in languagePreferenceOptions"
              :key="option.value"
              type="button"
              class="preference-chip dom-hover"
              :class="{ active: user.preferences.lang === option.value }"
              :disabled="preferenceSaving"
              @click="updatePreference('lang', option.value)"
              v-click-log="{ module: '工作台', operation: `设置语言偏好【${option.label}】` }"
            >
              {{ option.label }}
            </button>
          </div>
        </div>
        <div class="preference-group preference-group--home">
          <div class="preference-label">
            {{ t('workbench.preferences.homePage', '默认首页') }}
            <b-tooltip title="设置后，每次打开网站默认进入所选模块。再次点击已选中的模块可取消，恢复为官网首页。">
              <svg class="homepage-hint-icon" width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"/>
                <path d="M9.5 9.5c0-1.5 1-2.5 2.5-2.5s2.5 1 2.5 2.5c0 1.5-2.5 3-2.5 4.5v1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                <circle cx="12" cy="18" r="0.8" fill="currentColor"/>
              </svg>
            </b-tooltip>
          </div>
          <div class="preference-options">
            <button
              v-for="option in homePagePreferenceOptions"
              :key="option.value"
              type="button"
              class="preference-chip dom-hover"
              :class="{ active: currentHomePage === option.value }"
              :disabled="preferenceSaving"
              @click="updatePreference('homePage', option.value)"
              v-click-log="{ module: '工作台', operation: `设置默认首页【${option.label}】` }"
            >
              {{ option.label }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="panel-card update-log-panel">
      <div class="panel-title">{{ t('workbench.panel.updateLogs', '更新日志') }}</div>
      <div v-if="updateLogsLoading" class="update-log-timeline skeleton-timeline">
        <div class="tl-track"></div>
        <div class="tl-node-skel" v-for="n in 4" :key="`ts-${n}`">
          <div class="sk-line"></div>
        </div>
      </div>
      <div v-else class="update-log-timeline">
        <div class="tl-track"></div>
        <div class="tl-entries">
          <button
            v-for="(log, index) in updateLogList"
            :key="`${log.label || 'log'}-${index}`"
            class="tl-entry"
            :class="{ 'tl-entry--active': activeUpdateLogIndex === index }"
            @click="toggleUpdateLog(index)"
            v-click-log="{ module: '工作台', operation: `查看更新日志【${log.time || index + 1}】` }"
          >
            <div class="tl-node">
              <div class="tl-dot"></div>
              <div class="tl-ripple" v-if="activeUpdateLogIndex === index"></div>
            </div>
            <div class="tl-content">
              <span class="tl-label" v-html="log.label || `${t('workbench.logs.update', '更新')} ${index + 1}`"></span>
              <span class="tl-time">{{ log.time || '-' }}</span>
            </div>
          </button>
          <div v-if="!updateLogList.length" class="tl-empty">{{ t('workbench.logs.empty', '暂无更新日志') }}</div>
        </div>
        <div class="tl-detail">
          <template v-if="activeUpdateLog">
            <div class="tl-detail-header">
              <div class="tl-detail-dot"></div>
              <div class="detail-title">{{ activeUpdateLog.time || t('workbench.logs.latest', '最近更新') }}</div>
            </div>
            <div class="detail-list" v-if="Array.isArray(activeUpdateLog.list) && activeUpdateLog.list.length">
              <div class="detail-item" v-for="(item, idx) in activeUpdateLog.list" :key="`detail-${idx}`">
                <span class="detail-index">{{ Number(idx) + 1 }}.</span>
                <span class="detail-text" v-html="item"></span>
              </div>
            </div>
          </template>
          <div v-else class="empty-log">{{ t('workbench.logs.clickForDetail', '点击日志标题查看详情') }}</div>
        </div>
      </div>
    </div>

    <WorkbenchCharts
      :loading="activityLoading"
      :themeKey="user.currentTheme || 'day'"
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
          :title="t('workbench.table.unifiedTagHotTop10', '统一标签热度（Top 10）')"
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
  import { computed, defineAsyncComponent, ref, watch } from 'vue';
  import { apiBasePost, apiQueryPost } from '@/http/request.ts';
  import { openBookmarkUrl } from '@/utils/openBookmark.ts';
  import { getJsonInfo } from '@/config/jsonCfg.ts';
  import { API_TEXTS } from '@/config/constants.ts';
  import { cloudSpaceStore, useUserStore } from '@/store';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import CommonDataTable from '@/components/workbenches/CommonDataTable.vue';
  import { useRouter } from 'vue-router';
  import { useI18n } from 'vue-i18n';
  import WorkbenchCharts from '@/components/workbenches/WorkbenchCharts.vue';
  import WorkbenchGrowth from '@/components/workbenches/WorkbenchGrowth.vue';
  import { CLOUD_FILE_CATEGORY_LABEL_KEY } from '@/constants/cloudFileCategory.ts';
import { formatStorageSize } from '@/utils/common';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { updatePreference as commitPreference } from '@/utils/savePreference';
  import {
    getHomePagePreference,
    type HomePagePreference,
    type LanguagePreference,
    type ThemePreference,
  } from '@/utils/preferences.ts';
  import { recordOperation } from '@/api/commonApi.ts';
  const FilePreview = defineAsyncComponent(() => import('@/components/FilePreview.vue'));

  const cloud = cloudSpaceStore();
  const user = useUserStore();
  const router = useRouter();
  const { t } = useI18n();

  const loadingWorkbench = ref(true);
  const loadingUpdateLogs = ref(true);
  const loadingUserStats = ref(false);
  const preferenceSaving = ref(false);
  const summaryLoading = computed(() => loadingWorkbench.value);
  const activityLoading = computed(() => loadingWorkbench.value);
  const quickActionsLoading = computed(() => loadingWorkbench.value);
  const updateLogsLoading = computed(() => loadingUpdateLogs.value);
  const commonBookmarksLoading = computed(() => loadingWorkbench.value);
  const hotTagsLoading = computed(() => loadingWorkbench.value);
  const recentNotesLoading = computed(() => loadingWorkbench.value);
  const recentFilesLoading = computed(() => loadingWorkbench.value);
  const userStatsLoading = computed(() => user.role === 'root' && loadingUserStats.value);

  const commonBookmarkTable = ref<any[]>([]);
  const hotTagTable = ref<any[]>([]);
  const recentNoteTable = ref<any[]>([]);
  const recentFileTable = ref<any[]>([]);
  const trendSummary = ref<any[]>([]);
  const fileTypeSummary = ref<any[]>([]);
  const weeklyStats = ref({ bookmark: 0, note: 0, file: 0 });

  // ─── Activity Rings Animation ────────────────────────────
  type ActivityMetricKey = 'bookmark' | 'note' | 'file';

  const weekDays = ref(7);
  const activityMetricKeys: ActivityMetricKey[] = ['bookmark', 'note', 'file'];
  const animatedBookmark = ref(0);
  const animatedNote = ref(0);
  const animatedFile = ref(0);
  const animatedActiveDays = ref(0);
  const animatedTotalActivityCount = ref(0);
  const activityRingProgress = ref(0);

  const weeklyActivityBreakdown = computed(() => {
    const counts = {
      bookmark: Number(weeklyStats.value.bookmark || 0),
      note: Number(weeklyStats.value.note || 0),
      file: Number(weeklyStats.value.file || 0),
    };
    const days: Record<ActivityMetricKey, number> = { bookmark: 0, note: 0, file: 0 };
    let totalActiveDays = 0;

    if (trendSummary.value.length) {
      trendSummary.value.slice(-weekDays.value).forEach((item) => {
        let dayIsActive = false;
        activityMetricKeys.forEach((key) => {
          if (Number(item?.[key] || 0) > 0) {
            days[key] += 1;
            dayIsActive = true;
          }
        });
        if (dayIsActive) totalActiveDays += 1;
      });
    } else {
      const maxCount = Math.max(counts.bookmark, counts.note, counts.file, 1);
      activityMetricKeys.forEach((key) => {
        days[key] = counts[key] > 0 ? Math.max(1, Math.ceil((counts[key] / maxCount) * weekDays.value)) : 0;
      });
      totalActiveDays = Math.max(days.bookmark, days.note, days.file);
    }

    const ratios = {
      bookmark: 0,
      note: 0,
      file: 0,
    };
    const totalActivityCount = Math.max(counts.bookmark + counts.note + counts.file, 1);
    activityMetricKeys.forEach((key) => {
      ratios[key] = counts[key] / totalActivityCount;
    });

    const percents = {
      bookmark: Math.round(ratios.bookmark * 100),
      note: Math.round(ratios.note * 100),
      file: Math.round(ratios.file * 100),
    };

    return { counts, days, ratios, percents, totalActiveDays };
  });

  const activityLegendItems = computed(() => [
    {
      key: 'bookmark',
      label: t('workbench.panel.newBookmarks', '新增书签'),
      count: animatedBookmark.value,
      days: weeklyActivityBreakdown.value.days.bookmark,
    },
    {
      key: 'note',
      label: t('workbench.panel.updatedNotes', '更新笔记'),
      count: animatedNote.value,
      days: weeklyActivityBreakdown.value.days.note,
    },
    {
      key: 'file',
      label: t('workbench.panel.uploadedFiles', '上传文件'),
      count: animatedFile.value,
      days: weeklyActivityBreakdown.value.days.file,
    },
  ]);

  const activityChangeTooltip = computed(() => {
    return t('workbench.panel.weeklyChangesTip', '本周变化 = 本周新增书签、创建或更新笔记、上传文件的合计。');
  });

  function describeRingArc(cx: number, cy: number, radius: number, startRatio: number, endRatio: number) {
    const startAngle = -Math.PI / 2 + startRatio * Math.PI * 2;
    const endAngle = -Math.PI / 2 + endRatio * Math.PI * 2;
    const startX = cx + radius * Math.cos(startAngle);
    const startY = cy + radius * Math.sin(startAngle);
    const endX = cx + radius * Math.cos(endAngle);
    const endY = cy + radius * Math.sin(endAngle);
    const largeArcFlag = endRatio - startRatio > 0.5 ? 1 : 0;
    return `M ${startX.toFixed(3)} ${startY.toFixed(3)} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX.toFixed(3)} ${endY.toFixed(3)}`;
  }

  const activityRingSegments = computed(() => {
    const segments = [
      {
        key: 'bookmark',
        ratio: weeklyActivityBreakdown.value.ratios.bookmark,
        stroke: 'url(#ring-gradient-bookmark)',
        filter: 'url(#ring-glow-bookmark)',
      },
      {
        key: 'note',
        ratio: weeklyActivityBreakdown.value.ratios.note,
        stroke: 'url(#ring-gradient-note)',
        filter: 'url(#ring-glow-note)',
      },
      {
        key: 'file',
        ratio: weeklyActivityBreakdown.value.ratios.file,
        stroke: 'url(#ring-gradient-file)',
        filter: 'url(#ring-glow-file)',
      },
    ];
    let cursor = 0;
    const visibleProgress = activityRingProgress.value;
    return segments
      .map((segment) => {
        const rawStart = cursor;
        const rawEnd = cursor + segment.ratio;
        cursor = rawEnd;
        const start = Math.min(rawStart, visibleProgress);
        const end = Math.min(rawEnd, visibleProgress);
        if (segment.ratio <= 0 || end - start <= 0.002) return null;
        const gap = Math.min(0.008, (end - start) * 0.2);
        return {
          ...segment,
          path: describeRingArc(80, 80, 56, start + gap, Math.min(end - gap, 0.999)),
        };
      })
      .filter(Boolean);
  });

  let ringAnimId: number | null = null;
  function animateRings() {
    if (ringAnimId) cancelAnimationFrame(ringAnimId);
    const activity = weeklyActivityBreakdown.value;
    const targets = activity.counts;
    const targetTotal = targets.bookmark + targets.note + targets.file;
    const duration = 800;
    const start = performance.now();
    const startNumB = animatedBookmark.value;
    const startNumN = animatedNote.value;
    const startNumF = animatedFile.value;
    const startActiveDays = animatedActiveDays.value;
    const startTotal = animatedTotalActivityCount.value;
    activityRingProgress.value = 0;

    function step(now: number) {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3); // easeOutCubic
      activityRingProgress.value = ease;
      animatedBookmark.value = Math.round(startNumB + (targets.bookmark - startNumB) * ease);
      animatedNote.value = Math.round(startNumN + (targets.note - startNumN) * ease);
      animatedFile.value = Math.round(startNumF + (targets.file - startNumF) * ease);
      animatedActiveDays.value = Math.round(startActiveDays + (activity.totalActiveDays - startActiveDays) * ease);
      animatedTotalActivityCount.value = Math.round(startTotal + (targetTotal - startTotal) * ease);
      if (t < 1) {
        ringAnimId = requestAnimationFrame(step);
      } else {
        ringAnimId = null;
      }
    }
    ringAnimId = requestAnimationFrame(step);
  }

  watch(
    () => [weeklyStats.value, trendSummary.value],
    () => {
      animateRings();
    },
    { deep: true },
  );

  const workbenchCounts = ref({
    bookmarkTotal: 0,
    tagTotal: 0,
    noteTotal: 0,
    fileTotal: 0,
    usedSpace: 0,
  });
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
      value: `${workbenchCounts.value.bookmarkTotal}`,
      extra: t('workbench.summary.toBookmarks', '点击进入书签页'),
      to: '/home',
    },
    {
      key: 'note',
      label: t('workbench.summary.noteTotal', '笔记总数'),
      value: `${workbenchCounts.value.noteTotal}`,
      extra: t('workbench.summary.toNotes', '点击进入笔记库'),
      to: '/noteLibrary',
    },
    {
      key: 'cloud',
      label: t('workbench.summary.cloudOverview', '云空间概览'),
      value: `${workbenchCounts.value.fileTotal}`,
      extra: t(
        'workbench.summary.cloudOverviewExtra',
        {
          used: formatStorageSize(cloud.usedSpace),
          total: formatStorageSize(cloud.maxSpace),
          percent: storagePercent.value,
        },
        '{used} / {total} · 使用率 {percent}%',
      ),
      to: '/cloudSpace',
    },
    {
      key: 'tag',
      label: t('workbench.summary.tagTotal', '标签总数'),
      value: `${workbenchCounts.value.tagTotal}`,
      extra: t('workbench.summary.toTags', '点击进入标签管理'),
      to: '/manage/tagMg',
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
      desc: t('workbench.actions.addTag.desc', '创建统一标签'),
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
    { title: t('workbench.table.relatedFiles', '关联文件'), key: 'fileCount', width: '110px' },
    { title: t('workbench.table.relatedTags', '相关标签'), key: 'relatedTagNames' },
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
    const data: { date: string; type: string; value: number }[] = [];
    trendSummary.value.forEach((item) => {
      data.push({ date: item.date, type: t('workbench.chart.bookmark', '书签'), value: item.bookmark || 0 });
      data.push({ date: item.date, type: t('workbench.chart.note', '笔记'), value: item.note || 0 });
      data.push({ date: item.date, type: t('workbench.chart.file', '文件'), value: item.file || 0 });
    });

    return data;
  });

  const fileTypeChartData = computed(() => {
    return fileTypeSummary.value.map((item) => ({
      type: t(CLOUD_FILE_CATEGORY_LABEL_KEY[item.category] || 'workbench.table.other'),
      value: item.value,
    }));
  });

  const activeUpdateLog = computed(() => {
    if (activeUpdateLogIndex.value === null) {
      return null;
    }
    return updateLogList.value[activeUpdateLogIndex.value] || null;
  });

  const currentHomePage = computed(() => {
    // 引用 user.preferences 作为响应式依赖，确保修改后重新计算
    void user.preferences;

    // 游客不受接口影响，只读 localStorage
    if (!user.id || user.role === 'visitor') {
      try {
        const stored = localStorage.getItem('preferences');
        if (stored) return getHomePagePreference(JSON.parse(stored));
      } catch {}
      return 'landing';
    }
    // 已登录用户以接口返回为准
    return getHomePagePreference(user.preferences);
  });
  const themePreferenceOptions = computed(() => [
    { value: 'system', label: t('navigation.followSystem') },
    { value: 'day', label: t('navigation.light') },
    { value: 'night', label: t('navigation.dark') },
  ]);
  const languagePreferenceOptions = computed(() => [
    { value: 'zh-CN', label: '中文' },
    { value: 'en-US', label: 'English' },
  ]);
  const homePagePreferenceOptions = computed(() => [
    { value: 'workbench', label: t('navigation.workbench') },
    { value: 'resourceCenter', label: t('navigation.resourceCenter') },
    { value: 'bookmark', label: t('navigation.bookmark') },
    { value: 'noteLibrary', label: t('navigation.note') },
    { value: 'cloudSpace', label: t('navigation.cloudSpace') },
  ]);

  function handleCommonBookmarkClick(record) {
    if (record?.name) {
      recordOperation({ module: '工作台', operation: `点击书签卡片${record.name}` });
    }
    if (record?.url) {
      openBookmarkUrl(record.url);
      return;
    }
    router.push('/home');
  }

  function handleHotTagClick(record) {
    recordOperation({ module: '工作台', operation: `查看热门标签【${record?.name || '未知标签'}】` });
    if (record?.id) {
      router.push(`/tag/${record.id}`);
      return;
    }
    router.push('/manage/tagMg');
  }

  function handleRecentNoteClick(record) {
    recordOperation({ module: '工作台', operation: `查看近期笔记【${record?.title || '未命名文档'}】` });
    if (record?.id) {
      router.push(`/noteLibrary/${record.id}`);
      return;
    }
    router.push('/noteLibrary');
  }

  const fileVisible = ref(false);
  const activeFile = ref<any>(null);
  function handleViewFile(file) {
    recordOperation({ module: '工作台', operation: `预览近期文件【${file?.fileName || '未知文件'}】` });
    activeFile.value = file;
    fileVisible.value = true;
  }

  function toggleUpdateLog(index: number) {
    activeUpdateLogIndex.value = activeUpdateLogIndex.value === index ? null : index;
  }

  async function init() {
    loadingWorkbench.value = true;
    loadingUpdateLogs.value = true;
    loadingUserStats.value = user.role === 'root';

    const tasks: Promise<any>[] = [fetchWorkbenchSummary(), fetchUpdateLogs()];
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

  async function fetchWorkbenchSummary() {
    loadingWorkbench.value = true;
    try {
      const res = await apiBasePost('/api/workbench/summary');
      if (res.status === 200) {
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
        weeklyStats.value = data.weeklyStats || { bookmark: 0, note: 0, file: 0 };
        weekDays.value = Number(data.weekDays) || 7;
        trendSummary.value = Array.isArray(data.trend) ? data.trend : [];
        fileTypeSummary.value = Array.isArray(data.fileTypeStats) ? data.fileTypeStats : [];
        commonBookmarkTable.value = Array.isArray(data.commonBookmarks) ? data.commonBookmarks : [];
        hotTagTable.value = Array.isArray(data.hotTags) ? data.hotTags : [];
        recentNoteTable.value = Array.isArray(data.recentNotes)
          ? data.recentNotes.map((item) => ({
              ...item,
              title: item.title || t('noteDetail.unnamedDoc', '未命名文档'),
              updateTime: item.updateTime || '-',
            }))
          : [];
        recentFileTable.value = Array.isArray(data.recentFiles) ? data.recentFiles : [];
      }
    } finally {
      loadingWorkbench.value = false;
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

  async function updatePreference(
    key: 'theme' | 'lang' | 'homePage',
    value: ThemePreference | LanguagePreference | HomePagePreference,
  ) {
    if (preferenceSaving.value) return;

    // 点击已选中的默认首页 → 取消设置变回官网
    if (key === 'homePage' && user.preferences.homePage === value) {
      value = 'landing';
    } else if (user.preferences[key] === value) {
      return;
    }

    preferenceSaving.value = true;
    try {
      // 统一走 updatePreference(本地生效 + lang 即时切换不刷新 + 游客只本地 + 登录同步后端并失败回滚)
      await commitPreference({ [key]: value });
      if (user.id && user.role !== 'visitor') {
        recordOperation({ module: '工作台', operation: `保存偏好设置【${key}】` });
      }
      message.success(t('workbench.preferences.saved', '偏好设置已更新'));
    } catch (error) {
      console.error('update preference failed', error);
      message.error(t('workbench.preferences.saveFailed', '偏好设置更新失败'));
    } finally {
      preferenceSaving.value = false;
    }
  }

  watch(
    () => user.id,
    async (val, oldVal) => {
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

  .preferences-panel {
    --panel-accent: var(--resource-bookmark-color);
    display: flex;
    flex-direction: column;
    gap: 21px;
    justify-content: flex-start;
  }

  .preferences-subtitle {
    margin-top: 2px;
    font-size: 12px;
    line-height: 1.45;
    color: var(--secondary-text);
  }

  .preference-group {
    --preference-accent: #7a5af8;
    display: flex;
    flex-direction: column;
    gap: 7px;
    min-height: 0;
  }

  .preference-group--theme {
    --preference-accent: #7a5af8;
  }

  .preference-group--language {
    --preference-accent: #7a5af8;
  }

  .preference-group--home {
    --preference-accent: #7a5af8;
  }

  .preference-label {
    font-size: 12px;
    font-weight: 600;
    color: color-mix(in srgb, var(--preference-accent) 68%, var(--primary-text));
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
  }
  .homepage-hint-icon {
    margin-left: 4px;
    color: color-mix(in srgb, var(--preference-accent) 50%, var(--desc-color));
    cursor: help;
    transition: color 0.2s ease;
    display: block;
  }
  .homepage-hint-icon:hover {
    color: var(--preference-accent);
  }

  .preference-options {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    min-width: 0;
  }

  .preference-chip {
    border: 1px solid var(--workbench-subcard-border);
    background: linear-gradient(
      145deg,
      color-mix(in srgb, var(--preference-accent) 8%, var(--workbench-subcard-bg)),
      transparent 145%
    );
    color: var(--text-color);
    min-width: 76px;
    padding: 8px 13px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 12px;
    line-height: 1.2;
    font-weight: 600;
    transition:
      transform 0.2s ease,
      border-color 0.2s ease,
      background-color 0.2s ease,
      box-shadow 0.2s ease,
      color 0.2s ease;

    &:hover:not(:disabled) {
      transform: translateY(-1px);
      border-color: color-mix(in srgb, var(--preference-accent) 44%, var(--workbench-subcard-border));
      background: linear-gradient(
        145deg,
        color-mix(in srgb, var(--preference-accent) 14%, var(--workbench-subcard-bg)),
        var(--workbench-subcard-hover)
      );
      color: color-mix(in srgb, var(--preference-accent) 78%, var(--primary-text));
    }

    &.active {
      border-color: color-mix(in srgb, var(--preference-accent) 78%, #ffffff 22%);
      background: linear-gradient(
        135deg,
        color-mix(in srgb, var(--preference-accent) 92%, #7c73ff 8%),
        color-mix(in srgb, var(--preference-accent) 78%, #4b46cc 22%)
      );
      color: #ffffff;
      box-shadow:
        0 0 0 1px color-mix(in srgb, var(--preference-accent) 28%, transparent),
        0 12px 24px -18px color-mix(in srgb, var(--preference-accent) 56%, transparent);

      &:hover:not(:disabled) {
        transform: translateY(-1px);
        border-color: color-mix(in srgb, var(--preference-accent) 78%, #ffffff 22%);
        background: linear-gradient(
          135deg,
          color-mix(in srgb, var(--preference-accent) 92%, #7c73ff 8%),
          color-mix(in srgb, var(--preference-accent) 78%, #4b46cc 22%)
        );
        color: #ffffff;
        box-shadow:
          0 0 0 1px color-mix(in srgb, var(--preference-accent) 28%, transparent),
          0 12px 24px -18px color-mix(in srgb, var(--preference-accent) 56%, transparent);
      }
    }

    &:disabled {
      cursor: wait;
      opacity: 0.72;
    }
  }

  .preferences-hint {
    font-size: 12px;
    line-height: 1.5;
    color: var(--secondary-text);
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
    border-color: color-mix(in srgb, var(--summary-accent-start) 38%, var(--workbench-summary-border-color));

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
      border-color: color-mix(in srgb, var(--summary-accent-start) 58%, var(--workbench-summary-border-color));
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

  .summary-card--file {
    --summary-accent-start: var(--workbench-accent-file-start);
    --summary-accent-end: var(--workbench-accent-file-end);
  }

  .summary-card--cloud {
    --summary-accent-start: var(--workbench-accent-file-start);
    --summary-accent-end: var(--workbench-accent-file-end);
  }

  [data-theme='night'] .summary-card::after {
    opacity: 0.9;
  }

  .summary-skeleton {
    height: 134px;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow: hidden;
  }

  .insight-grid {
    --insight-card-min-height: 322px;
    display: grid;
    grid-template-columns: minmax(260px, 0.78fr) minmax(0, 1.58fr) minmax(340px, 1.1fr);
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
    min-height: var(--insight-card-min-height);
    height: var(--insight-card-min-height);
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

  // ─── Activity Rings ─────────────────────────────────────
  .activity-ring-wrap {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    position: relative;
    gap: 7px;
  }

  .activity-ring-stage {
    width: 158px;
    height: 158px;
    position: relative;
    flex-shrink: 0;
  }

  .activity-rings-svg {
    width: 100%;
    height: 100%;
    flex-shrink: 0;
    filter: drop-shadow(0 0 16px rgba(100, 140, 255, 0.18));
  }

  .ring-halo {
    stroke: color-mix(in srgb, var(--panel-accent) 22%, transparent);
    stroke-width: 2;
    filter: drop-shadow(0 0 12px color-mix(in srgb, var(--panel-accent) 42%, transparent));
    animation: activity-ring-breathe 2.8s ease-in-out infinite;
  }

  .ring-track {
    stroke: color-mix(in srgb, var(--text-color) 12%, transparent);
    stroke-width: 15;
    stroke-linecap: round;
    filter: drop-shadow(0 0 7px rgba(0, 0, 0, 0.08));
  }

  .ring-track--single {
    stroke: color-mix(in srgb, var(--text-color) 10%, transparent);
  }

  .ring-progress {
    animation: activity-ring-stroke-breathe 2.8s ease-in-out infinite;
  }

  .ring-center-info {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
    cursor: help;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .ring-center-info:hover .ring-center-tooltip {
    opacity: 1;
    transform: translate(-50%, -8px);
    visibility: visible;
  }

  .ring-center-value {
    font-size: 31px;
    font-weight: 800;
    background: linear-gradient(135deg, #f5fbff 0%, #7df9ff 45%, #b98cff 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    line-height: 0.96;
    text-shadow: 0 0 18px rgba(125, 249, 255, 0.28);
  }

  .ring-center-label {
    font-size: 11px;
    font-weight: 600;
    opacity: 0.75;
    white-space: nowrap;
  }

  .ring-center-extra {
    font-size: 10px;
    opacity: 0.5;
    white-space: nowrap;
  }

  .ring-center-tooltip {
    position: absolute;
    left: 50%;
    bottom: calc(100% + 8px);
    width: 188px;
    box-sizing: border-box;
    padding: 7px 9px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--menu-body-bg-color) 94%, transparent);
    border: 1px solid color-mix(in srgb, var(--panel-accent) 32%, var(--workbench-border-color));
    box-shadow:
      0 10px 22px rgba(0, 0, 0, 0.18),
      inset 0 1px 0 rgba(255, 255, 255, 0.08);
    color: var(--text-color);
    font-size: 11px;
    line-height: 1.45;
    opacity: 0;
    pointer-events: none;
    transform: translate(-50%, 0);
    transition:
      opacity 0.18s ease,
      transform 0.18s ease,
      visibility 0.18s ease;
    visibility: hidden;
    z-index: 4;
  }

  .activity-ring-legend {
    width: min(100%, 222px);
    display: grid;
    gap: 5px;
    position: relative;
    z-index: 1;
  }

  .ring-legend-item {
    display: grid;
    grid-template-columns: 10px minmax(0, 1fr) auto;
    align-items: center;
    gap: 6px;
    min-height: 24px;
    padding: 3px 8px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--menu-body-bg-color) 58%, transparent);
    border: 1px solid color-mix(in srgb, var(--workbench-border-color) 72%, transparent);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }

  .ring-legend-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
    opacity: 0.74;
  }

  .ring-legend-value {
    font-size: 12px;
    font-weight: 700;
    color: var(--text-color);
    font-variant-numeric: tabular-nums;
  }

  .ring-legend-days {
    min-width: 26px;
    height: 16px;
    border-radius: 999px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    color: color-mix(in srgb, var(--panel-accent) 72%, var(--text-color));
    background: color-mix(in srgb, var(--panel-accent) 13%, transparent);
  }

  .rc-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    display: inline-block;
    flex-shrink: 0;
  }

  .rc-dot--bookmark {
    background: var(--workbench-accent-bookmark-start);
    box-shadow: 0 0 8px var(--workbench-accent-bookmark-start);
  }
  .rc-dot--note {
    background: var(--workbench-accent-note-start);
    box-shadow: 0 0 8px var(--workbench-accent-note-start);
  }
  .rc-dot--file {
    background: var(--workbench-accent-file-start);
    box-shadow: 0 0 8px var(--workbench-accent-file-start);
  }

  .ring-skeleton {
    width: 190px;
    height: 190px;
    border-radius: 50%;
    background: linear-gradient(
      90deg,
      var(--bl-input-noBorder-bg-color) 20%,
      var(--skeleton-body-bg-color) 50%,
      var(--bl-input-noBorder-bg-color) 80%
    );
    background-size: 200% 100%;
    animation: workbench-skeleton-shine 1.2s infinite;
  }

  @keyframes activity-ring-breathe {
    0%,
    100% {
      opacity: 0.48;
      stroke-width: 1.5;
    }
    50% {
      opacity: 1;
      stroke-width: 3.5;
    }
  }

  @keyframes activity-ring-stroke-breathe {
    0%,
    100% {
      opacity: 0.86;
    }
    50% {
      opacity: 1;
    }
  }

  .quick-action-grid {
    margin-top: 10px;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    grid-template-rows: repeat(2, minmax(0, 1fr));
    gap: 10px;
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
    gap: 5px;
    width: 100%;
    box-sizing: border-box;
    border: 1px solid var(--workbench-subcard-border);
    border-radius: 11px;
    background:
      radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--panel-accent) 12%, transparent), transparent 52%),
      linear-gradient(145deg, var(--workbench-subcard-bg), transparent 140%);
    color: var(--text-color);
    padding: 15px;
    text-align: left;
    cursor: pointer;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
    transition:
      transform 0.2s ease,
      border-color 0.2s ease,
      background-color 0.2s ease;
    justify-content: center;
    height: 100%;
    position: relative;
    overflow: hidden;

    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 14px;
      bottom: 14px;
      width: 3px;
      border-radius: 999px;
      background: linear-gradient(180deg, var(--panel-accent), transparent);
      opacity: 0.78;
    }

    &:hover {
      transform: translateY(-2px);
      border-color: color-mix(in srgb, var(--panel-accent) 48%, var(--workbench-subcard-border));
      background-color: var(--workbench-subcard-hover);
    }
  }

  .action-name {
    font-size: 13px;
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
  }

  .activity-panel {
    --panel-accent: var(--workbench-insight-activity-accent);
  }

  .preferences-panel {
    height: var(--insight-card-min-height);
  }

  // ─── Update Log Timeline ────────────────────────────────
  .update-log-panel {
    --panel-accent: var(--workbench-insight-log-accent);
    height: 258px;
    min-height: 258px;
  }

  .update-log-timeline {
    margin-top: 8px;
    display: grid;
    grid-template-columns: minmax(240px, 1fr) minmax(0, 1fr);
    gap: 8px;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .tl-track {
    position: absolute;
    left: 11px;
    top: 0;
    bottom: 0;
    width: 2px;
    border-radius: 1px;
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--panel-accent) 60%, transparent) 0%,
      color-mix(in srgb, var(--panel-accent) 20%, transparent) 70%,
      transparent 100%
    );
  }

  .tl-entries {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 3px;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    padding-left: 28px;
  }

  .tl-entry {
    position: relative;
    width: 100%;
    box-sizing: border-box;
    background: none;
    border: 1px solid transparent;
    border-radius: 8px;
    color: var(--text-color);
    text-align: left;
    cursor: pointer;
    padding: 6px 8px;
    display: flex;
    align-items: center;
    gap: 0;
    transition:
      border-color 0.25s ease,
      background 0.25s ease;

    &:hover {
      border-color: color-mix(in srgb, var(--panel-accent) 30%, transparent);
      background: color-mix(in srgb, var(--panel-accent) 6%, transparent);
    }

    .tl-content {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      gap: 8px;
    }
  }

  .tl-entry--active {
    border-color: color-mix(in srgb, var(--panel-accent) 55%, transparent);
    background: linear-gradient(120deg, color-mix(in srgb, var(--panel-accent) 12%, transparent), transparent 60%);
    box-shadow: 0 0 16px -4px color-mix(in srgb, var(--panel-accent) 25%, transparent);
  }

  .tl-node {
    position: absolute;
    left: -25px;
    top: 50%;
    transform: translateY(-50%);
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .tl-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--panel-accent);
    box-shadow: 0 0 8px color-mix(in srgb, var(--panel-accent) 60%, transparent);
    transition:
      transform 0.25s ease,
      box-shadow 0.25s ease;
    z-index: 1;
  }

  .tl-entry--active .tl-dot {
    transform: scale(1.5);
    box-shadow:
      0 0 14px color-mix(in srgb, var(--panel-accent) 80%, transparent),
      0 0 24px color-mix(in srgb, var(--panel-accent) 40%, transparent);
  }

  .tl-ripple {
    position: absolute;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    border: 1.5px solid color-mix(in srgb, var(--panel-accent) 50%, transparent);
    animation: tl-ripple 1.8s ease-out infinite;
  }

  @keyframes tl-ripple {
    0% {
      transform: scale(0.5);
      opacity: 1;
    }
    100% {
      transform: scale(2.2);
      opacity: 0;
    }
  }

  .tl-label {
    font-size: 12px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tl-time {
    font-size: 11px;
    opacity: 0.7;
    flex-shrink: 0;
  }

  .tl-empty {
    font-size: 12px;
    opacity: 0.5;
    padding: 12px 0;
    text-align: center;
  }

  .tl-detail {
    border-radius: 10px;
    border: 1px solid var(--workbench-subcard-border);
    background: linear-gradient(160deg, var(--workbench-subcard-bg), transparent 120%);
    padding: 10px;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .tl-detail-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
  }

  .tl-detail-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--panel-accent);
    flex-shrink: 0;
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

  .skeleton-timeline {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-left: 28px;
    overflow: hidden;

    .tl-track {
      position: absolute;
      left: 11px;
      top: 4px;
      bottom: 4px;
      width: 2px;
      border-radius: 1px;
      background: var(--bl-input-noBorder-bg-color);
    }

    .tl-node-skel {
      position: relative;
      padding: 6px 8px;
      .sk-line {
        height: 14px;
      }
    }
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
      --insight-card-min-height: 260px;
    }
    .panel-card,
    .preferences-panel {
      height: auto;
      min-height: var(--insight-card-min-height);
    }
    .activity-panel {
      min-height: 310px;
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
      --insight-card-min-height: 240px;
    }
    .panel-card,
    .preferences-panel {
      height: auto;
      min-height: var(--insight-card-min-height);
    }
    .quick-action-grid {
      grid-template-columns: 1fr;
    }
    .preference-options {
      gap: 7px;
    }
    .update-log-content {
      grid-template-columns: 1fr;
    }

    .update-log-panel {
      height: auto;
      min-height: 258px;
    }
  }
</style>
