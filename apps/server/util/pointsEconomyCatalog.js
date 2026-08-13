// 积分经济单一事实源：仅包含纯数据与纯函数，禁止依赖数据库、HTTP 或用户状态。
// 任意价格、概率或等级门槛变更都必须升级版本并同步快照测试。

export const LEGACY_POINTS_ECONOMY_VERSION = 'points-economy-c3';
export const POINTS_ECONOMY_VERSION = 'points-economy-c4';

const LEGACY_UTILITY_ITEMS = [
  {
    id: 'ai_pack_small',
    type: 'consumable',
    name: 'AI 轻量加油包',
    desc: '+30 万 tokens · 永久有效，每日等级额度用完后自动使用',
    cost: 90,
    effect: 'ai_pack',
    bonusTokens: 300_000,
  },
  {
    id: 'ai_pack',
    type: 'consumable',
    name: 'AI 加油包',
    desc: '+60 万 tokens · 永久有效，每日等级额度用完后自动使用',
    cost: 150,
    effect: 'ai_pack',
    bonusTokens: 600_000,
  },
  {
    id: 'storage_128',
    type: 'consumable',
    name: '扩容包 128MB',
    desc: '云空间永久 +128MB，低门槛扩容',
    cost: 250,
    effect: 'storage',
    storageMb: 128,
  },
  {
    id: 'storage_512',
    type: 'consumable',
    name: '扩容包 512MB',
    desc: '云空间永久 +512MB，叠加在等级配额之上',
    cost: 800,
    effect: 'storage',
    storageMb: 512,
  },
  {
    id: 'storage_2g',
    type: 'consumable',
    name: '扩容包 2GB',
    desc: '云空间永久 +2GB，大文件用户长期扩容',
    cost: 2500,
    effect: 'storage',
    storageMb: 2048,
  },
];

const C4_UTILITY_ITEMS = LEGACY_UTILITY_ITEMS.map((item) => ({
  ...item,
  cost: {
    ai_pack_small: 240,
    ai_pack: 420,
    storage_128: 500,
    storage_512: 1600,
    storage_2g: 5200,
  }[item.id],
}));

const FRAME_BASE = [
  ['frame_mint', 'basic', '薄荷', '头像框 · 清透薄荷晶环'],
  ['frame_ink', 'basic', '墨韵', '头像框 · 墨玉双层笔锋'],
  ['frame_moonstone', 'basic', '月白', '头像框 · 月白瓷光'],
  ['frame_gold', 'rare', '鎏金', '头像框 · 金光流转'],
  ['frame_sakura', 'rare', '樱绯', '头像框 · 樱色浪漫'],
  ['frame_sunset', 'rare', '晚霞', '头像框 · 暮色渐染'],
  ['frame_ocean', 'epic', '潮汐', '头像框 · 深海流光'],
  ['frame_aurora', 'epic', '极光', '头像框 · 极光幻彩'],
  ['frame_flame', 'epic', '赤焰', '头像框 · 烈焰跃动'],
  ['frame_neon', 'legendary', '霓虹', '头像框 · 赛博霓虹'],
  ['frame_galaxy', 'legendary', '星河', '头像框 · 流光星河'],
  ['frame_dragon', 'legendary', '龙曜', '头像框 · 龙鳞金焰'],
  ['frame_celestial', 'legendary', '天穹', '头像框 · 星环日蚀'],
];

const LEGACY_FRAME_COSTS = [220, 320, 420, 500, 600, 750, 900, 1100, 1300, 1600, 1900, 2400, 3200];
const LEGACY_FRAME_LEVELS = [0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12];
const C4_FRAME_COSTS = [220, 320, 480, 700, 1000, 1400, 2000, 2800, 3800, 6000, 9000, 12000, 16000];
const C4_FRAME_LEVELS = [0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 4, 5, 6];

function buildFrames(costs, levels) {
  return FRAME_BASE.map(([id, rarity, name, desc], index) => ({
    id,
    type: 'cosmetic',
    effect: 'frame',
    rarity,
    name,
    desc,
    cost: costs[index],
    minLevel: levels[index],
  }));
}

const LEGACY_PAID_POOL = [
  { id: 'p10', kind: 'points', amount: 10, name: '+10 积分', weight: 380 },
  { id: 'p30', kind: 'points', amount: 30, name: '+30 积分', weight: 300 },
  { id: 'p70', kind: 'points', amount: 70, name: '+70 积分', weight: 130 },
  { id: 'card', kind: 'card', amount: 1, name: '补签卡 ×1', weight: 60, tier: 'rare' },
  { id: 'ai', kind: 'ai_pack', amount: 600_000, name: 'AI 加油包', weight: 80, tier: 'rare' },
  { id: 's128', kind: 'storage', amount: 128, name: '扩容 +128MB', weight: 45, tier: 'rare' },
  { id: 's512', kind: 'storage', amount: 512, name: '扩容 +512MB（大奖）', weight: 5, tier: 'rare' },
];

const C4_FREE_POOL = [
  { id: 'p10', kind: 'points', amount: 10, name: '+10 积分', weight: 500 },
  { id: 'p20', kind: 'points', amount: 20, name: '+20 积分', weight: 300 },
  { id: 'p40', kind: 'points', amount: 40, name: '+40 积分', weight: 100 },
  { id: 'ai100', kind: 'ai_pack', amount: 100_000, name: 'AI 加油 +10 万', weight: 80 },
  { id: 'ai200', kind: 'ai_pack', amount: 200_000, name: 'AI 加油 +20 万', weight: 20 },
];

// 权重合计严格为 1000；保底池只取 tier=rare 的 170 权重。
const C4_PAID_POOL = [
  { id: 'p20', kind: 'points', amount: 20, name: '+20 积分', weight: 400 },
  { id: 'p50', kind: 'points', amount: 50, name: '+50 积分', weight: 300 },
  { id: 'p100', kind: 'points', amount: 100, name: '+100 积分', weight: 130 },
  { id: 'card', kind: 'card', amount: 1, name: '补签卡 ×1', weight: 40, tier: 'rare' },
  { id: 'ai', kind: 'ai_pack', amount: 600_000, name: 'AI 加油包', weight: 80, tier: 'rare' },
  { id: 's128', kind: 'storage', amount: 128, name: '扩容 +128MB', weight: 45, tier: 'rare' },
  { id: 's512', kind: 'storage', amount: 512, name: '扩容 +512MB（大奖）', weight: 5, tier: 'rare' },
];

function freezeItems(items) {
  return Object.freeze(items.map((item) => Object.freeze({ ...item })));
}

function freezePolicy(policy) {
  return Object.freeze({
    ...policy,
    pool: freezeItems(policy.pool),
  });
}

export const ECONOMY_CATALOGS = Object.freeze({
  [LEGACY_POINTS_ECONOMY_VERSION]: Object.freeze({
    version: LEGACY_POINTS_ECONOMY_VERSION,
    utilityItems: freezeItems(LEGACY_UTILITY_ITEMS),
    frameItems: freezeItems(buildFrames(LEGACY_FRAME_COSTS, LEGACY_FRAME_LEVELS)),
    freePolicy: freezePolicy({ poolVersion: 'c3-shared-v1', pool: LEGACY_PAID_POOL, countsPaidPity: true }),
    paidPolicy: freezePolicy({
      poolVersion: 'c3-paid-v1',
      singleCost: 88,
      tenCost: 800,
      pityEvery: 10,
      cardOverflowPoints: 70,
      pool: LEGACY_PAID_POOL,
    }),
  }),
  [POINTS_ECONOMY_VERSION]: Object.freeze({
    version: POINTS_ECONOMY_VERSION,
    utilityItems: freezeItems(C4_UTILITY_ITEMS),
    frameItems: freezeItems(buildFrames(C4_FRAME_COSTS, C4_FRAME_LEVELS)),
    freePolicy: freezePolicy({ poolVersion: 'c4-free-v1', pool: C4_FREE_POOL, countsPaidPity: false }),
    paidPolicy: freezePolicy({
      poolVersion: 'c4-paid-v1',
      singleCost: 170,
      tenCost: 1600,
      pityEvery: 10,
      cardOverflowPoints: 120,
      pool: C4_PAID_POOL,
    }),
  }),
});

export function parseRuntimeFlag(value, defaultValue) {
  if (value === undefined || value === null || value === '') return Boolean(defaultValue);
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return false;
}

export function getActiveEconomyVersion(env = process.env) {
  return parseRuntimeFlag(env.POINTS_ECONOMY_C4_ENABLED, false)
    ? POINTS_ECONOMY_VERSION
    : LEGACY_POINTS_ECONOMY_VERSION;
}

export function getActiveEconomyCatalog(env = process.env) {
  return ECONOMY_CATALOGS[getActiveEconomyVersion(env)];
}

export function getEconomyRuntime(env = process.env) {
  const catalog = getActiveEconomyCatalog(env);
  const c4Active = catalog.version === POINTS_ECONOMY_VERSION;
  return Object.freeze({
    catalog,
    economyVersion: catalog.version,
    c4Active,
    // C4 激活后协议不可降级；该开关只用于 C3 兼容代码提前上线时主动收紧旧写入口。
    requireWriteVersion: c4Active || parseRuntimeFlag(env.POINTS_ECONOMY_REQUIRE_WRITE_VERSION, false),
    purchaseEnabled: parseRuntimeFlag(env.POINTS_SHOP_PURCHASE_ENABLED, true),
    freeLotteryEnabled: parseRuntimeFlag(env.POINTS_LOTTERY_FREE_ENABLED, true),
    paidLotteryEnabled: parseRuntimeFlag(env.POINTS_LOTTERY_PAID_ENABLED, true),
  });
}

export function freeDrawsFor(level, version = getActiveEconomyVersion()) {
  const lv = Math.max(1, Number(level) || 1);
  if (version === LEGACY_POINTS_ECONOMY_VERSION && lv >= 15) return 5;
  if (lv >= 10) return 3;
  if (lv >= 6) return 2;
  if (lv >= 3) return 1;
  return 0;
}

export function getEconomyCatalogSnapshot(version = POINTS_ECONOMY_VERSION) {
  const catalog = ECONOMY_CATALOGS[version];
  if (!catalog) return null;
  return {
    version: catalog.version,
    utilityItems: catalog.utilityItems.map(({ id, cost, bonusTokens = 0, storageMb = 0 }) => ({
      id,
      cost,
      bonusTokens,
      storageMb,
    })),
    frameItems: catalog.frameItems.map(({ id, rarity, cost, minLevel }) => ({ id, rarity, cost, minLevel })),
    freePolicy: {
      poolVersion: catalog.freePolicy.poolVersion,
      countsPaidPity: catalog.freePolicy.countsPaidPity,
      pool: catalog.freePolicy.pool.map(({ id, kind, amount, weight }) => ({ id, kind, amount, weight })),
    },
    paidPolicy: {
      poolVersion: catalog.paidPolicy.poolVersion,
      singleCost: catalog.paidPolicy.singleCost,
      tenCost: catalog.paidPolicy.tenCost,
      pityEvery: catalog.paidPolicy.pityEvery,
      cardOverflowPoints: catalog.paidPolicy.cardOverflowPoints,
      pool: catalog.paidPolicy.pool.map(({ id, kind, amount, weight, tier = null }) => ({
        id,
        kind,
        amount,
        weight,
        tier,
      })),
    },
  };
}
