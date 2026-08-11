// 头像框装扮样式:id → 可识别的视觉变体(兑换、成就领取、顶部佩戴处共用)。
// 与后端 FRAME_CATALOG 的 frame_* id 对应；后端管获取来源，前端管样式。
export const FRAME_VARIANTS = {
  frame_mint: 'mint',
  frame_ink: 'ink',
  frame_moonstone: 'moonstone',
  frame_gold: 'gold',
  frame_sakura: 'sakura',
  frame_neon: 'neon',
  frame_sunset: 'sunset',
  frame_ocean: 'ocean',
  frame_aurora: 'aurora',
  frame_galaxy: 'galaxy',
  frame_flame: 'flame',
  frame_dragon: 'dragon',
  frame_celestial: 'celestial',
  frame_first_light: 'first-light',
  frame_streak_seed: 'streak-seed',
  frame_streak_month: 'streak-month',
  frame_bookmark_seed: 'bookmark-seed',
  frame_note_seed: 'note-seed',
  frame_file_seed: 'file-seed',
  frame_bookmark_archive: 'bookmark-archive',
  frame_note_masterpiece: 'note-masterpiece',
  frame_file_vault: 'file-vault',
  frame_note_constellation: 'note-constellation',
  frame_file_constellation: 'file-constellation',
  frame_streak_eternal: 'streak-eternal',
} as const;

export type FrameId = keyof typeof FRAME_VARIANTS;
export type FrameVariant = (typeof FRAME_VARIANTS)[FrameId];

export const FRAME_IDS = Object.freeze(Object.keys(FRAME_VARIANTS) as FrameId[]);

export const FRAME_RARITY_ORDER = Object.freeze({
  basic: 0,
  rare: 1,
  epic: 2,
  legendary: 3,
} as const);

type FrameRarity = keyof typeof FRAME_RARITY_ORDER;

function frameRarityRank(rarity?: string | null) {
  return rarity && rarity in FRAME_RARITY_ORDER ? FRAME_RARITY_ORDER[rarity as FrameRarity] : Number.MAX_SAFE_INTEGER;
}

// 所有头像框入口统一按「基础 → 进阶 → 炫彩 → 传说」展示；同档内保留目录原始顺序。
// 返回新数组，避免 computed 排序时意外修改接口缓存中的原始列表。
export function sortFramesByRarity<T extends { rarity?: string | null }>(frames: readonly T[]): T[] {
  return [...frames].sort((left, right) => frameRarityRank(left.rarity) - frameRarityRank(right.rarity));
}

// 对应可识别的视觉变体;未知/未佩戴装扮返回 null,避免错误渲染成某一款框体。
export function frameVariant(id?: string | null): FrameVariant | null {
  return id && id in FRAME_VARIANTS ? FRAME_VARIANTS[id as FrameId] : null;
}
