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
  unlocked: boolean;
  reward?: number; // 解锁后可领的积分
  claimed?: boolean; // 是否已领取
  claimable?: boolean; // 已解锁且未领
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
  weekExp: number;
  checkinDays: string[];
}

export interface Quest {
  key: string;
  done: boolean;
  cur?: number;
  target?: number;
  random?: boolean;
}

export interface TimelineItem {
  source: string;
  name?: string | null;
  amount: number;
  meta: any;
  time: string;
}

export interface QuestBonus {
  /** 一次性经验。root 的经验不入账，这里为 0，前端据此改说「只发积分」。 */
  exp: number;
  /** 一次性积分。消费货币，满级/root 同样发放。 */
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
  equippedFrame: string | null;
  protectCards: number;
  isVisitor: boolean;
  items: ShopItem[];
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
  rare?: boolean;
}

export interface LotteryStatus {
  points: number;
  count: number;
  toPity: number;
  singleCost: number;
  tenCost: number;
  pityEvery: number;
  level: number;
  freeDaily: number; // 当前等级每日免费次数
  freeRemaining: number; // 今日剩余免费次数
  pool: LotteryPrize[];
}

export interface LotteryDrawResult {
  ok: boolean;
  reason?: string;
  msg?: string;
  cost?: number;
  free?: boolean;
  points?: number;
  results?: LotteryPrize[];
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
  claimableCount?: number;
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
  const tasks = (Array.isArray(data.tasks) ? data.tasks : [])
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
  const completedCount = tasks.filter((task) => task.completed).length;
  const claimedCount = tasks.filter((task) => task.claimed).length;
  return {
    tasks,
    totalCount: tasks.length,
    completedCount,
    claimedCount,
    claimableCount: tasks.filter((task) => task.claimable).length,
    remainingCount: tasks.length - completedCount,
    activeCount: tasks.length - claimedCount,
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
const loading = ref(false);
const dashboardLoading = ref(false);
const shopLoading = ref(false);
const lotteryLoading = ref(false);
const growthTasksLoading = ref(false);
let loadedOnce = false;
let ranksLoaded = false;
let ownerId: string | null = null; // 成长缓存归属的账号,切号即作废
let growthTasksOwnerId: string | null = null; // 成长任务缓存单独归属，避免影响成长快照缓存
let growthRequest: Promise<Growth | null> | null = null;
let growthRequestOwnerId: string | null = null;
let growthTasksRequest: Promise<GrowthTasksData | null> | null = null;
let growthTasksRequestOwnerId: string | null = null;
let growthRequestVersion = 0;

// 登出/切换账号时作废用户成长缓存(ranks 段位表全局通用,与账号无关,不清)
export function resetGrowth() {
  growth.value = null;
  dashboard.value = null;
  shop.value = null;
  inventory.value = null;
  lottery.value = null;
  weekly.value = null;
  recap.value = null;
  growthTasks.value = null;
  loadedOnce = false;
  ownerId = null;
  growthTasksOwnerId = null;
  growthRequest = null;
  growthRequestOwnerId = null;
  growthTasksRequest = null;
  growthTasksRequestOwnerId = null;
  growthRequestVersion += 1;
  loading.value = false;
  growthTasksLoading.value = false;
}

// 积分余额单一事实源是 growth.points;商店/抽奖各自缓存了余额副本,
// 任一动作改动积分后调用此函数把最新余额同步到已加载的视图,避免抽奖/商店余额滞后需刷新页面。
function syncPointsToViews() {
  const p = growth.value?.points;
  if (typeof p !== 'number') return;
  if (lottery.value) lottery.value.points = p;
  if (shop.value) shop.value.points = p;
}

export function useGrowth() {
  async function load(force = false) {
    const uid = useUserStore().id || 'visitor';
    if (ownerId !== uid) {
      // 账号变了(登出→游客 / 换号):旧缓存立即作废,防止显示上一个账号的等级/经验
      growth.value = null;
      loadedOnce = false;
      ownerId = uid;
      growthTasks.value = null;
      growthTasksOwnerId = null;
      growthTasksRequest = null;
      growthTasksRequestOwnerId = null;
      growthTasksLoading.value = false;
    }
    if (loadedOnce && !force) return growth.value;
    // 多个首屏组件会同时读取成长信息。在同账号请求仍在进行时直接复用，
    // 避免缓存尚未写入前重复调用 /growth/me；force 只跳过已完成缓存，不绕过在途合并。
    if (growthRequest && growthRequestOwnerId === uid) return growthRequest;

    loading.value = true;
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
        }
      } catch (err) {
        console.warn('加载成长信息失败:', err);
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

  // 成长任务定义与完成状态:成长页和“今日”摘要共享同一份短缓存/在途请求。
  async function loadGrowthTasks(force = false) {
    const uid = useUserStore().id || 'visitor';
    if (growthTasksOwnerId !== uid) {
      growthTasks.value = null;
      growthTasksOwnerId = uid;
      growthTasksRequest = null;
      growthTasksRequestOwnerId = null;
      growthTasksLoading.value = false;
    }
    if (growthTasks.value && !force) return growthTasks.value;
    if (growthTasksRequest && growthTasksRequestOwnerId === uid) return growthTasksRequest;

    growthTasksLoading.value = true;
    growthTasksRequestOwnerId = uid;
    const request = Promise.resolve().then(async () => {
      try {
        const res = await growthApi.getGrowthTasks();
        if (growthTasksRequestOwnerId === uid && res?.status === 200 && res.data) {
          growthTasks.value = normalizeGrowthTasks(res.data as GrowthTasksData);
        }
      } catch (err) {
        console.warn('加载成长任务失败:', err);
      } finally {
        if (growthTasksRequest === request) {
          growthTasksRequest = null;
          growthTasksRequestOwnerId = null;
          growthTasksLoading.value = false;
        }
      }
      return growthTasks.value;
    });
    growthTasksRequest = request;
    return request;
  }

  // 一次性成长任务只在用户主动点击后领取；成功后同步任务领取态与全局成长快照。
  async function claimGrowthTask(taskKey: string) {
    const uid = useUserStore().id || 'visitor';
    const res = await growthApi.claimGrowthTask(taskKey);
    if (res?.status === 200 && res.data?.ok) {
      // 领取请求返回期间若切换了账号，只把响应交给原调用方，不得覆盖新账号缓存。
      if ((useUserStore().id || 'visitor') !== uid) return res;
      if (res.data.growth) {
        ownerId = uid;
        growth.value = res.data.growth as Growth;
        loadedOnce = true;
      }
      await Promise.all([loadGrowthTasks(true), res.data.growth ? Promise.resolve(growth.value) : load(true)]);
      syncPointsToViews();
    }
    return res;
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
      syncPointsToViews();
      loadInventory(); // 签到里程碑/满7天可能发补签卡 → 刷新背包
    }
    return res;
  }

  // 使用补签卡:成功则刷新成长快照(卡数/连签/可补签态更新)
  async function useProtectCard(date?: string) {
    const res = await growthApi.useProtectCard(date);
    if (res?.status === 200 && res.data?.growth) {
      growth.value = res.data.growth as Growth;
      loadedOnce = true;
      loadInventory(); // 补签卡数量变化 → 刷新背包
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
      syncPointsToViews();
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

  // 背包 + 资产:每次进成长页刷新(使用/购买/抽奖/签到后数量随之变化)
  async function loadInventory() {
    try {
      const res = await growthApi.getInventory();
      if (res?.status === 200 && res.data) inventory.value = res.data as Inventory;
    } catch (err) {
      console.warn('加载背包失败:', err);
    }
    return inventory.value;
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
    const res = await growthApi.buyShopItem(itemId);
    if (res?.status === 200 && res.data?.ok) {
      // AI 加油余额/永久扩容等资产即时到账，购买后同步资产区
      await Promise.all([loadShop(), load(true), loadInventory()]);
      syncPointsToViews();
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

  // 抽奖:times=1 单抽 / 10 十连;free=true 用每日免费次数(单抽)。成功则刷新抽奖状态 + 成长快照
  async function draw(times: number, free = false) {
    const res = await growthApi.drawLottery(times, free);
    if (res?.status === 200 && res.data?.ok) {
      // 抽中的 AI 加油余额/补签卡会改变资产或物品，同步刷新
      await Promise.all([loadLottery(), load(true), loadInventory()]);
      syncPointsToViews();
    }
    return res;
  }

  // 领取成就奖励:成功则刷新看板(领取态)+ 成长快照(积分余额)
  async function claimAchievement(key: string) {
    const res = await growthApi.claimAchievement(key);
    if (res?.status === 200 && res.data?.ok) {
      await Promise.all([loadDashboard(), load(true)]);
      syncPointsToViews();
    }
    return res;
  }

  // 每周挑战:进度 + 领取
  async function loadWeekly() {
    try {
      const res = await growthApi.getWeekly();
      if (res?.status === 200 && res.data) weekly.value = res.data as WeeklyData;
    } catch (err) {
      console.warn('加载每周挑战失败:', err);
    }
    return weekly.value;
  }
  async function claimWeekly(key: string) {
    const res = await growthApi.claimWeekly(key);
    if (res?.status === 200 && res.data?.ok) {
      await Promise.all([loadWeekly(), load(true)]);
      syncPointsToViews();
    }
    return res;
  }

  // 那年今日 · 智能回顾
  async function loadRecap() {
    try {
      const res = await growthApi.getRecap();
      if (res?.status === 200 && res.data) recap.value = res.data as RecapData;
    } catch (err) {
      console.warn('加载回顾失败:', err);
    }
    return recap.value;
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
    loading,
    dashboardLoading,
    shopLoading,
    lotteryLoading,
    growthTasksLoading,
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
  };
}
