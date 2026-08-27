import { ref } from 'vue';
import growthApi from '@/api/growthApi.ts';
import { useUserStore } from '@/store';
import {
  completePointsEconomyRequest,
  getOrCreatePointsEconomyRequest,
  isAmbiguousPointsEconomyFailure,
  type PointsEconomyOperation,
} from '@/utils/pointsEconomyRequest';

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
  makeupDays?: string[]; // 当前可补的 YYYYMMDD，按由近到远排序
  points?: number; // 积分余额(消费货币)
  equippedTitle?: string | null; // 已佩戴称号 id
  equippedTitleName?: string | null; // 称号显示名
  equippedFrame?: string | null; // 已佩戴头像框装扮 id
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
  features?: { growthCenterV2?: boolean; pointsCenter?: boolean };
}

export interface Rank {
  level: number;
  name: string;
  cumExp: number;
  spaceMb: number;
  aiTokenDaily: number;
  trashDays: number;
  freeDraws?: number; // 每日免费抽奖次数(随等级解锁)
}

export interface Achievement {
  key: string;
  group: 'checkin' | 'create' | 'level' | 'tenure' | string;
  target: number;
  cur: number;
  minLevel?: number; // 复合成就的最低等级；0/缺省表示无等级门槛
  currentLevel?: number; // 服务端参与解锁判断的当前等级，供多条件进度展示
  unlocked: boolean;
  reward?: number; // 解锁后可领的积分
  frameId?: string | null; // 可选头像框奖励
  claimed?: boolean; // 是否已领取
  claimable?: boolean; // 已解锁且未领
  unlockedAt?: string | null;
  claimedAt?: string | null;
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
  completedTodoCount: number;
  organizedResourceCount: number;
  pendingResourceCount?: number;
  weekExp: number;
  checkinDays: string[];
}

export interface Quest {
  key: string;
  done: boolean;
  cur?: number;
  target?: number;
  random?: boolean;
  countedEvent?: { type: string; time?: string | null } | null;
}

export interface TimelineItem {
  source: string;
  name?: string | null;
  amount: number;
  meta: any;
  time: string;
}

export interface QuestBonus {
  /** 一次性经验；某些策略版本可为 0，前端据此改说「只发积分」。 */
  exp: number;
  /** 一次性积分（消费货币）。 */
  points: number;
  claimed: boolean;
  claimable: boolean;
  completedCount?: number;
  total?: number;
  stages?: Array<{
    key: 'basic' | 'complete' | string;
    required: number;
    exp: number;
    points: number;
    claimed: boolean;
    claimable: boolean;
  }>;
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
  claimableCount?: number;
  totalAchievements: number;
  quests: Quest[];
  questBonus: QuestBonus;
  timeline: TimelineItem[];
  streakMilestones?: StreakMilestone[];
  currentStreak?: number;
}

export interface ShopItem {
  id: string;
  type: 'consumable' | 'title' | 'cosmetic';
  effect?: string | null;
  rarity?: 'basic' | 'rare' | 'epic' | 'legendary' | null;
  name: string;
  desc: string;
  cost: number | null;
  minLevel: number;
  bonusTokens: number;
  acquisition?: 'shop' | 'achievement';
  achievementKey?: string | null;
  owned: boolean;
  canEquip?: boolean;
  equipped: boolean;
  canBuy: boolean;
  repeatable?: boolean;
  purchaseLimit?: number | null;
  purchaseCount?: number;
  limitReached?: boolean;
  pointsShortfall?: number;
  levelShortfall?: number;
  unavailableReasons?: string[];
}

export interface Shop {
  economyVersion: string;
  purchaseEnabled: boolean;
  points: number;
  level: number;
  equippedTitle: string | null;
  equippedFrame: string | null;
  protectCards: number;
  isVisitor: boolean;
  rootFrameAccess?: boolean;
  items: ShopItem[];
  frames?: ShopItem[];
}

export interface InventoryItem {
  id: string;
  name: string;
  icon: string;
  desc: string;
  qty: number;
  action: 'use' | 'makeup'; // use=直接使用(AI加油包) / makeup=去签到日历补签(补签卡)
}

export interface Inventory {
  items: InventoryItem[];
  assets: { points: number; storageBonusMb: number; aiBonusTokens: number };
}

export interface LotteryPrize {
  id: string;
  kind: 'points' | 'storage' | 'card' | 'ai_pack' | string;
  amount: number;
  name: string;
  rate?: number; // 概率%(仅状态接口返回)
  normalRate?: number;
  pityRate?: number;
  rare?: boolean;
  guaranteed?: boolean; // 本次结果是否由第 N 抽保底触发
  compensated?: boolean;
  compensationReason?: 'makeup_card_full' | string;
  originalReward?: { kind: string; amount: number };
}

export interface LotteryStatus {
  economyVersion: string;
  points: number;
  count: number;
  toPity: number;
  singleCost: number;
  tenCost: number;
  pityEvery: number;
  pityCountsFreeDraws?: boolean;
  overflowPolicy?: { itemId: string; maxInventory: number; compensationPoints: number };
  level: number;
  freeDaily: number; // 当前等级每日免费次数
  freeRemaining: number; // 今日剩余免费次数
  pool: LotteryPrize[];
  free: {
    enabled: boolean;
    daily: number;
    remaining: number;
    countsPaidPity: boolean;
    poolVersion: string;
    pool: LotteryPrize[];
  };
  paid: {
    enabled: boolean;
    singleCost: number;
    tenCost: number;
    pityEvery: number;
    pityProgress: number;
    toPity: number;
    poolVersion: string;
    pool: LotteryPrize[];
    overflowPolicy: { itemId: string; maxInventory: number; compensationPoints: number };
  };
}

export interface LotteryDrawResult {
  ok: boolean;
  reason?: string;
  msg?: string;
  cost?: number;
  free?: boolean;
  points?: number;
  results?: LotteryPrize[];
  pityTriggered?: boolean;
  pityHitIndexes?: number[]; // 本批次内命中保底的序号，从 1 开始
  pityProgressBefore?: number;
  pityProgressAfter?: number;
  nextPityIn?: number;
  economyVersion?: string;
  mode?: 'free' | 'paid';
  idempotent?: boolean;
}

export interface WeeklyChallenge {
  key: string;
  metric: string;
  target: number;
  reward: number;
  cur: number;
  done: boolean;
  claimed: boolean;
  claimable: boolean;
}

export interface WeeklyData {
  weekKey: string | null;
  challenges: WeeklyChallenge[];
  todayActive?: boolean;
  claimableCount?: number;
  earnedPoints?: number;
  totalPoints?: number;
  policyVersion?: string;
}

export interface RecapItem {
  type: 'bookmark' | 'note';
  id: string;
  title: string;
  url: string | null;
  time: string;
}

export interface RecapData {
  weekly?: RecapItem[];
  onThisDay: RecapItem[];
  buried: RecapItem[];
  stableDate?: string;
  timezone?: string;
}

export interface GrowthPreferences {
  weeklyActiveTarget: 0 | 3 | 5 | 7;
  streakReminderEnabled: boolean;
  celebrationEnabled: boolean;
  lowPressureMode: boolean;
  timezone: string;
  utcOffsetMinutes: number;
}

export interface ClaimableItemGroup<T = any> {
  count: number;
  items: T[];
}

export interface GrowthClaimable {
  count: number;
  daily: ClaimableItemGroup;
  growthTasks: ClaimableItemGroup<GrowthTask>;
  achievements: ClaimableItemGroup<Achievement>;
  weekly: ClaimableItemGroup<WeeklyChallenge>;
  today?: { completed: number; total: number; claimableCount: number };
  nextAction?: {
    type: string;
    key: string;
    action: string;
    progress: { current: number; target: number } | null;
    reward?: { exp: number; points: number } | null;
  } | null;
}

export interface GrowthTask {
  taskKey: string;
  titleKey: string;
  descriptionKey: string;
  rewardExp: number;
  status: 'pending' | 'completed' | string;
  completed: boolean;
  claimed: boolean;
  claimable: boolean;
  completedAt: string | null;
  claimedAt: string | null;
}

export interface GrowthTasksData {
  tasks: GrowthTask[];
  completedTasks?: GrowthTask[];
  allTasks?: GrowthTask[];
  totalCount: number;
  completedCount: number;
  claimedCount: number;
  claimableCount: number;
  remainingCount: number;
  activeCount: number;
}

const RETIRED_GROWTH_TASK_KEYS = new Set(['first_review']);

// 兼容前后端滚动更新：旧后端进程可能短暂返回已退役任务，前端仍需按当前产品口径收敛计数与展示。
function normalizeGrowthTasks(data: GrowthTasksData): GrowthTasksData {
  const normalize = (input: GrowthTask[]) =>
    input
      .filter((task) => !RETIRED_GROWTH_TASK_KEYS.has(task.taskKey))
      .map((task) => {
        // 滚动发布期间旧后端没有 claimed 字段；旧流程的 completed 已自动发奖，因此按已领取兼容。
        const claimed = typeof task.claimed === 'boolean' ? task.claimed : Boolean(task.completed);
        return {
          ...task,
          claimed,
          claimable: typeof task.claimable === 'boolean' ? task.claimable : Boolean(task.completed && !claimed),
          claimedAt: task.claimedAt || null,
        };
      });
  const tasks = normalize(Array.isArray(data.tasks) ? data.tasks : []);
  const completedTasks = normalize(Array.isArray(data.completedTasks) ? data.completedTasks : []);
  const allTasks = normalize(
    Array.isArray(data.allTasks)
      ? data.allTasks
      : [...tasks, ...completedTasks.filter((task) => !tasks.some((x) => x.taskKey === task.taskKey))],
  );
  const completedCount = allTasks.filter((task) => task.completed).length;
  const claimedCount = allTasks.filter((task) => task.claimed).length;
  return {
    tasks,
    completedTasks,
    allTasks,
    totalCount: allTasks.length,
    completedCount,
    claimedCount,
    claimableCount: allTasks.filter((task) => task.claimable).length,
    remainingCount: allTasks.length - completedCount,
    activeCount: allTasks.length - claimedCount,
  };
}

// 模块级单例:头像徽章、成长卡、段位路线共享同一份数据,一次拉取多处复用(不为此建重 store)
const growth = ref<Growth | null>(null);
const ranks = ref<Rank[]>([]);
const dashboard = ref<GrowthDashboard | null>(null);
const shop = ref<Shop | null>(null);
const inventory = ref<Inventory | null>(null);
const lottery = ref<LotteryStatus | null>(null);
const weekly = ref<WeeklyData | null>(null);
const recap = ref<RecapData | null>(null);
const growthTasks = ref<GrowthTasksData | null>(null);
const claimable = ref<GrowthClaimable | null>(null);
const preferences = ref<GrowthPreferences | null>(null);
const loading = ref(false);
const growthError = ref(false);
const dashboardLoading = ref(false);
const dashboardError = ref(false);
const claimableLoading = ref(false);
const claimableError = ref(false);
const preferencesLoading = ref(false);
const preferencesError = ref(false);
const recapLoading = ref(false);
const recapError = ref(false);
const claimingRewards = ref(false);
const shopLoading = ref(false);
const shopError = ref(false);
const inventoryLoading = ref(false);
const inventoryError = ref(false);
const lotteryLoading = ref(false);
const lotteryError = ref(false);
const growthTasksLoading = ref(false);
const growthTasksError = ref(false);
let loadedOnce = false;
let ranksLoaded = false;
let ownerId: string | null = null; // 成长缓存归属的账号,切号即作废
let growthTasksOwnerId: string | null = null; // 成长任务缓存单独归属，避免影响成长快照缓存
let growthRequest: Promise<Growth | null> | null = null;
let growthRequestOwnerId: string | null = null;
let growthTasksRequest: Promise<GrowthTasksData | null> | null = null;
let growthTasksRequestOwnerId: string | null = null;
let growthRequestVersion = 0;
let dashboardRequestVersion = 0;
let ownerGeneration = 0;
let claimRequestVersion = 0;

function isCurrentGrowthOwner(uid: string, generation: number) {
  return ownerGeneration === generation && ownerId === uid && (useUserStore().id || 'visitor') === uid;
}

// 登出/切换账号时作废用户成长缓存(ranks 段位表全局通用,与账号无关,不清)
export function resetGrowth() {
  ownerGeneration += 1;
  claimRequestVersion += 1;
  growth.value = null;
  dashboard.value = null;
  shop.value = null;
  inventory.value = null;
  lottery.value = null;
  weekly.value = null;
  recap.value = null;
  growthTasks.value = null;
  claimable.value = null;
  preferences.value = null;
  loadedOnce = false;
  ownerId = null;
  growthTasksOwnerId = null;
  growthRequest = null;
  growthRequestOwnerId = null;
  growthTasksRequest = null;
  growthTasksRequestOwnerId = null;
  growthRequestVersion += 1;
  dashboardRequestVersion += 1;
  loading.value = false;
  growthError.value = false;
  growthTasksLoading.value = false;
  growthTasksError.value = false;
  dashboardLoading.value = false;
  dashboardError.value = false;
  claimableLoading.value = false;
  claimableError.value = false;
  preferencesLoading.value = false;
  preferencesError.value = false;
  recapLoading.value = false;
  recapError.value = false;
  shopLoading.value = false;
  shopError.value = false;
  inventoryLoading.value = false;
  inventoryError.value = false;
  lotteryLoading.value = false;
  lotteryError.value = false;
  claimingRewards.value = false;
}

// 积分余额单一事实源是 growth.points;商店/抽奖各自缓存了余额副本,
// 任一动作改动积分后调用此函数把最新余额同步到已加载的视图,避免抽奖/商店余额滞后需刷新页面。
function syncPointsToViews() {
  const p = growth.value?.points;
  if (typeof p !== 'number') return;
  if (lottery.value) lottery.value.points = p;
  if (shop.value) shop.value.points = p;
}

// `/growth/me` 才携带成长中心 Feature Flag；签到、补签和领奖返回的是纯成长快照。
// 操作成功后必须保留当前账号已经确认的功能开关，否则页面会把 V2 区块误判为关闭并立即卸载。
function applyGrowthMutationSnapshot(snapshot: Growth) {
  // 写操作返回的是更新后的权威快照。作废写操作前仍在途的 `/growth/me`，否则旧读响应
  // 可能在这里之后落地，把 checkedInToday、积分或等级重新覆盖成写前状态。
  growthRequestVersion += 1;
  growthRequest = null;
  growthRequestOwnerId = null;
  loading.value = false;
  const features = snapshot.features ?? growth.value?.features;
  growth.value = features ? { ...snapshot, features } : snapshot;
  loadedOnce = true;
}

function ensureGrowthOwner(uid: string) {
  if (ownerId === uid) return;
  // 任一成长入口都可能先发请求；不能依赖 /growth/me 恰好先执行来完成账号隔离。
  growth.value = null;
  dashboard.value = null;
  shop.value = null;
  inventory.value = null;
  lottery.value = null;
  weekly.value = null;
  recap.value = null;
  growthTasks.value = null;
  claimable.value = null;
  preferences.value = null;
  loadedOnce = false;
  ownerId = uid;
  ownerGeneration += 1;
  claimRequestVersion += 1;
  growthRequest = null;
  growthRequestOwnerId = null;
  growthRequestVersion += 1;
  dashboardRequestVersion += 1;
  growthTasksOwnerId = null;
  growthTasksRequest = null;
  growthTasksRequestOwnerId = null;
  loading.value = false;
  growthError.value = false;
  dashboardLoading.value = false;
  dashboardError.value = false;
  growthTasksLoading.value = false;
  growthTasksError.value = false;
  claimableLoading.value = false;
  claimableError.value = false;
  preferencesLoading.value = false;
  preferencesError.value = false;
  recapLoading.value = false;
  recapError.value = false;
  shopLoading.value = false;
  shopError.value = false;
  inventoryLoading.value = false;
  inventoryError.value = false;
  lotteryLoading.value = false;
  lotteryError.value = false;
  claimingRewards.value = false;
}

export function useGrowth() {
  async function load(force = false) {
    const uid = useUserStore().id || 'visitor';
    ensureGrowthOwner(uid);
    if (loadedOnce && !force) return growth.value;
    // 多个首屏组件会同时读取成长信息。在同账号请求仍在进行时直接复用，
    // 避免缓存尚未写入前重复调用 /growth/me；force 只跳过已完成缓存，不绕过在途合并。
    if (growthRequest && growthRequestOwnerId === uid) return growthRequest;

    loading.value = true;
    growthError.value = false;
    growthRequestOwnerId = uid;
    const requestVersion = ++growthRequestVersion;
    let request: Promise<Growth | null>;
    // 延后一轮微任务再真正调用 API，确保共享 request 已赋值；即使 API 客户端同步抛错，finally 也能正常清理。
    request = Promise.resolve().then(async () => {
      try {
        const res = await growthApi.getMyGrowth();
        // 请求期间如果发生账号切换，旧账号响应不得覆盖新账号缓存。
        if (growthRequestVersion === requestVersion && ownerId === uid && res?.status === 200 && res.data) {
          growth.value = res.data as Growth;
          loadedOnce = true;
        } else if (growthRequestVersion === requestVersion && ownerId === uid) {
          growthError.value = true;
        }
      } catch (err) {
        console.warn('加载成长信息失败:', err);
        if (growthRequestVersion === requestVersion && ownerId === uid) growthError.value = true;
      } finally {
        // 只允许当前最新请求清理共享状态，避免旧账号请求晚返回后干扰新账号加载态。
        if (growthRequestVersion === requestVersion && growthRequest === request) {
          growthRequest = null;
          growthRequestOwnerId = null;
          loading.value = false;
        }
      }
      return growthRequestVersion === requestVersion && ownerId === uid ? growth.value : null;
    });
    growthRequest = request;
    return request;
  }

  // 成长看板(成就墙/统计/今日任务/时间线):每次进成长页强制刷新(数据随操作实时变化)
  async function loadDashboard() {
    ensureGrowthOwner(useUserStore().id || 'visitor');
    const generation = ownerGeneration;
    const requestVersion = ++dashboardRequestVersion;
    dashboardLoading.value = true;
    dashboardError.value = false;
    try {
      const res = await growthApi.getDashboard();
      if (generation !== ownerGeneration || requestVersion !== dashboardRequestVersion) return null;
      if (res?.status === 200 && res.data) {
        dashboard.value = res.data as GrowthDashboard;
      } else dashboardError.value = true;
    } catch (err) {
      console.warn('加载成长看板失败:', err);
      if (generation === ownerGeneration && requestVersion === dashboardRequestVersion) dashboardError.value = true;
    } finally {
      if (generation === ownerGeneration && requestVersion === dashboardRequestVersion) dashboardLoading.value = false;
    }
    return generation === ownerGeneration && requestVersion === dashboardRequestVersion ? dashboard.value : null;
  }

  // 成长任务定义与完成状态:成长页和“今日”摘要共享同一份短缓存/在途请求。
  async function loadGrowthTasks(force = false) {
    const uid = useUserStore().id || 'visitor';
    ensureGrowthOwner(uid);
    if (growthTasksOwnerId !== uid) {
      growthTasks.value = null;
      growthTasksOwnerId = uid;
      growthTasksRequest = null;
      growthTasksRequestOwnerId = null;
      growthTasksLoading.value = false;
      growthTasksError.value = false;
    }
    if (growthTasks.value && !force) return growthTasks.value;
    if (growthTasksRequest && growthTasksRequestOwnerId === uid) return growthTasksRequest;

    growthTasksLoading.value = true;
    growthTasksError.value = false;
    growthTasksRequestOwnerId = uid;
    const generation = ownerGeneration;
    const request = Promise.resolve().then(async () => {
      try {
        const res = await growthApi.getGrowthTasks();
        if (
          isCurrentGrowthOwner(uid, generation) &&
          growthTasksRequestOwnerId === uid &&
          res?.status === 200 &&
          res.data
        ) {
          growthTasks.value = normalizeGrowthTasks(res.data as GrowthTasksData);
        } else if (isCurrentGrowthOwner(uid, generation) && growthTasksRequestOwnerId === uid) {
          growthTasksError.value = true;
        }
      } catch (err) {
        console.warn('加载成长任务失败:', err);
        if (isCurrentGrowthOwner(uid, generation)) growthTasksError.value = true;
      } finally {
        if (isCurrentGrowthOwner(uid, generation) && growthTasksRequest === request) {
          growthTasksRequest = null;
          growthTasksRequestOwnerId = null;
          growthTasksLoading.value = false;
        }
      }
      return isCurrentGrowthOwner(uid, generation) ? growthTasks.value : null;
    });
    growthTasksRequest = request;
    return request;
  }

  // 一次性成长任务只在用户主动点击后领取；成功后同步任务领取态与全局成长快照。
  async function claimGrowthTask(taskKey: string) {
    const uid = useUserStore().id || 'visitor';
    ensureGrowthOwner(uid);
    if (claimingRewards.value) return null;
    claimingRewards.value = true;
    const generation = ownerGeneration;
    const claimVersion = ++claimRequestVersion;
    try {
      const res = await growthApi.claimGrowthTask(taskKey);
      if (res?.status === 200 && res.data?.ok) {
        // 领取请求返回期间若切换了账号，只把响应交给原调用方，不得覆盖新账号缓存。
        if (!isCurrentGrowthOwner(uid, generation)) return res;
        if (res.data.growth) {
          ownerId = uid;
          applyGrowthMutationSnapshot(res.data.growth as Growth);
        }
        await Promise.all([
          loadGrowthTasks(true),
          res.data.growth ? Promise.resolve(growth.value) : load(true),
          loadClaimable(),
        ]);
        syncPointsToViews();
      }
      return res;
    } finally {
      if (claimVersion === claimRequestVersion) claimingRewards.value = false;
    }
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
    const uid = useUserStore().id || 'visitor';
    ensureGrowthOwner(uid);
    const generation = ownerGeneration;
    const res = await growthApi.checkin();
    if (isCurrentGrowthOwner(uid, generation) && res?.status === 200 && res.data?.growth) {
      applyGrowthMutationSnapshot(res.data.growth as Growth);
      syncPointsToViews();
      loadInventory(); // 签到里程碑/满7天可能发补签卡 → 刷新背包
    }
    return res;
  }

  // 使用补签卡:成功则刷新成长快照(卡数/连签/可补签态更新)
  async function useProtectCard(date?: string) {
    const uid = useUserStore().id || 'visitor';
    ensureGrowthOwner(uid);
    const generation = ownerGeneration;
    const res = await growthApi.useProtectCard(date);
    if (isCurrentGrowthOwner(uid, generation) && res?.status === 200 && res.data?.growth) {
      applyGrowthMutationSnapshot(res.data.growth as Growth);
      loadInventory(); // 补签卡数量变化 → 刷新背包
    }
    return res;
  }

  // 领取今日任务奖励:成功则刷新成长快照 + 看板(经验/等级/领取态实时更新)
  async function claimDailyBonus() {
    const uid = useUserStore().id || 'visitor';
    ensureGrowthOwner(uid);
    if (claimingRewards.value) return null;
    claimingRewards.value = true;
    const generation = ownerGeneration;
    const claimVersion = ++claimRequestVersion;
    try {
      const res = await growthApi.claimDailyBonus();
      if (isCurrentGrowthOwner(uid, generation) && res?.status === 200 && res.data?.ok && res.data?.growth) {
        applyGrowthMutationSnapshot(res.data.growth as Growth);
        await Promise.all([loadDashboard(), loadClaimable()]);
        syncPointsToViews();
      }
      return res;
    } finally {
      if (claimVersion === claimRequestVersion) claimingRewards.value = false;
    }
  }

  // 标记升级通知已读(查看成长页后):清后端 + 本地未读标记
  async function markRead() {
    const uid = useUserStore().id || 'visitor';
    ensureGrowthOwner(uid);
    const generation = ownerGeneration;
    try {
      await growthApi.markNoticesRead();
    } catch {
      /* 忽略 */
    }
    if (isCurrentGrowthOwner(uid, generation) && growth.value) growth.value.hasUnreadLevelUp = false;
  }

  // 积分商店:每次打开强制刷新(余额/已拥有随购买实时变化)
  async function loadShop() {
    ensureGrowthOwner(useUserStore().id || 'visitor');
    const generation = ownerGeneration;
    shopLoading.value = true;
    shopError.value = false;
    try {
      const res = await growthApi.getShop();
      if (generation !== ownerGeneration) return null;
      if (res?.status === 200 && res.data) {
        const nextShop = res.data as Shop;
        shop.value = nextShop;
      } else {
        shopError.value = true;
      }
    } catch (err) {
      console.warn('加载积分商店失败:', err);
      if (generation === ownerGeneration) shopError.value = true;
    } finally {
      if (generation === ownerGeneration) shopLoading.value = false;
    }
    return generation === ownerGeneration ? shop.value : null;
  }

  // 背包 + 资产:每次进成长页刷新(使用/购买/抽奖/签到后数量随之变化)
  async function loadInventory() {
    ensureGrowthOwner(useUserStore().id || 'visitor');
    const generation = ownerGeneration;
    inventoryLoading.value = true;
    inventoryError.value = false;
    try {
      const res = await growthApi.getInventory();
      if (generation !== ownerGeneration) return null;
      if (res?.status === 200 && res.data) inventory.value = res.data as Inventory;
      else inventoryError.value = true;
    } catch (err) {
      console.warn('加载背包失败:', err);
      if (generation === ownerGeneration) inventoryError.value = true;
    } finally {
      if (generation === ownerGeneration) inventoryLoading.value = false;
    }
    return generation === ownerGeneration ? inventory.value : null;
  }

  // 使用一件历史背包消耗品(旧 AI 加油包 → 永久余额);成功则刷新背包与资产
  async function useItem(itemId: string) {
    const res = await growthApi.useItemApi(itemId);
    if (res?.status === 200 && res.data?.ok) {
      await Promise.all([loadInventory(), load(true)]);
    }
    return res;
  }

  // 购买商品:返回后端 result(ok/reason/msg/points);成功则刷新商店 + 成长快照(余额/卡数/称号变化)
  async function buyItem(itemId: string) {
    const uid = useUserStore().id || 'visitor';
    const currentShop = shop.value || (await loadShop());
    const item =
      currentShop?.items.find((candidate) => candidate.id === itemId) ||
      currentShop?.frames?.find((candidate) => candidate.id === itemId);
    if (!currentShop?.economyVersion || !item || item.cost === null) return null;
    const operation: PointsEconomyOperation = 'shop_buy';
    const payload = {
      itemId,
      economyVersion: currentShop.economyVersion,
      expectedCost: Number(item.cost),
    };
    const pending = getOrCreatePointsEconomyRequest(uid, operation, payload);
    const requestPayload = pending.payload as typeof payload;
    try {
      const res = await growthApi.buyShopItem({ ...requestPayload, clientRequestId: pending.clientRequestId });
      if (res?.status === 200) {
        completePointsEconomyRequest(uid, operation, requestPayload);
        if (res.data?.ok) {
          await Promise.all([loadShop(), load(true), loadInventory()]);
          syncPointsToViews();
        } else if (res.data?.reason === 'purchase_limit') {
          // 旧标签页或并发请求可能仍显示可兑换；以后端有限次领取事实刷新本地状态。
          await loadShop();
        }
      } else if (res?.status === 409) {
        if (res.data?.code !== 'IDEMPOTENCY_RESULT_PENDING') {
          completePointsEconomyRequest(uid, operation, requestPayload);
        }
        if (res.data?.refresh) await loadShop();
      } else if (res?.status !== 200) {
        completePointsEconomyRequest(uid, operation, requestPayload);
      }
      return res;
    } catch (error) {
      if (!isAmbiguousPointsEconomyFailure(error)) completePointsEconomyRequest(uid, operation, requestPayload);
      throw error;
    }
  }

  // 佩戴/卸下称号:成功则刷新商店 + 成长快照(已佩戴态变化)
  async function equipTitle(titleId: string | null) {
    const res = await growthApi.equipTitle(titleId);
    if (res?.status === 200 && res.data?.ok) {
      await Promise.all([loadShop(), load(true)]);
    }
    return res;
  }

  // 佩戴/卸下头像框装扮:成功则刷新商店 + 成长快照(头像框全局随 growth.equippedFrame 变化)
  async function equipFrame(frameId: string | null) {
    const res = await growthApi.equipFrame(frameId);
    if (res?.status === 200 && res.data?.ok) {
      await Promise.all([loadShop(), load(true)]);
    }
    return res;
  }

  // 抽奖状态:余额/成本/保底/奖池概率
  async function loadLottery() {
    ensureGrowthOwner(useUserStore().id || 'visitor');
    const generation = ownerGeneration;
    lotteryLoading.value = true;
    lotteryError.value = false;
    try {
      const res = await growthApi.getLottery();
      if (generation !== ownerGeneration) return null;
      if (res?.status === 200 && res.data) {
        const nextLottery = res.data as LotteryStatus;
        lottery.value = nextLottery;
      } else {
        lotteryError.value = true;
      }
    } catch (err) {
      console.warn('加载抽奖信息失败:', err);
      if (generation === ownerGeneration) lotteryError.value = true;
    } finally {
      if (generation === ownerGeneration) lotteryLoading.value = false;
    }
    return generation === ownerGeneration ? lottery.value : null;
  }

  // 抽奖:times=1 单抽 / 10 十连;free=true 用每日免费次数(单抽)。成功则刷新抽奖状态 + 成长快照
  async function draw(times: number, free = false) {
    const uid = useUserStore().id || 'visitor';
    const currentLottery = lottery.value || (await loadLottery());
    if (!currentLottery?.economyVersion) return null;
    const mode = free ? 'free' : 'paid';
    const normalizedTimes = free ? 1 : times === 10 ? 10 : 1;
    const expectedCost = free
      ? 0
      : normalizedTimes === 10
        ? currentLottery.paid.tenCost
        : currentLottery.paid.singleCost;
    const operation: PointsEconomyOperation = free ? 'lottery_free' : 'lottery_paid';
    const payload = {
      mode,
      times: normalizedTimes,
      economyVersion: currentLottery.economyVersion,
      expectedCost,
    } as const;
    const pending = getOrCreatePointsEconomyRequest(uid, operation, payload);
    const requestPayload = pending.payload as typeof payload;
    try {
      const res = await growthApi.drawLottery({ ...requestPayload, clientRequestId: pending.clientRequestId });
      if (res?.status === 200) {
        completePointsEconomyRequest(uid, operation, requestPayload);
        if (res.data?.ok) {
          await Promise.all([loadLottery(), load(true), loadInventory()]);
          syncPointsToViews();
        }
      } else if (res?.status === 409) {
        if (res.data?.code !== 'IDEMPOTENCY_RESULT_PENDING') {
          completePointsEconomyRequest(uid, operation, requestPayload);
        }
        if (res.data?.refresh) await loadLottery();
      } else if (res?.status !== 200) {
        completePointsEconomyRequest(uid, operation, requestPayload);
      }
      return res;
    } catch (error) {
      if (!isAmbiguousPointsEconomyFailure(error)) completePointsEconomyRequest(uid, operation, requestPayload);
      throw error;
    }
  }

  // 领取成就奖励:成功则刷新看板、成长快照和头像框目录(成就框立即进入装扮库)
  async function claimAchievement(key: string) {
    const uid = useUserStore().id || 'visitor';
    ensureGrowthOwner(uid);
    if (claimingRewards.value) return null;
    claimingRewards.value = true;
    const generation = ownerGeneration;
    const claimVersion = ++claimRequestVersion;
    try {
      const res = await growthApi.claimAchievement(key);
      if (isCurrentGrowthOwner(uid, generation) && res?.status === 200 && res.data?.ok) {
        const refreshes: Array<Promise<unknown>> = [loadDashboard(), load(true), loadClaimable()];
        if (res.data.frameId) refreshes.push(loadShop());
        await Promise.all(refreshes);
        syncPointsToViews();
      }
      return res;
    } finally {
      if (claimVersion === claimRequestVersion) claimingRewards.value = false;
    }
  }

  // 每周挑战:进度 + 领取
  async function loadWeekly() {
    ensureGrowthOwner(useUserStore().id || 'visitor');
    const generation = ownerGeneration;
    try {
      const res = await growthApi.getWeekly();
      if (generation === ownerGeneration && res?.status === 200 && res.data) weekly.value = res.data as WeeklyData;
    } catch (err) {
      console.warn('加载每周挑战失败:', err);
    }
    return generation === ownerGeneration ? weekly.value : null;
  }
  async function claimWeekly(key: string) {
    const uid = useUserStore().id || 'visitor';
    ensureGrowthOwner(uid);
    if (claimingRewards.value) return null;
    claimingRewards.value = true;
    const generation = ownerGeneration;
    const claimVersion = ++claimRequestVersion;
    try {
      const res = await growthApi.claimWeekly(key);
      if (isCurrentGrowthOwner(uid, generation) && res?.status === 200 && res.data?.ok) {
        await Promise.all([loadWeekly(), load(true), loadClaimable()]);
        syncPointsToViews();
      }
      return res;
    } finally {
      if (claimVersion === claimRequestVersion) claimingRewards.value = false;
    }
  }

  // 那年今日 · 智能回顾
  async function loadRecap() {
    ensureGrowthOwner(useUserStore().id || 'visitor');
    const generation = ownerGeneration;
    recapLoading.value = true;
    recapError.value = false;
    try {
      const res = await growthApi.getRecap();
      if (generation !== ownerGeneration) return null;
      if (res?.status === 200 && res.data) recap.value = res.data as RecapData;
      else recapError.value = true;
    } catch (err) {
      console.warn('加载回顾失败:', err);
      if (generation === ownerGeneration) recapError.value = true;
    } finally {
      if (generation === ownerGeneration) recapLoading.value = false;
    }
    return generation === ownerGeneration ? recap.value : null;
  }

  async function setRecapState(item: RecapItem, action: 'snooze_7d' | 'dismiss') {
    const uid = useUserStore().id || 'visitor';
    ensureGrowthOwner(uid);
    const generation = ownerGeneration;
    const res = await growthApi.updateRecapState({ type: item.type, id: item.id, action });
    if (isCurrentGrowthOwner(uid, generation) && res?.status === 200 && res.data?.ok) await loadRecap();
    return res;
  }

  async function loadClaimable() {
    ensureGrowthOwner(useUserStore().id || 'visitor');
    const generation = ownerGeneration;
    claimableLoading.value = true;
    claimableError.value = false;
    try {
      const res = await growthApi.getClaimable();
      if (generation !== ownerGeneration) return null;
      if (res?.status === 200 && res.data) claimable.value = res.data as GrowthClaimable;
      else claimableError.value = true;
    } catch (err) {
      console.warn('加载待领取奖励失败:', err);
      if (generation === ownerGeneration) claimableError.value = true;
    } finally {
      if (generation === ownerGeneration) claimableLoading.value = false;
    }
    return generation === ownerGeneration ? claimable.value : null;
  }

  async function claimAllRewards(scopes?: Array<'daily' | 'growthTasks' | 'achievements' | 'weekly'>) {
    const uid = useUserStore().id || 'visitor';
    ensureGrowthOwner(uid);
    if (claimingRewards.value) return null;
    claimingRewards.value = true;
    const generation = ownerGeneration;
    const claimVersion = ++claimRequestVersion;
    try {
      const res = await growthApi.claimAll(scopes?.length ? { scopes } : undefined);
      if (isCurrentGrowthOwner(uid, generation) && res?.status === 200 && res.data?.ok) {
        if (res.data.growth) {
          applyGrowthMutationSnapshot(res.data.growth as Growth);
        }
        await Promise.all([loadDashboard(), loadGrowthTasks(true), loadWeekly(), loadClaimable(), loadInventory()]);
        if (Array.isArray(res.data.frames) && res.data.frames.length) await loadShop();
        syncPointsToViews();
      }
      return res;
    } finally {
      if (claimVersion === claimRequestVersion) claimingRewards.value = false;
    }
  }

  async function loadPreferences() {
    ensureGrowthOwner(useUserStore().id || 'visitor');
    const generation = ownerGeneration;
    preferencesLoading.value = true;
    preferencesError.value = false;
    try {
      const res = await growthApi.getGrowthPreferences();
      if (generation !== ownerGeneration) return null;
      if (res?.status === 200 && res.data) preferences.value = res.data as GrowthPreferences;
      else preferencesError.value = true;
    } catch (err) {
      console.warn('加载成长偏好失败:', err);
      if (generation === ownerGeneration) preferencesError.value = true;
    } finally {
      if (generation === ownerGeneration) preferencesLoading.value = false;
    }
    return generation === ownerGeneration ? preferences.value : null;
  }

  async function savePreferences(patch: Partial<GrowthPreferences>) {
    const uid = useUserStore().id || 'visitor';
    ensureGrowthOwner(uid);
    const generation = ownerGeneration;
    const res = await growthApi.updateGrowthPreferences({
      ...patch,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || preferences.value?.timezone,
      utcOffsetMinutes: -new Date().getTimezoneOffset(),
    });
    if (isCurrentGrowthOwner(uid, generation) && res?.status === 200 && res.data?.ok) {
      preferences.value = res.data as GrowthPreferences;
    }
    return res;
  }

  return {
    growth,
    ranks,
    dashboard,
    shop,
    inventory,
    lottery,
    weekly,
    recap,
    growthTasks,
    claimable,
    preferences,
    loading,
    growthError,
    dashboardLoading,
    dashboardError,
    claimableLoading,
    claimableError,
    preferencesLoading,
    preferencesError,
    recapLoading,
    recapError,
    claimingRewards,
    shopLoading,
    shopError,
    inventoryLoading,
    inventoryError,
    lotteryLoading,
    lotteryError,
    growthTasksLoading,
    growthTasksError,
    load,
    loadRanks,
    loadDashboard,
    loadGrowthTasks,
    claimGrowthTask,
    doCheckin,
    claimDailyBonus,
    useProtectCard,
    markRead,
    loadShop,
    buyItem,
    loadInventory,
    useItem,
    equipTitle,
    equipFrame,
    loadLottery,
    draw,
    claimAchievement,
    loadWeekly,
    claimWeekly,
    loadRecap,
    setRecapState,
    loadClaimable,
    claimAllRewards,
    loadPreferences,
    savePreferences,
  };
}
