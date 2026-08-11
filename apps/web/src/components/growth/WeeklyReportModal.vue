<template>
  <BModal
    v-model:visible="modalVisible"
    :title="t('growth.weeklyReportTitle')"
    width="1040px"
    height="min(90vh, 860px)"
    modal-class="weekly-report-v2-modal"
    content-class="weekly-report-v2-content"
    :fullscreen-mobile="true"
    :show-footer="false"
  >
    <div class="wr-workspace">
      <div class="wr-preview-column">
        <span class="wr-preview-label">{{ t('growth.wrPosterPreview') }}</span>
        <div
          ref="posterStageRef"
          class="wr-poster-stage"
          :class="{ 'is-scaled': posterPreviewScale < 1 }"
          :style="posterStageStyle"
        >
          <article
            ref="posterRef"
            class="wr-poster"
            :class="themeClass"
            :style="{ transform: `scale(${posterPreviewScale})` }"
          >
            <div class="wr-poster-glow wr-poster-glow-one"></div>
            <div class="wr-poster-glow wr-poster-glow-two"></div>
            <header class="wr-poster-header">
              <div class="wr-brand-mark">
                <SvgIcon :src="icon.growth.rank" size="18" />
                <span>LIGHT NOTE · WEEKLY MOMENT</span>
              </div>
              <span class="wr-edition">NO.{{ weekNumber }}</span>
            </header>

            <section class="wr-profile">
              <div class="wr-avatar">
                <SvgIcon :src="avatarSrc" size="46" />
              </div>
              <div class="wr-profile-copy">
                <strong>{{ displayName }}</strong>
                <span>{{ dateRange }}</span>
              </div>
              <div class="wr-rank-chip">
                <b>Lv.{{ safeNumber(report?.level, 1) }}</b>
                <span>{{ rankName }}</span>
              </div>
            </section>

            <section class="wr-hero">
              <div class="wr-hero-emblem" aria-hidden="true">{{ milestone.emoji }}</div>
              <div>
                <span class="wr-hero-kicker">{{ t('growth.wrWeeklyHighlight') }}</span>
                <h2>{{ milestone.title }}</h2>
                <p>{{ headline }}</p>
              </div>
            </section>

            <section class="wr-core-stats">
              <div class="wr-core-stat">
                <SvgIcon :src="icon.growth.create" size="17" />
                <b>{{ totalOutput }}</b>
                <span>{{ t('growth.wrTotal') }}</span>
              </div>
              <div class="wr-core-stat">
                <SvgIcon :src="icon.growth.checkin" size="17" />
                <b>{{ activeDays }}/7</b>
                <span>{{ t('growth.wrActiveDays') }}</span>
              </div>
              <div class="wr-core-stat">
                <SvgIcon :src="icon.growth.level" size="17" />
                <b>{{ expDisplay }}</b>
                <span>{{ expCaption }}</span>
              </div>
            </section>

            <section class="wr-trend-card">
              <div class="wr-section-heading">
                <span>{{ t('growth.wrActivityTrend') }}</span>
                <b>{{ comparisonText }}</b>
              </div>
              <div class="wr-trend-grid" :class="{ 'is-unavailable': !hasDailySeries }">
                <div v-for="day in chartDays" :key="day.day" class="wr-trend-day">
                  <div class="wr-trend-track">
                    <span
                      class="wr-trend-fill"
                      :class="{ 'is-active': day.activity > 0 }"
                      :style="{ height: `${day.height}%` }"
                    ></span>
                  </div>
                  <b>{{ day.value }}</b>
                  <small>{{ day.label }}</small>
                </div>
              </div>
              <span v-if="!hasDailySeries" class="wr-trend-legacy">{{ t('growth.wrTrendUnavailable') }}</span>
            </section>

            <section class="wr-composition">
              <div class="wr-section-heading">
                <span>{{ t('growth.wrContentComposition') }}</span>
                <b>{{ dominantLabel }}</b>
              </div>
              <div class="wr-composition-track">
                <span class="is-bookmark" :style="{ flexGrow: composition.bookmarks }"></span>
                <span class="is-note" :style="{ flexGrow: composition.notes }"></span>
                <span class="is-file" :style="{ flexGrow: composition.files }"></span>
              </div>
              <div class="wr-composition-legend">
                <span><i class="is-bookmark"></i>{{ t('growth.wrBookmark') }} {{ composition.bookmarks }}</span>
                <span><i class="is-note"></i>{{ t('growth.wrNote') }} {{ composition.notes }}</span>
                <span><i class="is-file"></i>{{ t('growth.wrFile') }} {{ composition.files }}</span>
              </div>
            </section>

            <footer class="wr-poster-footer">
              <div>
                <span>{{ t('growth.wrMilestone') }}</span>
                <strong>{{ milestone.description }}</strong>
              </div>
              <div class="wr-level-progress" :aria-label="t('growth.wrLevelProgress')">
                <span :style="{ width: `${levelProgress}%` }"></span>
              </div>
              <small>{{ t('growth.wrPosterPrivacy') }}</small>
            </footer>
          </article>
        </div>
      </div>

      <aside class="wr-insights">
        <div class="wr-insight-heading">
          <span>{{ t('growth.wrInsightTitle') }}</span>
          <strong>{{ t('growth.wrInsightSubtitle') }}</strong>
        </div>

        <section class="wr-insight-card is-summary">
          <span>{{ t('growth.wrComparedWithLastWeek') }}</span>
          <strong :class="comparison.dir">{{ comparisonLongText }}</strong>
          <p>{{ comparisonDescription }}</p>
        </section>

        <div class="wr-insight-grid">
          <section class="wr-insight-card">
            <span>{{ t('growth.wrBestDay') }}</span>
            <strong>{{ bestDayTitle }}</strong>
            <p>{{ bestDayDescription }}</p>
          </section>
          <section class="wr-insight-card">
            <span>{{ t('growth.wrExp') }}</span>
            <strong>{{ expDisplay }}</strong>
            <p>{{ expExplanation }}</p>
          </section>
        </div>

        <section class="wr-next-goal">
          <div class="wr-next-goal-icon">
            <SvgIcon :src="icon.growth.action" size="20" />
          </div>
          <div>
            <span>{{ t('growth.wrNextGoal') }}</span>
            <strong>{{ nextGoal }}</strong>
          </div>
        </section>

        <p class="wr-save-tip">
          <SvgIcon :src="icon.message.info" size="16" />
          {{ t('growth.wrSaveTip') }}
        </p>

        <div class="wr-insight-actions">
          <BButton :loading="sharing" :disabled="exporting" @click="sharePoster">
            <SvgIcon :src="icon.cloudSpace.share" size="16" />
            {{ t('growth.wrShare') }}
          </BButton>
          <BButton type="primary" :loading="exporting" :disabled="sharing" @click="downloadPoster">
            <SvgIcon :src="icon.cloudSpace.download" size="16" />
            {{ exporting ? t('growth.wrExporting') : t('growth.wrExport') }}
          </BButton>
        </div>
      </aside>
    </div>
  </BModal>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { useUserStore } from '@/store';
  import { recordOperation } from '@/api/commonApi';
  import { prepareMaskedIconsForCanvas } from '@/utils/canvasExport';

  type Direction = 'up' | 'down' | 'flat';
  type ReportDay = {
    day: string;
    bookmarks?: number;
    notes?: number;
    files?: number;
    exp?: number;
    checkins?: number;
    total?: number;
  };
  type WeeklyReport = {
    bookmarks?: number;
    notes?: number;
    files?: number;
    exp?: number;
    checkinDays?: number;
    activeDays?: number;
    level?: number;
    levelName?: string;
    levelProgress?: number;
    expToNext?: number;
    isMax?: boolean;
    expStatus?: 'earned' | 'role_excluded' | 'no_grant' | 'none';
    generatedAt?: string;
    period?: { start?: string; end?: string; week?: number; weekYear?: number };
    days?: ReportDay[];
    bestDay?: ReportDay | null;
    prev?: { bookmarks?: number; notes?: number; files?: number; exp?: number };
  };

  const props = defineProps<{ visible: boolean; report: WeeklyReport | null }>();
  const emit = defineEmits<{ 'update:visible': [value: boolean] }>();
  const { t, locale } = useI18n();
  const user = useUserStore();
  const posterRef = ref<HTMLElement | null>(null);
  const posterStageRef = ref<HTMLElement | null>(null);
  const posterPreviewScale = ref(1);
  const posterNaturalSize = ref({ width: 500, height: 650 });
  const exporting = ref(false);
  const sharing = ref(false);

  const modalVisible = computed({
    get: () => props.visible,
    set: (value: boolean) => emit('update:visible', value),
  });
  const safeNumber = (value: unknown, fallback = 0) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  };
  const composition = computed(() => ({
    bookmarks: safeNumber(props.report?.bookmarks),
    notes: safeNumber(props.report?.notes),
    files: safeNumber(props.report?.files),
  }));
  const totalOutput = computed(() => composition.value.bookmarks + composition.value.notes + composition.value.files);
  const previousOutput = computed(
    () =>
      safeNumber(props.report?.prev?.bookmarks) +
      safeNumber(props.report?.prev?.notes) +
      safeNumber(props.report?.prev?.files),
  );
  const activeDays = computed(() =>
    Math.min(7, safeNumber(props.report?.activeDays, safeNumber(props.report?.checkinDays))),
  );
  const levelProgress = computed(() => Math.max(0, Math.min(100, safeNumber(props.report?.levelProgress, 100))));
  const isHighestLevel = computed(() => Boolean(props.report?.isMax) || safeNumber(props.report?.level) >= 15);
  const displayName = computed(
    () => user.adminContext?.subjectAlias || user.alias || user.userName || t('growth.wrUserFallback'),
  );
  const avatarSrc = computed(() =>
    user.adminContext ? icon.navigation.user : user.headPicture || icon.navigation.user,
  );
  const rankName = computed(() => props.report?.levelName || t(`growth.ranks.${safeNumber(props.report?.level, 1)}`));
  const themeClass = computed(() => {
    const level = safeNumber(props.report?.level, 1);
    if (level >= 13) return 'wr-theme-coral';
    if (level >= 10) return 'wr-theme-gold';
    if (level >= 7) return 'wr-theme-violet';
    if (level >= 4) return 'wr-theme-ocean';
    return 'wr-theme-slate';
  });

  function parseLocalDate(value?: string) {
    if (!value) return null;
    const date = new Date(`${value.slice(0, 10)}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  function formatShortDate(value?: string) {
    const date = parseLocalDate(value);
    if (!date) return value || '--';
    return new Intl.DateTimeFormat(locale.value, { month: 'short', day: 'numeric' }).format(date);
  }
  function fallbackWeek(value?: string) {
    const date = parseLocalDate(value) || new Date();
    const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    utc.setUTCDate(utc.getUTCDate() + 4 - (utc.getUTCDay() || 7));
    const start = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
    return Math.ceil(((utc.getTime() - start.getTime()) / 86400000 + 1) / 7);
  }
  const weekNumber = computed(() => safeNumber(props.report?.period?.week, fallbackWeek(props.report?.generatedAt)));
  const dateRange = computed(() => {
    const start = props.report?.period?.start;
    const end = props.report?.period?.end || props.report?.generatedAt;
    return start
      ? `${formatShortDate(start)} — ${formatShortDate(end)}`
      : `${formatShortDate(end)} · ${t('growth.weeklyReportSub')}`;
  });

  const comparison = computed<{ delta: number; dir: Direction }>(() => {
    const delta = totalOutput.value - previousOutput.value;
    return { delta, dir: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat' };
  });
  const comparisonText = computed(() => {
    if (comparison.value.dir === 'up') return t('growth.wrComparedUpShort', { n: comparison.value.delta });
    if (comparison.value.dir === 'down')
      return t('growth.wrComparedDownShort', { n: Math.abs(comparison.value.delta) });
    return t('growth.wrComparedFlatShort');
  });
  const comparisonLongText = computed(() => {
    if (!previousOutput.value && totalOutput.value > 0) return t('growth.wrNewMomentum');
    if (comparison.value.dir === 'up') return t('growth.wrComparedUp', { n: comparison.value.delta });
    if (comparison.value.dir === 'down') return t('growth.wrComparedDown', { n: Math.abs(comparison.value.delta) });
    return t('growth.wrComparedFlat');
  });
  const comparisonDescription = computed(() =>
    totalOutput.value
      ? t('growth.wrComparisonDescription', { current: totalOutput.value, previous: previousOutput.value })
      : t('growth.wrComparisonEmpty'),
  );

  const milestone = computed(() => {
    const checkins = safeNumber(props.report?.checkinDays);
    if (checkins >= 7)
      return {
        emoji: '🔥',
        title: t('growth.wrMilestoneFullAttendance'),
        description: t('growth.wrMilestoneFullAttendanceDesc'),
      };
    if (composition.value.notes >= 10)
      return {
        emoji: '✍️',
        title: t('growth.wrMilestoneWriter'),
        description: t('growth.wrMilestoneWriterDesc', { n: composition.value.notes }),
      };
    if (composition.value.bookmarks >= 20)
      return {
        emoji: '📚',
        title: t('growth.wrMilestoneCollector'),
        description: t('growth.wrMilestoneCollectorDesc', { n: composition.value.bookmarks }),
      };
    if (composition.value.files >= 10)
      return {
        emoji: '🗂️',
        title: t('growth.wrMilestoneOrganizer'),
        description: t('growth.wrMilestoneOrganizerDesc', { n: composition.value.files }),
      };
    if (totalOutput.value >= 10)
      return {
        emoji: '✨',
        title: t('growth.wrMilestoneMomentum'),
        description: t('growth.wrMilestoneMomentumDesc', { n: totalOutput.value }),
      };
    if (!totalOutput.value && !checkins)
      return { emoji: '🌙', title: t('growth.wrMilestonePause'), description: t('growth.wrMilestonePauseDesc') };
    return { emoji: '🌱', title: t('growth.wrMilestoneSeed'), description: t('growth.wrMilestoneSeedDesc') };
  });
  const headline = computed(() => {
    if (!totalOutput.value && !activeDays.value) return t('growth.wrHeadlineEmpty');
    if (comparison.value.dir === 'up')
      return t('growth.wrHeadlineUp', { days: activeDays.value, total: totalOutput.value, n: comparison.value.delta });
    return t('growth.wrHeadlineSteady', { days: activeDays.value, total: totalOutput.value });
  });

  const hasDailySeries = computed(() => Array.isArray(props.report?.days) && props.report!.days!.length === 7);
  const normalizedDays = computed<ReportDay[]>(() => {
    if (hasDailySeries.value) return props.report!.days!;
    const end = parseLocalDate(props.report?.generatedAt) || new Date();
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(end);
      day.setDate(day.getDate() - (6 - index));
      const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
      return { day: key, total: 0 };
    });
  });
  const chartDays = computed(() => {
    const days = normalizedDays.value.map((day) => {
      const total = safeNumber(day.total, safeNumber(day.bookmarks) + safeNumber(day.notes) + safeNumber(day.files));
      const activity = total + (safeNumber(day.checkins) > 0 ? 1 : 0);
      return { ...day, total, activity };
    });
    const max = Math.max(1, ...days.map((day) => day.activity));
    return days.map((day) => ({
      ...day,
      value: day.total || (day.activity ? '•' : '0'),
      height: day.activity ? Math.max(14, Math.round((day.activity / max) * 100)) : 5,
      label: new Intl.DateTimeFormat(locale.value, { weekday: 'short' }).format(parseLocalDate(day.day) || new Date()),
    }));
  });
  const bestDay = computed(
    () =>
      props.report?.bestDay ||
      chartDays.value.reduce((best, day) => (day.activity > best.activity ? day : best), chartDays.value[0]),
  );
  const bestDayTitle = computed(() =>
    hasDailySeries.value &&
    safeNumber(bestDay.value?.total) + safeNumber(bestDay.value?.exp) + safeNumber(bestDay.value?.checkins) > 0
      ? formatShortDate(bestDay.value?.day)
      : t('growth.wrNoBestDay'),
  );
  const bestDayDescription = computed(() => {
    if (bestDayTitle.value === t('growth.wrNoBestDay')) return t('growth.wrNoBestDayDesc');
    return t('growth.wrBestDayDesc', {
      total: safeNumber(bestDay.value?.total),
      exp: safeNumber(bestDay.value?.exp),
    });
  });

  const dominantLabel = computed(() => {
    const entries = [
      [t('growth.wrBookmark'), composition.value.bookmarks],
      [t('growth.wrNote'), composition.value.notes],
      [t('growth.wrFile'), composition.value.files],
    ] as const;
    const winner = [...entries].sort((a, b) => b[1] - a[1])[0];
    return winner[1] ? t('growth.wrDominantType', { type: winner[0] }) : t('growth.wrNoComposition');
  });

  const expDisplay = computed(() => {
    if (props.report?.expStatus === 'role_excluded' || (isHighestLevel.value && !safeNumber(props.report?.exp)))
      return 'MAX';
    return `+${safeNumber(props.report?.exp)}`;
  });
  const expCaption = computed(() => (expDisplay.value === 'MAX' ? t('growth.wrMaxLevel') : t('growth.wrExp')));
  const expExplanation = computed(() => {
    if (props.report?.expStatus === 'role_excluded') return t('growth.wrExpRoleExcluded');
    if (isHighestLevel.value && !safeNumber(props.report?.exp)) return t('growth.wrExpMaxLevel');
    if (props.report?.expStatus === 'no_grant') return t('growth.wrExpNoGrant');
    if (!safeNumber(props.report?.exp)) return t('growth.wrExpNone');
    return isHighestLevel.value
      ? t('growth.wrExpEarnedMax', { n: safeNumber(props.report?.exp) })
      : t('growth.wrExpToNext', { n: safeNumber(props.report?.expToNext) });
  });
  const nextGoal = computed(() => {
    if (activeDays.value < 7) return t('growth.wrGoalActiveDays', { n: 7 - activeDays.value });
    if (composition.value.notes < 3) return t('growth.wrGoalNotes', { n: 3 - composition.value.notes });
    if (composition.value.bookmarks < 5) return t('growth.wrGoalBookmarks', { n: 5 - composition.value.bookmarks });
    return t('growth.wrGoalKeepMomentum');
  });

  const posterStageStyle = computed(() => {
    if (posterPreviewScale.value >= 1) return undefined;
    return {
      width: `${posterNaturalSize.value.width * posterPreviewScale.value}px`,
      height: `${posterNaturalSize.value.height * posterPreviewScale.value}px`,
    };
  });
  let previewResizeFrame = 0;
  function updatePosterPreviewScale() {
    window.cancelAnimationFrame(previewResizeFrame);
    previewResizeFrame = window.requestAnimationFrame(() => {
      if (!posterRef.value || !posterStageRef.value || window.innerWidth <= 820) {
        posterPreviewScale.value = 1;
        return;
      }
      const content = posterStageRef.value.closest<HTMLElement>('.weekly-report-v2-content');
      const label = posterStageRef.value.previousElementSibling as HTMLElement | null;
      const width = posterRef.value.offsetWidth || 500;
      const height = posterRef.value.offsetHeight || 650;
      posterNaturalSize.value = { width, height };
      const contentStyle = content ? window.getComputedStyle(content) : null;
      const verticalPadding =
        safeNumber(contentStyle?.paddingTop?.replace('px', '')) +
        safeNumber(contentStyle?.paddingBottom?.replace('px', ''));
      const availableHeight = Math.max(
        320,
        (content?.clientHeight || height) - verticalPadding - (label?.offsetHeight || 0) - 8,
      );
      posterPreviewScale.value = Math.min(1, availableHeight / height);
    });
  }
  watch(
    () => props.visible,
    (visible) => {
      if (visible) nextTick(updatePosterPreviewScale);
    },
    { immediate: true },
  );
  onMounted(() => window.addEventListener('resize', updatePosterPreviewScale));
  onBeforeUnmount(() => {
    window.removeEventListener('resize', updatePosterPreviewScale);
    window.cancelAnimationFrame(previewResizeFrame);
  });

  async function renderPoster() {
    if (!posterRef.value) throw new Error('poster_not_ready');
    const html2canvas = (await import('html2canvas')).default;
    const width = posterRef.value.offsetWidth || 500;
    const height = posterRef.value.offsetHeight || 650;
    const exportHost = document.createElement('div');
    const exportPoster = posterRef.value.cloneNode(true) as HTMLElement;
    exportHost.setAttribute('aria-hidden', 'true');
    Object.assign(exportHost.style, {
      position: 'fixed',
      top: '0',
      left: '-10000px',
      width: `${width}px`,
      height: `${height}px`,
      overflow: 'hidden',
      pointerEvents: 'none',
    });
    exportPoster.dataset.weeklyReportExport = 'true';
    Object.assign(exportPoster.style, {
      width: `${width}px`,
      height: `${height}px`,
      minHeight: `${height}px`,
      maxWidth: 'none',
      margin: '0',
      transform: 'none',
    });
    exportPoster.querySelectorAll<HTMLElement>('*').forEach((element) => {
      element.style.animation = 'none';
      element.style.transition = 'none';
    });
    exportHost.append(exportPoster);
    document.body.append(exportHost);

    try {
      prepareMaskedIconsForCanvas(exportPoster, window);
      await document.fonts?.ready;
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      const renderWidth = exportPoster.getBoundingClientRect().width || width;
      return await html2canvas(exportPoster, {
        backgroundColor: '#0d1022',
        scale: Math.min(5, Math.max(3, 2160 / renderWidth)),
        useCORS: true,
        logging: false,
        onclone: (documentClone) => {
          const clonedPoster = documentClone.querySelector<HTMLElement>('[data-weekly-report-export="true"]');
          if (!clonedPoster) return;
          clonedPoster.style.transform = 'none';
          clonedPoster.querySelectorAll<HTMLElement>('*').forEach((element) => {
            element.style.animation = 'none';
            element.style.transition = 'none';
          });
        },
      });
    } finally {
      exportHost.remove();
    }
  }
  function canvasToBlob(canvas: HTMLCanvasElement) {
    return new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('poster_blob_failed'))), 'image/png', 0.96),
    );
  }
  function posterFilename() {
    return `${t('growth.wrFileName')}-${props.report?.period?.end || props.report?.generatedAt || 'weekly'}.png`;
  }
  function saveBlob(blob: Blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = posterFilename();
    link.href = url;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function downloadPoster() {
    if (exporting.value || sharing.value) return;
    exporting.value = true;
    try {
      saveBlob(await canvasToBlob(await renderPoster()));
      message.success(t('growth.wrExportSuccess'));
      recordOperation({
        module: '成长',
        operation: `导出成长周报图片成功【${props.report?.period?.end || props.report?.generatedAt || '本周'}】`,
      });
    } catch (error) {
      console.error('导出周报失败:', error);
      message.error(t('growth.wrExportFailed'));
    } finally {
      exporting.value = false;
    }
  }
  async function sharePoster() {
    if (sharing.value || exporting.value) return;
    sharing.value = true;
    try {
      const blob = await canvasToBlob(await renderPoster());
      const file = new File([blob], posterFilename(), { type: 'image/png' });
      const canShareFile =
        typeof navigator.share === 'function' && (!navigator.canShare || navigator.canShare({ files: [file] }));
      if (canShareFile) {
        await navigator.share({ title: t('growth.weeklyReportTitle'), files: [file] });
        recordOperation({ module: '成长', operation: '分享成长周报图片成功' });
      } else {
        saveBlob(blob);
        message.info(t('growth.wrShareFallback'));
      }
    } catch (error) {
      if ((error as DOMException)?.name !== 'AbortError') {
        console.error('分享周报失败:', error);
        message.error(t('growth.wrShareFailed'));
      }
    } finally {
      sharing.value = false;
    }
  }
</script>

<style lang="less">
  .weekly-report-v2-modal {
    overflow: hidden;

    .modal-header {
      flex: 0 0 auto;
    }
  }

  .weekly-report-v2-content {
    min-height: 0;
    padding: 18px 22px !important;
    overflow: auto;
    background: var(--background-color);
  }

  .wr-workspace {
    display: grid;
    grid-template-columns: minmax(420px, 500px) minmax(280px, 1fr);
    gap: 24px;
    max-width: 930px;
    margin: 0 auto;
  }

  .wr-preview-column {
    min-width: 0;
  }

  .wr-preview-label {
    display: block;
    margin: 0 0 8px 4px;
    color: var(--desc-color);
    font-size: 12px;
    font-weight: 600;
  }

  .wr-poster-stage {
    width: 100%;
    margin: 0 auto;
  }
  .wr-poster-stage.is-scaled .wr-poster {
    width: 500px;
    max-width: none;
  }

  .wr-poster {
    --wr-primary: #8b7cff;
    --wr-secondary: #45d9ff;
    --wr-accent: #ff7b69;
    --wr-primary-soft: rgba(139, 124, 255, 0.24);
    --wr-primary-glow: rgba(139, 124, 255, 0.32);
    --wr-secondary-soft: rgba(69, 217, 255, 0.2);
    position: relative;
    box-sizing: border-box;
    isolation: isolate;
    display: flex;
    flex-direction: column;
    gap: 14px;
    width: 100%;
    min-height: 650px;
    padding: 24px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 28px;
    background:
      linear-gradient(160deg, rgba(255, 255, 255, 0.055), transparent 30%),
      radial-gradient(circle at 90% 0%, var(--wr-primary-glow), transparent 38%), #0d1022;
    color: #fff;
    box-shadow: 0 24px 70px -34px rgba(14, 16, 38, 0.92);
    transform-origin: top left;
  }

  .wr-poster.wr-theme-ocean {
    --wr-primary: #3478f6;
    --wr-secondary: #28d9cc;
    --wr-accent: #70a5ff;
    --wr-primary-soft: rgba(52, 120, 246, 0.24);
    --wr-primary-glow: rgba(52, 120, 246, 0.34);
    --wr-secondary-soft: rgba(40, 217, 204, 0.2);
  }
  .wr-poster.wr-theme-violet {
    --wr-primary: #8b5cf6;
    --wr-secondary: #d76bff;
    --wr-accent: #5eead4;
    --wr-primary-soft: rgba(139, 92, 246, 0.24);
    --wr-primary-glow: rgba(139, 92, 246, 0.34);
    --wr-secondary-soft: rgba(215, 107, 255, 0.2);
  }
  .wr-poster.wr-theme-gold {
    --wr-primary: #f59e0b;
    --wr-secondary: #ff6b4a;
    --wr-accent: #ffd166;
    --wr-primary-soft: rgba(245, 158, 11, 0.24);
    --wr-primary-glow: rgba(245, 158, 11, 0.34);
    --wr-secondary-soft: rgba(255, 107, 74, 0.2);
  }
  .wr-poster.wr-theme-coral {
    --wr-primary: #f43f5e;
    --wr-secondary: #fb923c;
    --wr-accent: #fda4af;
    --wr-primary-soft: rgba(244, 63, 94, 0.24);
    --wr-primary-glow: rgba(244, 63, 94, 0.34);
    --wr-secondary-soft: rgba(251, 146, 60, 0.2);
  }

  .wr-poster::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    opacity: 0.26;
    background-image:
      linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px);
    background-size: 34px 34px;
    mask-image: linear-gradient(to bottom, black, transparent 80%);
  }

  .wr-poster-glow {
    position: absolute;
    z-index: -1;
    border-radius: 50%;
    pointer-events: none;
    filter: blur(12px);
  }
  .wr-poster-glow-one {
    top: 120px;
    right: -95px;
    width: 230px;
    height: 230px;
    background: var(--wr-primary-glow);
  }
  .wr-poster-glow-two {
    bottom: 35px;
    left: -100px;
    width: 210px;
    height: 210px;
    background: var(--wr-secondary-soft);
  }

  .wr-poster-header,
  .wr-profile,
  .wr-section-heading,
  .wr-poster-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .wr-brand-mark {
    display: flex;
    align-items: center;
    gap: 7px;
    color: rgba(255, 255, 255, 0.8);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.12em;
  }
  .wr-brand-mark .svg-icon {
    color: var(--wr-secondary);
  }
  .wr-edition {
    color: rgba(255, 255, 255, 0.5);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
  }

  .wr-profile {
    justify-content: flex-start;
    gap: 11px;
  }
  .wr-avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 52px;
    height: 52px;
    overflow: hidden;
    border: 2px solid rgba(255, 255, 255, 0.78);
    border-radius: 17px;
    background: rgba(255, 255, 255, 0.12);
    box-shadow: 0 0 0 4px var(--wr-primary-soft);
  }
  .wr-avatar .svg-icon {
    border-radius: 14px;
  }
  .wr-profile-copy {
    display: flex;
    flex: 1;
    min-width: 0;
    flex-direction: column;
    gap: 3px;
  }
  .wr-profile-copy strong {
    overflow: hidden;
    color: #fff;
    font-size: 16px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .wr-profile-copy span {
    color: rgba(255, 255, 255, 0.55);
    font-size: 11px;
  }
  .wr-rank-chip {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
  }
  .wr-rank-chip b {
    color: var(--wr-accent);
    font-size: 13px;
  }
  .wr-rank-chip span {
    color: rgba(255, 255, 255, 0.68);
    font-size: 11px;
  }

  .wr-hero {
    display: grid;
    grid-template-columns: 68px 1fr;
    align-items: center;
    gap: 15px;
    padding: 17px;
    border: 1px solid rgba(255, 255, 255, 0.11);
    border-radius: 20px;
    background: linear-gradient(125deg, var(--wr-primary-soft), rgba(255, 255, 255, 0.035));
  }
  .wr-hero-emblem {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 64px;
    height: 64px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 20px;
    background: rgba(7, 10, 27, 0.45);
    font-size: 34px;
    box-shadow: inset 0 1px rgba(255, 255, 255, 0.08);
  }
  .wr-hero-kicker {
    color: var(--wr-secondary);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.12em;
  }
  .wr-hero h2 {
    margin: 4px 0 5px;
    color: #fff;
    font-size: 23px;
    line-height: 1.15;
  }
  .wr-hero p {
    margin: 0;
    color: rgba(255, 255, 255, 0.68);
    font-size: 11px;
    line-height: 1.55;
  }

  .wr-core-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 9px;
  }
  .wr-core-stat {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 2px 7px;
    padding: 12px;
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 15px;
    background: rgba(255, 255, 255, 0.045);
  }
  .wr-core-stat .svg-icon {
    grid-row: span 2;
    color: var(--wr-secondary);
  }
  .wr-core-stat b {
    color: #fff;
    font-size: 19px;
    font-variant-numeric: tabular-nums;
  }
  .wr-core-stat span {
    color: rgba(255, 255, 255, 0.48);
    font-size: 9px;
  }

  .wr-trend-card,
  .wr-composition {
    padding: 14px 15px;
    border: 1px solid rgba(255, 255, 255, 0.09);
    border-radius: 17px;
    background: rgba(255, 255, 255, 0.035);
  }
  .wr-section-heading span {
    color: rgba(255, 255, 255, 0.65);
    font-size: 10px;
    font-weight: 700;
  }
  .wr-section-heading b {
    color: var(--wr-secondary);
    font-size: 10px;
  }
  .wr-trend-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 8px;
    height: 96px;
    margin-top: 9px;
  }
  .wr-trend-day {
    display: grid;
    grid-template-rows: 1fr auto auto;
    gap: 2px;
    min-width: 0;
    text-align: center;
  }
  .wr-trend-track {
    position: relative;
    width: 100%;
    max-width: 30px;
    margin: 0 auto;
    overflow: hidden;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.045);
  }
  .wr-trend-fill {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    min-height: 3px;
    border-radius: 8px 8px 5px 5px;
    background: rgba(255, 255, 255, 0.08);
  }
  .wr-trend-fill.is-active {
    background: linear-gradient(to top, var(--wr-primary), var(--wr-secondary));
    box-shadow: 0 -4px 13px var(--wr-primary-glow);
  }
  .wr-trend-day b {
    color: rgba(255, 255, 255, 0.82);
    font-size: 9px;
    font-variant-numeric: tabular-nums;
  }
  .wr-trend-day small {
    color: rgba(255, 255, 255, 0.38);
    font-size: 8px;
  }
  .wr-trend-legacy {
    display: block;
    margin-top: 5px;
    color: rgba(255, 255, 255, 0.38);
    font-size: 8px;
    text-align: center;
  }

  .wr-composition-track {
    display: flex;
    gap: 3px;
    height: 8px;
    margin: 11px 0 9px;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.07);
  }
  .wr-composition-track span {
    min-width: 0;
    border-radius: 999px;
  }
  .wr-composition-track span[style*='flex-grow: 0'] {
    display: none;
  }
  .wr-composition .is-bookmark {
    background: #8b7cff;
  }
  .wr-composition .is-note {
    background: #ff6fae;
  }
  .wr-composition .is-file {
    background: #36c8ed;
  }
  .wr-composition-legend {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }
  .wr-composition-legend span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: rgba(255, 255, 255, 0.52);
    font-size: 9px;
  }
  .wr-composition-legend i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  .wr-poster-footer {
    display: grid;
    grid-template-columns: 1fr 100px;
    gap: 6px 15px;
    margin-top: auto;
    padding-top: 12px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }
  .wr-poster-footer > div:first-child {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 3px;
  }
  .wr-poster-footer span {
    color: var(--wr-secondary);
    font-size: 9px;
    font-weight: 800;
  }
  .wr-poster-footer strong {
    overflow: hidden;
    color: rgba(255, 255, 255, 0.76);
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .wr-level-progress {
    align-self: center;
    height: 6px;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.09);
  }
  .wr-level-progress span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, var(--wr-primary), var(--wr-secondary));
  }
  .wr-poster-footer small {
    grid-column: 1 / -1;
    color: rgba(255, 255, 255, 0.28);
    font-size: 8px;
  }

  .wr-insights {
    display: flex;
    flex-direction: column;
    gap: 13px;
    padding-top: 26px;
  }
  .wr-insight-heading {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .wr-insight-heading span {
    color: var(--primary-color);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
  }
  .wr-insight-heading strong {
    color: var(--text-color);
    font-size: 20px;
  }
  .wr-insight-card,
  .wr-next-goal,
  .wr-save-tip {
    border: 1px solid var(--surface-border-color);
    border-radius: 16px;
    background: var(--surface-card-bg);
  }
  .wr-insight-card {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 6px;
    padding: 16px;
  }
  .wr-insight-card > span,
  .wr-next-goal span {
    color: var(--desc-color);
    font-size: 11px;
    font-weight: 600;
  }
  .wr-insight-card strong {
    color: var(--text-color);
    font-size: 18px;
  }
  .wr-insight-card strong.up {
    color: #16a34a;
  }
  .wr-insight-card strong.down {
    color: var(--warning-color);
  }
  .wr-insight-card p {
    margin: 0;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.6;
  }
  .wr-insight-card.is-summary {
    background: color-mix(in srgb, var(--primary-color) 8%, var(--surface-card-bg));
    border-color: color-mix(in srgb, var(--primary-color) 42%, var(--surface-border-color));
  }
  .wr-insight-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .wr-next-goal {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    border-color: color-mix(in srgb, var(--primary-color) 42%, var(--surface-border-color));
  }
  .wr-next-goal-icon {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--primary-color) 12%, var(--surface-card-bg));
    color: var(--primary-color);
  }
  .wr-next-goal > div:last-child {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .wr-next-goal strong {
    color: var(--text-color);
    font-size: 13px;
    line-height: 1.45;
  }
  .wr-save-tip {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin: 0;
    padding: 12px;
    color: var(--desc-color);
    font-size: 11px;
    line-height: 1.5;
  }
  .wr-save-tip .svg-icon {
    flex: 0 0 auto;
    color: var(--primary-color);
  }

  .wr-insight-actions {
    display: grid;
    grid-template-columns: repeat(2, max-content);
    align-items: center;
    align-self: flex-end;
    justify-content: flex-end;
    gap: 10px;
    margin-top: auto;
    padding-top: 2px;
  }
  .wr-insight-actions .b_btn {
    min-width: 116px;
  }

  @media (max-width: 820px) {
    .weekly-report-v2-modal.is-mobile-fullscreen {
      .modal-header {
        min-height: 54px;
      }

      .weekly-report-v2-content {
        overflow-x: hidden !important;
        overflow-y: auto !important;
        overscroll-behavior-y: contain;
        touch-action: pan-y;
        -webkit-overflow-scrolling: touch;
      }
    }
    .weekly-report-v2-content {
      padding: 14px !important;
    }
    .wr-workspace {
      display: flex;
      flex-direction: column;
      gap: 18px;
    }
    .wr-preview-column {
      width: min(100%, 500px);
      margin: 0 auto;
    }
    .wr-poster-stage {
      height: auto !important;
      width: 100% !important;
    }
    .wr-poster {
      transform: none !important;
    }
    .wr-insights {
      width: min(100%, 500px);
      margin: 0 auto;
      padding-top: 0;
    }
  }

  @media (min-width: 821px) and (max-height: 780px) {
    .wr-insights {
      gap: 8px;
      padding-top: 0;
    }
    .wr-insight-card {
      gap: 4px;
      padding: 12px;
    }
    .wr-next-goal {
      padding: 11px 12px;
    }
    .wr-save-tip {
      padding: 9px 11px;
    }
  }

  @media (max-width: 520px) {
    .wr-poster {
      min-height: 610px;
      padding: 18px;
      border-radius: 22px;
    }
    .wr-brand-mark {
      font-size: 8px;
    }
    .wr-profile-copy strong {
      font-size: 14px;
    }
    .wr-hero {
      grid-template-columns: 56px 1fr;
      gap: 11px;
      padding: 14px;
    }
    .wr-hero-emblem {
      width: 54px;
      height: 54px;
      border-radius: 16px;
      font-size: 29px;
    }
    .wr-hero h2 {
      font-size: 19px;
    }
    .wr-core-stat {
      padding: 9px;
    }
    .wr-core-stat .svg-icon {
      display: none;
    }
    .wr-core-stat b {
      grid-column: 1 / -1;
      font-size: 17px;
    }
    .wr-core-stat span {
      grid-column: 1 / -1;
    }
    .wr-trend-grid {
      gap: 5px;
    }
    .wr-composition-legend {
      gap: 4px;
    }
    .wr-composition-legend span {
      font-size: 8px;
    }
    .wr-insight-grid {
      grid-template-columns: 1fr;
    }
    .wr-insight-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      align-self: stretch;
      width: 100%;
    }
    .wr-insight-actions .b_btn {
      min-width: 0;
    }
  }

  html.light-note-mobile-rendering {
    .wr-poster,
    .wr-insight-card,
    .wr-next-goal {
      box-shadow: none;
    }
    .wr-insight-card.is-summary,
    .wr-next-goal {
      border-color: var(--primary-color);
    }
    .wr-trend-fill.is-active {
      box-shadow: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .wr-poster * {
      animation: none !important;
      transition: none !important;
    }
  }
</style>
