import icon from '@/config/icon.ts';

/**
 * 成就展示元信息。
 * 阈值(target)与解锁判定在后端 util/growth.js 的 ACHIEVEMENTS 单一事实源，前端只负责呈现。
 * 文案走 i18n:growth.achName.<key> / growth.achDesc.<key>；分组标题 growth.achGroup.<group>。
 *
 * 视觉体系刻意拆成两层：
 * - jewel：表达签到、笔记、文件等成就家族；
 * - metal：表达成就稀有度，避免高阶成就仍被家族色误读成普通彩色图标。
 */

export const ACHIEVEMENT_GROUPS = ['checkin', 'create', 'action', 'organize', 'level', 'tenure'] as const;
export type AchievementGroup = (typeof ACHIEVEMENT_GROUPS)[number];

export type AchievementFamily = 'checkin' | 'bookmark' | 'note' | 'file' | 'todo' | 'organize' | 'level' | 'tenure';
export type AchievementTier = 1 | 2 | 3 | 4 | 5;
export type AchievementRarity = 'starter' | 'platinum' | 'gilded' | 'legendary' | 'mythic';

interface AchievementJewelPalette {
  accent: string;
  secondary: string;
  deep: string;
  highlight: string;
}

interface AchievementMetalPalette {
  rarity: AchievementRarity;
  metalDeep: string;
  metalDark: string;
  metalMid: string;
  metalBright: string;
  metalHighlight: string;
  metalWhite: string;
  metalGlow: string;
  surface: string;
  nightSurface: string;
  border: string;
  shadow: string;
}

export interface AchievementVisual extends AchievementJewelPalette, AchievementMetalPalette {
  group: AchievementGroup;
  family: AchievementFamily;
  tier: AchievementTier;
  icon: string;
  /** 仅授予项目内最难、最有身份感的少数成就。 */
  apex: boolean;
}

const JEWEL_PALETTES: Record<AchievementFamily, AchievementJewelPalette> = {
  checkin: {
    accent: '#ef5b35',
    secondary: '#ff9a5a',
    deep: '#7f1727',
    highlight: '#fff0d9',
  },
  bookmark: {
    accent: '#4668f2',
    secondary: '#8ea6ff',
    deep: '#182b87',
    highlight: '#edf2ff',
  },
  note: {
    accent: '#8b5cf6',
    secondary: '#c4a7ff',
    deep: '#43168b',
    highlight: '#f7efff',
  },
  file: {
    accent: '#1696d2',
    secondary: '#70d3ff',
    deep: '#07547d',
    highlight: '#e8f9ff',
  },
  todo: {
    accent: '#18a573',
    secondary: '#65e1ad',
    deep: '#07583f',
    highlight: '#e8fff5',
  },
  organize: {
    accent: '#08a8a5',
    secondary: '#5ce1d5',
    deep: '#075f63',
    highlight: '#e6fffb',
  },
  level: {
    accent: '#e34f9d',
    secondary: '#ff9dcc',
    deep: '#85134f',
    highlight: '#fff0f8',
  },
  tenure: {
    accent: '#62a92f',
    secondary: '#b2dc59',
    deep: '#315f16',
    highlight: '#f4ffd9',
  },
};

const METAL_PALETTES: Record<AchievementTier, AchievementMetalPalette> = {
  1: {
    rarity: 'starter',
    metalDeep: '#542b1f',
    metalDark: '#80462d',
    metalMid: '#b86e42',
    metalBright: '#e4a475',
    metalHighlight: '#ffd8b5',
    metalWhite: '#fff1df',
    metalGlow: 'rgba(184, 110, 66, 0.28)',
    surface: '#fff7f1',
    nightSurface: '#33241f',
    border: '#d4a17d',
    shadow: 'rgba(105, 55, 35, 0.24)',
  },
  2: {
    rarity: 'platinum',
    metalDeep: '#273143',
    metalDark: '#536176',
    metalMid: '#93a1b5',
    metalBright: '#dbe5f0',
    metalHighlight: '#f6fbff',
    metalWhite: '#ffffff',
    metalGlow: 'rgba(192, 210, 232, 0.38)',
    surface: '#f7f9fc',
    nightSurface: '#252b35',
    border: '#b9c7d8',
    shadow: 'rgba(63, 78, 98, 0.26)',
  },
  3: {
    rarity: 'gilded',
    metalDeep: '#68420e',
    metalDark: '#946313',
    metalMid: '#d9a227',
    metalBright: '#ffd96a',
    metalHighlight: '#fff2b5',
    metalWhite: '#fffdf0',
    metalGlow: 'rgba(238, 178, 43, 0.44)',
    surface: '#fff9e8',
    nightSurface: '#352d1c',
    border: '#edc356',
    shadow: 'rgba(167, 106, 12, 0.3)',
  },
  4: {
    rarity: 'legendary',
    metalDeep: '#713700',
    metalDark: '#9d5800',
    metalMid: '#f2aa00',
    metalBright: '#ffdc3f',
    metalHighlight: '#fff08b',
    metalWhite: '#fffde2',
    metalGlow: 'rgba(255, 186, 0, 0.58)',
    surface: '#fff8d9',
    nightSurface: '#3a2d12',
    border: '#f6bd17',
    shadow: 'rgba(204, 125, 0, 0.4)',
  },
  5: {
    rarity: 'mythic',
    metalDeep: '#7a3100',
    metalDark: '#b05e00',
    metalMid: '#ffb800',
    metalBright: '#ffe44d',
    metalHighlight: '#fff5a6',
    metalWhite: '#fffff4',
    metalGlow: 'rgba(255, 204, 25, 0.72)',
    surface: '#fff7cb',
    nightSurface: '#402f0e',
    border: '#ffd21f',
    shadow: 'rgba(216, 137, 0, 0.52)',
  },
};

function visual(
  group: AchievementGroup,
  family: AchievementFamily,
  tier: AchievementTier,
  iconSource: string,
  options: { apex?: boolean } = {},
): AchievementVisual {
  return {
    group,
    family,
    tier,
    icon: iconSource,
    apex: Boolean(options.apex),
    ...JEWEL_PALETTES[family],
    ...METAL_PALETTES[tier],
  };
}

/** 与后端成就 key 一一对应；图形、宝石家族、稀有度和顶级身份由此统一供成长页与社区名片消费。 */
export const ACHIEVEMENT_VISUALS = {
  streak_1: visual('checkin', 'checkin', 1, icon.growth.achievement.streak_1),
  streak_7: visual('checkin', 'checkin', 2, icon.growth.achievement.streak_7),
  streak_30: visual('checkin', 'checkin', 3, icon.growth.achievement.streak_30),
  streak_100: visual('checkin', 'checkin', 4, icon.growth.achievement.streak_100),
  streak_365: visual('checkin', 'checkin', 5, icon.growth.achievement.streak_365, { apex: true }),
  checkin_50: visual('checkin', 'checkin', 2, icon.growth.achievement.checkin_50),
  checkin_100: visual('checkin', 'checkin', 3, icon.growth.achievement.checkin_100),
  bookmark_10: visual('create', 'bookmark', 1, icon.growth.achievement.bookmark_10),
  bookmark_20: visual('create', 'bookmark', 1, icon.growth.achievement.bookmark_20),
  bookmark_50: visual('create', 'bookmark', 2, icon.growth.achievement.bookmark_50),
  bookmark_200: visual('create', 'bookmark', 3, icon.growth.achievement.bookmark_200),
  bookmark_500: visual('create', 'bookmark', 5, icon.growth.achievement.bookmark_500),
  note_10: visual('create', 'note', 1, icon.growth.achievement.note_10),
  note_20: visual('create', 'note', 2, icon.growth.achievement.note_20),
  note_30: visual('create', 'note', 2, icon.growth.achievement.note_30),
  note_50: visual('create', 'note', 3, icon.growth.achievement.note_50),
  note_200: visual('create', 'note', 4, icon.growth.achievement.note_200),
  note_500: visual('create', 'note', 5, icon.growth.achievement.note_500),
  file_5: visual('create', 'file', 1, icon.growth.achievement.file_5),
  file_10: visual('create', 'file', 1, icon.growth.achievement.file_10),
  file_30: visual('create', 'file', 2, icon.growth.achievement.file_30),
  file_50: visual('create', 'file', 2, icon.growth.achievement.file_50),
  file_200: visual('create', 'file', 4, icon.growth.achievement.file_200),
  file_500: visual('create', 'file', 5, icon.growth.achievement.file_500),
  todo_20: visual('action', 'todo', 1, icon.growth.achievement.todo_20),
  todo_100: visual('action', 'todo', 2, icon.growth.achievement.todo_100),
  todo_500: visual('action', 'todo', 4, icon.growth.achievement.todo_500),
  todo_1000: visual('action', 'todo', 5, icon.growth.achievement.todo_1000),
  organize_20: visual('organize', 'organize', 1, icon.growth.achievement.organize_20),
  organize_100: visual('organize', 'organize', 2, icon.growth.achievement.organize_100),
  organize_500: visual('organize', 'organize', 4, icon.growth.achievement.organize_500),
  organize_1000: visual('organize', 'organize', 5, icon.growth.achievement.organize_1000),
  level_5: visual('level', 'level', 2, icon.growth.achievement.level_5),
  level_10: visual('level', 'level', 4, icon.growth.achievement.level_10),
  level_15: visual('level', 'level', 5, icon.growth.achievement.level_15, { apex: true }),
  join_7: visual('tenure', 'tenure', 1, icon.growth.achievement.join_7),
  join_30: visual('tenure', 'tenure', 2, icon.growth.achievement.join_30),
  join_100: visual('tenure', 'tenure', 4, icon.growth.achievement.join_100),
  join_365: visual('tenure', 'tenure', 5, icon.growth.achievement.join_365),
} as const satisfies Record<string, AchievementVisual>;

export type AchievementKey = keyof typeof ACHIEVEMENT_VISUALS;
export const ACHIEVEMENT_KEYS = Object.keys(ACHIEVEMENT_VISUALS) as AchievementKey[];

const GROUP_FALLBACK_FAMILY: Record<AchievementGroup, AchievementFamily> = {
  checkin: 'checkin',
  create: 'note',
  action: 'todo',
  organize: 'organize',
  level: 'level',
  tenure: 'tenure',
};

const GROUP_FALLBACK_ICON: Record<AchievementGroup, string> = {
  checkin: icon.growth.checkin,
  create: icon.growth.create,
  action: icon.growth.action,
  organize: icon.growth.organize,
  level: icon.growth.level,
  tenure: icon.growth.tenure,
};

function knownGroup(group?: string): AchievementGroup {
  return ACHIEVEMENT_GROUPS.includes(group as AchievementGroup) ? (group as AchievementGroup) : 'level';
}

export function achievementVisualFor(key: string, group?: string): AchievementVisual {
  const mapped = ACHIEVEMENT_VISUALS[key as AchievementKey];
  if (mapped) return mapped;
  const fallbackGroup = knownGroup(group);
  const family = GROUP_FALLBACK_FAMILY[fallbackGroup];
  return visual(fallbackGroup, family, 1, GROUP_FALLBACK_ICON[fallbackGroup]);
}

export function achievementVisualStyle(key: string, group?: string): Record<string, string> {
  const item = achievementVisualFor(key, group);
  return {
    '--achievement-accent': item.accent,
    '--achievement-secondary': item.secondary,
    '--achievement-deep': item.deep,
    '--achievement-highlight': item.highlight,
    '--achievement-metal-deep': item.metalDeep,
    '--achievement-metal-dark': item.metalDark,
    '--achievement-metal-mid': item.metalMid,
    '--achievement-metal-bright': item.metalBright,
    '--achievement-metal-highlight': item.metalHighlight,
    '--achievement-metal-white': item.metalWhite,
    '--achievement-metal-glow': item.metalGlow,
    '--achievement-surface': item.surface,
    '--achievement-night-surface': item.nightSurface,
    '--achievement-border': item.border,
    '--achievement-shadow': item.shadow,
  };
}
