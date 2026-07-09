import { ref } from 'vue';
import growthApi from '@/api/growthApi.ts';
import { useUserStore } from '@/store';

export interface Growth {
  exp: number;
  level: number;
  name: string;
  spaceMb: number;
  aiTokenDaily: number;
  streak: number;
  checkedInToday: boolean;
  levelStartExp: number;
  nextLevelExp: number | null;
  expToNext: number;
  progress: number;
  hasUnreadLevelUp?: boolean;
  unreadLevel?: number | null;
  isMax: boolean;
  dailyExp?: number;
  dailyCap?: number;
  dailyCapReached?: boolean;
}

export interface Rank {
  level: number;
  name: string;
  cumExp: number;
  spaceMb: number;
  aiTokenDaily: number;
}

export interface Achievement {
  key: string;
  group: 'checkin' | 'create' | 'level' | 'tenure' | string;
  target: number;
  cur: number;
  unlocked: boolean;
}

export interface GrowthStats {
  joinDays: number;
  currentStreak: number;
  maxStreak: number;
  totalCheckins: number;
  bookmarkCount: number;
  noteCount: number;
  fileCount: number;
  tagCount: number;
  weekExp: number;
  checkinDays: string[];
}

export interface Quest {
  key: string;
  done: boolean;
  cur?: number;
  target?: number;
}

export interface TimelineItem {
  source: string;
  name?: string | null;
  amount: number;
  meta: any;
  time: string;
}

export interface QuestBonus {
  exp: number;
  claimed: boolean;
  claimable: boolean;
}

export interface GrowthDashboard {
  stats: GrowthStats;
  achievements: Achievement[];
  unlockedCount: number;
  totalAchievements: number;
  quests: Quest[];
  questsEnabled: boolean;
  questBonus: QuestBonus;
  timeline: TimelineItem[];
}

// 模块级单例:头像徽章、成长卡、段位路线共享同一份数据,一次拉取多处复用(不为此建重 store)
const growth = ref<Growth | null>(null);
const ranks = ref<Rank[]>([]);
const dashboard = ref<GrowthDashboard | null>(null);
const loading = ref(false);
const dashboardLoading = ref(false);
let loadedOnce = false;
let ranksLoaded = false;
let ownerId: string | null = null; // 成长缓存归属的账号,切号即作废

// 登出/切换账号时作废用户成长缓存(ranks 段位表全局通用,与账号无关,不清)
export function resetGrowth() {
  growth.value = null;
  dashboard.value = null;
  loadedOnce = false;
  ownerId = null;
}

export function useGrowth() {
  async function load(force = false) {
    const uid = useUserStore().id || 'visitor';
    if (ownerId !== uid) {
      // 账号变了(登出→游客 / 换号):旧缓存立即作废,防止显示上一个账号的等级/经验
      growth.value = null;
      loadedOnce = false;
      ownerId = uid;
    }
    if (loadedOnce && !force) return growth.value;
    loading.value = true;
    try {
      const res = await growthApi.getMyGrowth();
      if (res?.status === 200 && res.data) {
        growth.value = res.data as Growth;
        loadedOnce = true;
      }
    } catch (err) {
      console.warn('加载成长信息失败:', err);
    } finally {
      loading.value = false;
    }
    return growth.value;
  }

  // 成长看板(成就墙/统计/今日任务/时间线):每次进成长页强制刷新(数据随操作实时变化)
  async function loadDashboard() {
    dashboardLoading.value = true;
    try {
      const res = await growthApi.getDashboard();
      if (res?.status === 200 && res.data) {
        dashboard.value = res.data as GrowthDashboard;
      }
    } catch (err) {
      console.warn('加载成长看板失败:', err);
    } finally {
      dashboardLoading.value = false;
    }
    return dashboard.value;
  }

  // 段位表:15 级只在首次拉取一次(内容基本不变)
  async function loadRanks() {
    if (ranksLoaded) return ranks.value;
    try {
      const res = await growthApi.getRanks();
      if (res?.status === 200 && Array.isArray(res.data)) {
        ranks.value = res.data as Rank[];
        ranksLoaded = true;
      }
    } catch (err) {
      console.warn('加载段位表失败:', err);
    }
    return ranks.value;
  }

  // 返回签到结果(含 already / expGained / leveledUp);成功则就地刷新共享 growth
  async function doCheckin() {
    const res = await growthApi.checkin();
    if (res?.status === 200 && res.data?.growth) {
      growth.value = res.data.growth as Growth;
      loadedOnce = true;
    }
    return res;
  }

  // 领取今日任务奖励:成功则刷新成长快照 + 看板(经验/等级/领取态实时更新)
  async function claimDailyBonus() {
    const res = await growthApi.claimDailyBonus();
    if (res?.status === 200 && res.data?.ok && res.data?.growth) {
      growth.value = res.data.growth as Growth;
      loadedOnce = true;
      await loadDashboard();
    }
    return res;
  }

  // 标记升级通知已读(查看成长页后):清后端 + 本地未读标记
  async function markRead() {
    try {
      await growthApi.markNoticesRead();
    } catch {
      /* 忽略 */
    }
    if (growth.value) growth.value.hasUnreadLevelUp = false;
  }

  return {
    growth,
    ranks,
    dashboard,
    loading,
    dashboardLoading,
    load,
    loadRanks,
    loadDashboard,
    doCheckin,
    claimDailyBonus,
    markRead,
  };
}
