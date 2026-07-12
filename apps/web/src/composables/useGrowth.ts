import { ref } from 'vue';
import growthApi from '@/api/growthApi.ts';
import { useUserStore } from '@/store';

export interface Growth {
  exp: number;
  level: number;
  name: string;
  spaceMb: number;
  spaceBonusMb?: number; // 其中积分兑换的永久扩容部分(MB)
  aiTokenDaily: number;
  trashDays?: number;
  streak: number;
  protectCards?: number;
  canUseProtectCard?: boolean;
  points?: number; // 积分余额(消费货币)
  equippedTitle?: string | null; // 已佩戴称号 id
  equippedTitleName?: string | null; // 称号显示名
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
  trashDays: number;
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

export interface StreakMilestone {
  days: number;
  points: number;
  storageMb: number;
  cards: number;
  reached: boolean;
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
  streakMilestones?: StreakMilestone[];
  currentStreak?: number;
}

export interface ShopItem {
  id: string;
  type: 'consumable' | 'title';
  name: string;
  desc: string;
  cost: number;
  minLevel: number;
  bonusTokens: number;
  owned: boolean;
  equipped: boolean;
  canBuy: boolean;
}

export interface Shop {
  points: number;
  level: number;
  equippedTitle: string | null;
  protectCards: number;
  isVisitor: boolean;
  items: ShopItem[];
}

export interface LotteryPrize {
  id: string;
  kind: 'points' | 'storage' | 'card' | 'ai_pack' | string;
  amount: number;
  name: string;
  rate?: number; // 概率%(仅状态接口返回)
  rare?: boolean;
}

export interface LotteryStatus {
  points: number;
  count: number;
  toPity: number;
  singleCost: number;
  tenCost: number;
  pityEvery: number;
  pool: LotteryPrize[];
}

export interface LotteryDrawResult {
  ok: boolean;
  reason?: string;
  msg?: string;
  cost?: number;
  points?: number;
  results?: LotteryPrize[];
}

// 模块级单例:头像徽章、成长卡、段位路线共享同一份数据,一次拉取多处复用(不为此建重 store)
const growth = ref<Growth | null>(null);
const ranks = ref<Rank[]>([]);
const dashboard = ref<GrowthDashboard | null>(null);
const shop = ref<Shop | null>(null);
const lottery = ref<LotteryStatus | null>(null);
const loading = ref(false);
const dashboardLoading = ref(false);
const shopLoading = ref(false);
const lotteryLoading = ref(false);
let loadedOnce = false;
let ranksLoaded = false;
let ownerId: string | null = null; // 成长缓存归属的账号,切号即作废

// 登出/切换账号时作废用户成长缓存(ranks 段位表全局通用,与账号无关,不清)
export function resetGrowth() {
  growth.value = null;
  dashboard.value = null;
  shop.value = null;
  lottery.value = null;
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

  // 使用补签卡:成功则刷新成长快照(卡数/连签/可补签态更新)
  async function useProtectCard() {
    const res = await growthApi.useProtectCard();
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

  // 积分商店:每次打开强制刷新(余额/已拥有随购买实时变化)
  async function loadShop() {
    shopLoading.value = true;
    try {
      const res = await growthApi.getShop();
      if (res?.status === 200 && res.data) {
        shop.value = res.data as Shop;
      }
    } catch (err) {
      console.warn('加载积分商店失败:', err);
    } finally {
      shopLoading.value = false;
    }
    return shop.value;
  }

  // 购买商品:返回后端 result(ok/reason/msg/points);成功则刷新商店 + 成长快照(余额/卡数/称号变化)
  async function buyItem(itemId: string) {
    const res = await growthApi.buyShopItem(itemId);
    if (res?.status === 200 && res.data?.ok) {
      await Promise.all([loadShop(), load(true)]);
    }
    return res;
  }

  // 佩戴/卸下称号:成功则刷新商店 + 成长快照(已佩戴态变化)
  async function equipTitle(titleId: string | null) {
    const res = await growthApi.equipTitle(titleId);
    if (res?.status === 200 && res.data?.ok) {
      await Promise.all([loadShop(), load(true)]);
    }
    return res;
  }

  // 抽奖状态:余额/成本/保底/奖池概率
  async function loadLottery() {
    lotteryLoading.value = true;
    try {
      const res = await growthApi.getLottery();
      if (res?.status === 200 && res.data) {
        lottery.value = res.data as LotteryStatus;
      }
    } catch (err) {
      console.warn('加载抽奖信息失败:', err);
    } finally {
      lotteryLoading.value = false;
    }
    return lottery.value;
  }

  // 抽奖:times=1 单抽 / 10 十连。返回后端 result;成功则刷新抽奖状态 + 成长快照(余额/存储/卡变化)
  async function draw(times: number) {
    const res = await growthApi.drawLottery(times);
    if (res?.status === 200 && res.data?.ok) {
      await Promise.all([loadLottery(), load(true)]);
    }
    return res;
  }

  return {
    growth,
    ranks,
    dashboard,
    shop,
    lottery,
    loading,
    dashboardLoading,
    shopLoading,
    lotteryLoading,
    load,
    loadRanks,
    loadDashboard,
    doCheckin,
    claimDailyBonus,
    useProtectCard,
    markRead,
    loadShop,
    buyItem,
    equipTitle,
    loadLottery,
    draw,
  };
}
