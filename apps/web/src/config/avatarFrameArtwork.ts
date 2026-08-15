import frameAurora from '@/assets/avatar-frames/frame_aurora_v2.webp';
import frameBookmarkArchive from '@/assets/avatar-frames/frame_bookmark_archive.webp';
import frameBookmarkSeed from '@/assets/avatar-frames/frame_bookmark_seed.webp';
import frameCelestial from '@/assets/avatar-frames/frame_celestial_base_v2.webp';
import frameCelestialWings from '@/assets/avatar-frames/frame_celestial_wings_v3.webp';
import frameDragonBase from '@/assets/avatar-frames/frame_dragon_base_v2.webp';
import frameDragonBody from '@/assets/avatar-frames/frame_dragon_body_v2.webp';
import frameDragonCloudFlame from '@/assets/avatar-frames/frame_dragon_cloud_flame_v2.webp';
import frameDragonPearl from '@/assets/avatar-frames/frame_dragon_pearl_v2.webp';
import frameDragonTrails from '@/assets/avatar-frames/frame_dragon_trails_v5.webp';
import frameFileConstellation from '@/assets/avatar-frames/frame_file_constellation.webp';
import frameFileSeed from '@/assets/avatar-frames/frame_file_seed.webp';
import frameFileVault from '@/assets/avatar-frames/frame_file_vault.webp';
import frameFirstLight from '@/assets/avatar-frames/frame_first_light.webp';
import frameFlame from '@/assets/avatar-frames/frame_flame_v2.webp';
import frameGalaxy from '@/assets/avatar-frames/frame_galaxy_v2.webp';
import frameGold from '@/assets/avatar-frames/frame_gold.webp';
import frameInk from '@/assets/avatar-frames/frame_ink.webp';
import frameMint from '@/assets/avatar-frames/frame_mint.webp';
import frameMoonstone from '@/assets/avatar-frames/frame_moonstone.webp';
import frameNeon from '@/assets/avatar-frames/frame_neon_v2.webp';
import frameNoteConstellation from '@/assets/avatar-frames/frame_note_constellation.webp';
import frameNoteMasterpiece from '@/assets/avatar-frames/frame_note_masterpiece.webp';
import frameNoteSeed from '@/assets/avatar-frames/frame_note_seed.webp';
import frameOcean from '@/assets/avatar-frames/frame_ocean.webp';
import frameSakura from '@/assets/avatar-frames/frame_sakura.webp';
import frameStreakEternal from '@/assets/avatar-frames/frame_streak_eternal_base_v3.webp';
import frameStreakEternalMotion from '@/assets/avatar-frames/frame_streak_eternal_motion_v3.webp';
import frameStreakEternalRabbitSprite from '@/assets/avatar-frames/frame_streak_eternal_rabbit_sprite_v1.webp';
import frameStreakMonth from '@/assets/avatar-frames/frame_streak_month.webp';
import frameStreakSeed from '@/assets/avatar-frames/frame_streak_seed.webp';
import frameSunset from '@/assets/avatar-frames/frame_sunset.webp';
import type { FrameVariant } from '@/config/growthFrames';

export type AvatarFrameMotionTier = 'static' | 'advanced' | 'colorful' | 'legendary' | 'ceiling';

export interface AvatarFrameArtwork {
  src: string;
  /** 仅供真实主题部件动画使用的透明分层素材。 */
  motionSrc?: string;
  /** 与主体分离的环境效果层，例如祥云、火焰与水纹。 */
  effectSrc?: string;
  /** 与主体分离的细线轨迹层，例如龙曜的焰须、游丝与底部弧光。 */
  trailSrc?: string;
  /** 与主体分离的高价值焦点物件，例如龙珠、宝石与星核。 */
  accentSrc?: string;
  /** 同一运动主体的逐姿态透明精灵表；当前统一为 4 × 4、16 帧。 */
  motionSpriteSrc?: string;
  /** 64px 头像设计基准下的透明素材盒尺寸。 */
  artSize: number;
  /** 主题主体的目标视觉外径，同时作为布局预留尺寸。 */
  outerSize: number;
  accent: string;
  glow: string;
  motion: AvatarFrameMotionTier;
}

// 素材盒尺寸根据每张透明图的有效像素边界单独校准，不能把生成素材压成紧贴头像的一圈细边。
// outerSize 按真实视觉外径递进；artSize 只抵消每张透明素材不同的留白，不能拿素材盒尺寸冒充稀有度。
// 当前阶梯：成就基础 86、成就进阶/积分基础 90、成就炫彩 96、积分进阶 98~102、积分炫彩 104~108、传说 110~124。
// static 严格不启用自动动效；advanced 以上按规范逐级增加动效通道。
export const AVATAR_FRAME_ARTWORK = {
  mint: {
    src: frameMint,
    artSize: 103,
    outerSize: 90,
    accent: '#70e7d0',
    glow: 'rgba(45, 212, 191, 0.34)',
    motion: 'static',
  },
  ink: {
    src: frameInk,
    artSize: 104,
    outerSize: 90,
    accent: '#aeb8ba',
    glow: 'rgba(71, 85, 105, 0.22)',
    motion: 'static',
  },
  moonstone: {
    src: frameMoonstone,
    artSize: 103,
    outerSize: 90,
    accent: '#d9e7ff',
    glow: 'rgba(147, 197, 253, 0.3)',
    motion: 'static',
  },
  'first-light': {
    src: frameFirstLight,
    artSize: 103,
    outerSize: 86,
    accent: '#f8d68a',
    glow: 'rgba(251, 191, 36, 0.22)',
    motion: 'static',
  },
  'note-seed': {
    src: frameNoteSeed,
    artSize: 100,
    outerSize: 86,
    accent: '#8ed5c7',
    glow: 'rgba(45, 212, 191, 0.2)',
    motion: 'static',
  },
  'streak-seed': {
    src: frameStreakSeed,
    artSize: 118,
    outerSize: 90,
    accent: '#f7d889',
    glow: 'rgba(251, 191, 36, 0.2)',
    motion: 'static',
  },
  'bookmark-seed': {
    src: frameBookmarkSeed,
    artSize: 114,
    outerSize: 90,
    accent: '#b39cff',
    glow: 'rgba(139, 92, 246, 0.22)',
    motion: 'static',
  },
  'file-seed': {
    src: frameFileSeed,
    artSize: 105,
    outerSize: 90,
    accent: '#9ee7f4',
    glow: 'rgba(34, 211, 238, 0.2)',
    motion: 'static',
  },
  gold: {
    src: frameGold,
    artSize: 108,
    outerSize: 98,
    accent: '#ffd66b',
    glow: 'rgba(245, 158, 11, 0.44)',
    motion: 'advanced',
  },
  sakura: {
    src: frameSakura,
    artSize: 105,
    outerSize: 100,
    accent: '#ffb2ca',
    glow: 'rgba(244, 114, 182, 0.42)',
    motion: 'advanced',
  },
  sunset: {
    src: frameSunset,
    artSize: 107,
    outerSize: 102,
    accent: '#ffad91',
    glow: 'rgba(251, 113, 133, 0.4)',
    motion: 'advanced',
  },
  'streak-month': {
    src: frameStreakMonth,
    artSize: 110,
    outerSize: 96,
    accent: '#b9caff',
    glow: 'rgba(129, 140, 248, 0.42)',
    motion: 'colorful',
  },
  'note-masterpiece': {
    src: frameNoteMasterpiece,
    artSize: 115,
    outerSize: 96,
    accent: '#72e6d2',
    glow: 'rgba(20, 184, 166, 0.42)',
    motion: 'colorful',
  },
  'file-vault': {
    src: frameFileVault,
    artSize: 105,
    outerSize: 96,
    accent: '#6f8cff',
    glow: 'rgba(59, 130, 246, 0.5)',
    motion: 'colorful',
  },
  ocean: {
    src: frameOcean,
    artSize: 116,
    outerSize: 104,
    accent: '#62d9ff',
    glow: 'rgba(14, 165, 233, 0.54)',
    motion: 'colorful',
  },
  aurora: {
    src: frameAurora,
    artSize: 118,
    outerSize: 106,
    accent: '#9ff8ff',
    glow: 'rgba(129, 92, 246, 0.56)',
    motion: 'colorful',
  },
  flame: {
    src: frameFlame,
    artSize: 120,
    outerSize: 108,
    accent: '#ffbc54',
    glow: 'rgba(249, 80, 28, 0.6)',
    motion: 'colorful',
  },
  neon: {
    src: frameNeon,
    artSize: 124,
    outerSize: 110,
    accent: '#69f4ff',
    glow: 'rgba(168, 85, 247, 0.62)',
    motion: 'legendary',
  },
  galaxy: {
    src: frameGalaxy,
    artSize: 130,
    outerSize: 114,
    accent: '#d8b4fe',
    glow: 'rgba(124, 58, 237, 0.62)',
    motion: 'legendary',
  },
  dragon: {
    src: frameDragonBase,
    motionSrc: frameDragonBody,
    effectSrc: frameDragonCloudFlame,
    trailSrc: frameDragonTrails,
    accentSrc: frameDragonPearl,
    artSize: 132,
    outerSize: 118,
    accent: '#ffd56a',
    glow: 'rgba(245, 158, 11, 0.66)',
    motion: 'legendary',
  },
  celestial: {
    src: frameCelestial,
    motionSrc: frameCelestialWings,
    artSize: 132,
    outerSize: 124,
    accent: '#c5c9ff',
    glow: 'rgba(99, 102, 241, 0.7)',
    motion: 'ceiling',
  },
  'bookmark-archive': {
    src: frameBookmarkArchive,
    artSize: 128,
    outerSize: 116,
    accent: '#d8b4fe',
    glow: 'rgba(139, 92, 246, 0.56)',
    motion: 'legendary',
  },
  'note-constellation': {
    src: frameNoteConstellation,
    artSize: 127,
    outerSize: 116,
    accent: '#8bf0dc',
    glow: 'rgba(13, 148, 136, 0.56)',
    motion: 'legendary',
  },
  'file-constellation': {
    src: frameFileConstellation,
    artSize: 125,
    outerSize: 116,
    accent: '#b9d9ff',
    glow: 'rgba(59, 130, 246, 0.58)',
    motion: 'legendary',
  },
  'streak-eternal': {
    src: frameStreakEternal,
    motionSrc: frameStreakEternalMotion,
    motionSpriteSrc: frameStreakEternalRabbitSprite,
    artSize: 132,
    outerSize: 124,
    accent: '#ffe29a',
    glow: 'rgba(245, 158, 11, 0.7)',
    motion: 'ceiling',
  },
} as const satisfies Record<FrameVariant, AvatarFrameArtwork>;

export function avatarFrameArtwork(variant?: FrameVariant | null): AvatarFrameArtwork | null {
  return variant ? AVATAR_FRAME_ARTWORK[variant] : null;
}
