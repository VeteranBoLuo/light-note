import { computed, ref, shallowRef, watch, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AnnualReportChapter } from '@lightnote/shared/annual-report';
import message from '@/components/base/BasicComponents/BMessage/BMessage';
import { completeAnnualReport, getAnnualReport } from '@/api/growthApi';
import { useUserStore } from '@/store';
import { annualPosterOwnerKey, type AnnualReport } from '@/utils/annualReport';
import { markAnnualReportSeen } from './useAnnualReportEntry';
import { usePosterExport } from './usePosterExport';

type LoadState = 'loading' | 'ready' | 'failed';

const POSTER_OPTIONS_PREFIX = 'light-note:annual-report-poster';

function readPosterOptions(key: string) {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || 'null');
    return {
      showName: parsed?.showName !== false,
      showKeywords: parsed?.showKeywords === true,
    };
  } catch {
    return { showName: true, showKeywords: false };
  }
}

/**
 * 年度报告页状态：本人实时报告、当前页、海报显示开关与看完后的纪念成就。
 * 账号或年份变化时丢弃旧响应；翻页不重新请求。
 */
export function useAnnualReport(year: Ref<number>) {
  const { t } = useI18n();
  const user = useUserStore();
  const report = shallowRef<AnnualReport | null>(null);
  const state = ref<LoadState>('loading');
  const index = ref(0);
  const ownerKey = computed(() => annualPosterOwnerKey(user));
  let generation = 0;

  async function load() {
    const token = ++generation;
    state.value = 'loading';
    try {
      const res = await getAnnualReport(year.value);
      if (token !== generation) return;
      if (res?.status !== 200 || !res.data) throw new Error('annual_report_unavailable');
      report.value = res.data as AnnualReport;
      index.value = 0;
      state.value = 'ready';
      if (report.value.available) void markAnnualReportSeen();
    } catch (error) {
      if (token !== generation) return;
      console.error('获取年度报告失败:', error);
      state.value = 'failed';
    }
  }

  watch(
    [year, ownerKey],
    () => {
      report.value = null;
      void load();
    },
    { immediate: true },
  );

  const chapters = computed<AnnualReportChapter[]>(() => report.value?.chapters || []);
  const current = computed<AnnualReportChapter | null>(() => chapters.value[index.value] || null);
  const isFirst = computed(() => index.value <= 0);
  const isLast = computed(() => index.value >= chapters.value.length - 1);

  function go(target: number) {
    if (!chapters.value.length) return;
    index.value = Math.max(0, Math.min(chapters.value.length - 1, target));
  }
  const next = () => go(index.value + 1);
  const prev = () => go(index.value - 1);
  const toPoster = () => go(chapters.value.length - 1);

  // 翻到最后一页写入纪念成就；同一账号同一年份只请求一次，失败不打断查看。
  const completedFor = new Set<string>();
  watch(current, async (chapter) => {
    if (chapter !== 'poster' || !report.value?.available || report.value.tier === 'empty') return;
    const key = `${ownerKey.value}:${year.value}`;
    if (completedFor.has(key)) return;
    completedFor.add(key);
    try {
      const res = await completeAnnualReport(year.value);
      if (key !== `${ownerKey.value}:${year.value}`) return;
      if (res?.status === 200 && res.data?.newlyUnlocked) {
        message.success(t('annualReport.achievementUnlocked', { name: t(`growth.achName.${res.data.key}`) }));
      }
    } catch (error) {
      console.warn('记录年度回望成就失败:', error);
    }
  });

  // 海报显示开关只存本机（按账号区分），读写失败时使用默认值。
  const optionsKey = computed(() => `${POSTER_OPTIONS_PREFIX}:${user.id || 'anonymous'}`);
  const showName = ref(true);
  const showKeywords = ref(false);
  watch(
    optionsKey,
    (key) => {
      const options = readPosterOptions(key);
      showName.value = options.showName;
      showKeywords.value = options.showKeywords;
    },
    { immediate: true },
  );
  watch([showName, showKeywords], ([name, keywords]) => {
    try {
      window.localStorage.setItem(optionsKey.value, JSON.stringify({ showName: name, showKeywords: keywords }));
    } catch {
      // 隐私模式或存储配额异常时只在本次会话生效。
    }
  });

  return {
    report,
    state,
    load,
    chapters,
    index,
    current,
    isFirst,
    isLast,
    go,
    next,
    prev,
    toPoster,
    ownerKey,
    showName,
    showKeywords,
  };
}

/** 年度报告海报的保存、分享与下载，复用周报的导出链路；云空间文件夹为「年度报告」。 */
export function useAnnualPosterExport(options: {
  posterRoot: () => HTMLElement | null | undefined;
  report: Ref<AnnualReport | null>;
  ownerKey: Ref<string>;
}) {
  const { t } = useI18n();
  return usePosterExport({
    posterRoot: options.posterRoot,
    width: 400,
    height: 640,
    background: '#0d1022',
    filename: () => `${t('annualReport.share.fileName')}-${options.report.value?.year || ''}.png`,
    shareTitle: () => t('annualReport.pageTitle', { year: options.report.value?.year || '' }),
    cloudFolder: '年度报告',
    ownerKey: () => options.ownerKey.value,
    canExport: () => Boolean(options.report.value?.available && options.report.value.tier !== 'empty'),
    text: {
      exportSuccess: () => t('annualReport.share.exportSuccess'),
      exportFailed: () => t('annualReport.share.exportFailed'),
      shareFallback: () => t('annualReport.share.shareFallback'),
      shareFailed: () => t('annualReport.share.shareFailed'),
      cloudSuccess: () => t('annualReport.share.cloudSuccess'),
      cloudFailed: () => t('annualReport.share.cloudFailed'),
    },
    log: {
      module: '年度报告',
      download: '下载年度报告海报成功',
      share: '分享年度报告海报成功',
      cloud: '保存年度报告海报到云空间成功',
    },
  });
}
