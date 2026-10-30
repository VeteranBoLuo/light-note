import { computed, ref, watch } from 'vue';
import { FEATURE_ANNOUNCEMENTS } from '@lightnote/shared';
import { getAnnualReportDefinition } from '@lightnote/shared/annual-report';
import userApi from '@/api/userApi';
import { getAnnualReportStatus } from '@/api/growthApi';
import { useUserStore } from '@/store';
import {
  featureAnnouncementSeenVersion,
  hasLocalFeatureAnnouncementSeen,
  markLocalFeatureAnnouncementSeen,
  shouldShowFeatureAnnouncement,
  withFeatureAnnouncementSeen,
} from '@/utils/featureAnnouncements';

export const ANNUAL_REPORT_YEAR = 2026;
const ANNOUNCEMENT = FEATURE_ANNOUNCEMENTS.ANNUAL_REPORT_2026;

interface EntryStatus {
  ownerKey: string;
  available: boolean;
  eligible: boolean;
  entryActive: boolean;
}

// 同一账号在一次会话内只查一次入口状态；成长中心与「今日」共用结果和在途请求。
const cachedStatus = ref<EntryStatus | null>(null);
let inflight: Promise<void> | null = null;
let inflightOwner = '';

function ownerKeyOf(user: ReturnType<typeof useUserStore>) {
  return `${user.id || ''}|${user.role || ''}`;
}

/**
 * 打开报告或在「今日」点 × 时标记已读：本机立即生效，服务端失败不回滚本机状态；已读过则不再请求。
 * 游客与管理员代看不写入。
 */
export async function markAnnualReportSeen() {
  const user = useUserStore();
  if (!user.id || user.role === 'visitor' || user.visitorWorkspace || user.adminContext) return;
  const seen =
    featureAnnouncementSeenVersion(user.preferences, ANNOUNCEMENT.id) === ANNOUNCEMENT.version ||
    hasLocalFeatureAnnouncementSeen(ANNOUNCEMENT.id, user.id);
  if (seen) return;
  markLocalFeatureAnnouncementSeen(ANNOUNCEMENT.id, user.id);
  user.preferences = withFeatureAnnouncementSeen(user.preferences, ANNOUNCEMENT.id) as typeof user.preferences;
  try {
    await userApi.markFeatureAnnouncementSeen({ announcementId: ANNOUNCEMENT.id, version: ANNOUNCEMENT.version });
  } catch (error) {
    console.warn('记录年度报告已读失败:', error);
  }
}

/**
 * 年度报告入口（成长中心按钮、移动「今日」入口行）。
 * 只给正式账号显示：游客、管理员代看都不请求；红点与「今日」入口复用功能上新已读状态。
 */
export function useAnnualReportEntry() {
  const user = useUserStore();
  const definition = getAnnualReportDefinition(ANNUAL_REPORT_YEAR)!;
  const ownerKey = computed(() => ownerKeyOf(user));
  const enabled = computed(
    () => Boolean(user.id) && user.role !== 'visitor' && !user.visitorWorkspace && !user.adminContext,
  );

  async function refresh() {
    if (!enabled.value) return;
    const owner = ownerKey.value;
    if (cachedStatus.value?.ownerKey === owner) return;
    if (inflight && inflightOwner === owner) return inflight;
    inflightOwner = owner;
    inflight = (async () => {
      try {
        const res = await getAnnualReportStatus(definition.year);
        if (owner !== ownerKey.value || res?.status !== 200 || !res.data) return;
        cachedStatus.value = {
          ownerKey: owner,
          available: Boolean(res.data.available),
          eligible: Boolean(res.data.eligible),
          entryActive: Boolean(res.data.entryActive),
        };
      } catch (error) {
        // 入口只是锦上添花，失败时保持隐藏，不打扰当前页面。
        console.warn('获取年度报告入口状态失败:', error);
      } finally {
        if (inflightOwner === owner) inflight = null;
      }
    })();
    return inflight;
  }

  watch(
    [enabled, ownerKey],
    () => {
      if (cachedStatus.value && cachedStatus.value.ownerKey !== ownerKey.value) cachedStatus.value = null;
      void refresh();
    },
    { immediate: true },
  );

  const status = computed(() =>
    enabled.value && cachedStatus.value?.ownerKey === ownerKey.value ? cachedStatus.value : null,
  );
  const visible = computed(() => Boolean(status.value?.entryActive));
  const seenVersion = ref(0);
  const unseen = computed(() => {
    void seenVersion.value;
    return (
      visible.value &&
      shouldShowFeatureAnnouncement({
        announcementId: ANNOUNCEMENT.id,
        guest: false,
        preferences: user.preferences,
        localOwnerKey: user.id,
      })
    );
  });

  async function markSeen() {
    if (!enabled.value) return;
    // 本机已读在调用的同步阶段写入；本机存储不是响应式的，手动通知红点重算。
    const pending = markAnnualReportSeen();
    seenVersion.value++;
    await pending;
  }

  return {
    year: definition.year,
    route: `/growth/annual/${definition.year}`,
    visible,
    unseen,
    refresh,
    markSeen,
  };
}
