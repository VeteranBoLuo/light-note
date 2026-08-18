import frameAuroraCrystal from '@/assets/avatar-frames/frame_aurora_crystal_v1.webp';
import frameAuroraFlowLeft from '@/assets/avatar-frames/frame_aurora_flow_left_v1.webp';
import frameAuroraFlowRight from '@/assets/avatar-frames/frame_aurora_flow_right_v1.webp';
import frameAurora from '@/assets/avatar-frames/frame_aurora_v3.webp';
import frameBookmarkArchive from '@/assets/avatar-frames/frame_bookmark_archive_v2.webp';
import frameBookmarkCorridor from '@/assets/avatar-frames/frame_bookmark_corridor_v1.webp';
import frameBookmarkIntro from '@/assets/avatar-frames/frame_bookmark_intro_v2.webp';
import frameBookmarkSeed from '@/assets/avatar-frames/frame_bookmark_seed_v4.webp';
import frameCelestialBase from '@/assets/avatar-frames/frame_celestial_base_v4.webp';
import frameCelestialWingLeft from '@/assets/avatar-frames/frame_celestial_wing_left_v1.webp';
import frameCelestialWingRight from '@/assets/avatar-frames/frame_celestial_wing_right_v1.webp';
import frameDragon from '@/assets/avatar-frames/frame_dragon_v4.webp';
import frameDragonTrails from '@/assets/avatar-frames/frame_dragon_trails_v6.webp';
import frameFileConstellation from '@/assets/avatar-frames/frame_file_constellation_v2.webp';
import frameFileIntro from '@/assets/avatar-frames/frame_file_intro_v2.webp';
import frameFileSeed from '@/assets/avatar-frames/frame_file_seed_v4.webp';
import frameFileVault from '@/assets/avatar-frames/frame_file_vault_v2.webp';
import frameFirstLight from '@/assets/avatar-frames/frame_first_light_v3.webp';
import frameFlameEffect from '@/assets/avatar-frames/frame_flame_effect_v4.webp';
import frameFlameEmbers from '@/assets/avatar-frames/frame_flame_embers_v3.webp';
import frameFlameParticleCurl from '@/assets/avatar-frames/frame_flame_particle_curl_v3.webp';
import frameFlameParticleSlender from '@/assets/avatar-frames/frame_flame_particle_slender_v1.webp';
import frameFlameParticleTall from '@/assets/avatar-frames/frame_flame_particle_tall_v1.webp';
import frameFlame from '@/assets/avatar-frames/frame_flame_v7.webp';
import frameGalaxy from '@/assets/avatar-frames/frame_galaxy_v3.webp';
import frameGoldGem from '@/assets/avatar-frames/frame_gold_gem_v2.webp';
import frameGold from '@/assets/avatar-frames/frame_gold_v5.webp';
import frameInk from '@/assets/avatar-frames/frame_ink_v2.webp';
import frameMint from '@/assets/avatar-frames/frame_mint_v3.webp';
import frameMoonstone from '@/assets/avatar-frames/frame_moonstone_v5.webp';
import frameNeon from '@/assets/avatar-frames/frame_neon_v3.webp';
import frameNoteConstellation from '@/assets/avatar-frames/frame_note_constellation_v2.webp';
import frameNoteFlow from '@/assets/avatar-frames/frame_note_flow_v2.webp';
import frameNoteMasterpiece from '@/assets/avatar-frames/frame_note_masterpiece_v2.webp';
import frameNoteSeed from '@/assets/avatar-frames/frame_note_seed_v4.webp';
import frameOceanCurrentLeft from '@/assets/avatar-frames/frame_ocean_current_left_v1.webp';
import frameOceanCurrentRight from '@/assets/avatar-frames/frame_ocean_current_right_v1.webp';
import frameOcean from '@/assets/avatar-frames/frame_ocean_v2.webp';
import frameSakura from '@/assets/avatar-frames/frame_sakura_v6.webp';
import frameStreakEternalBase from '@/assets/avatar-frames/frame_streak_eternal_base_v5.webp';
import frameStreakEternalWingSpring from '@/assets/avatar-frames/frame_streak_eternal_wing_spring_v1.webp';
import frameStreakEternalWingAutumn from '@/assets/avatar-frames/frame_streak_eternal_wing_autumn_v1.webp';
import frameStreakEternalWingWinter from '@/assets/avatar-frames/frame_streak_eternal_wing_winter_v1.webp';
import frameStreakMonth from '@/assets/avatar-frames/frame_streak_month_v2.webp';
import frameStreakSeed from '@/assets/avatar-frames/frame_streak_seed_v5.webp';
import frameSunsetCloudLeft from '@/assets/avatar-frames/frame_sunset_cloud_left_v1.webp';
import frameSunsetCloudRight from '@/assets/avatar-frames/frame_sunset_cloud_right_v1.webp';
import frameSunset from '@/assets/avatar-frames/frame_sunset_v9.webp';
import type { FrameVariant } from '@/config/growthFrames';

export type AvatarFrameMotionTier = 'static' | 'advanced' | 'colorful' | 'legendary' | 'ceiling';

export interface AvatarFrameArtwork {
  src: string;
  /** 中央开孔已完整透明、且必须始终压在头像上方的稳定框体。 */
  foregroundShell?: boolean;
  /** 仅供真实主题部件动画使用的透明分层素材。 */
  motionSrc?: string;
  /** 与主体分离的环境效果层，例如祥云、火焰与水纹。 */
  effectSrc?: string;
  /** 与主体分离的细线轨迹层(龙曜焰须),或多翼主题的第三运动层(岁序冬翼)。 */
  trailSrc?: string;
  /** 来自原画的独立微粒精灵；用于火种等“出现—成长—消散”的局部生命周期。 */
  particleSrcs?: string[];
  /** 与主体分离的高价值焦点物件，例如龙珠、宝石与星核。 */
  accentSrc?: string;
  /** 同一运动主体的逐姿态透明精灵表；当前统一为 4 × 4、16 帧。 */
  motionSpriteSrc?: string;
  /** 64px 头像设计基准下的透明素材盒尺寸。 */
  artSize: number;
  /** 只用于内沿同源材质层的素材盒尺寸；逐款标定为 64px 中央头像孔。 */
  innerArtSize: number;
  /** 主题主体的目标视觉外径，同时作为布局预留尺寸。 */
  outerSize: number;
  accent: string;
  glow: string;
  motion: AvatarFrameMotionTier;
}

// 素材盒尺寸根据每张透明图的有效像素边界单独校准，不能把生成素材压成紧贴头像的一圈细边。
// outerSize 按真实视觉外径递进；artSize 只抵消每张透明素材不同的留白，不能拿素材盒尺寸冒充稀有度。
// innerArtSize 取各方向内沿 Alpha 半径的最大值反推，保证圆周任一方向都不会在 32px 头像边缘外留下空缝。
// 当前阶梯：成就基础 86、成就进阶/积分基础 90、成就炫彩 96、积分进阶 98~102、积分炫彩 104~108、传说 110~124。
// static 严格不启用自动动效；advanced 以上按规范逐级增加动效通道。
export const AVATAR_FRAME_ARTWORK = {
  mint: {
    src: frameMint,
    artSize: 116,
    innerArtSize: 116,
    outerSize: 90,
    accent: '#70e7d0',
    glow: 'rgba(45, 212, 191, 0.34)',
    motion: 'static',
  },
  ink: {
    src: frameInk,
    artSize: 109,
    innerArtSize: 109,
    outerSize: 90,
    accent: '#aeb8ba',
    glow: 'rgba(71, 85, 105, 0.22)',
    motion: 'static',
  },
  moonstone: {
    src: frameMoonstone,
    artSize: 114,
    innerArtSize: 114,
    outerSize: 90,
    accent: '#d9e7ff',
    glow: 'rgba(147, 197, 253, 0.3)',
    motion: 'static',
  },
  'first-light': {
    src: frameFirstLight,
    // 直接裁取初光原型；100px 时中央开孔与 64px 头像严丝合缝，日轮不再被二次补片。
    artSize: 100,
    innerArtSize: 100,
    outerSize: 86,
    accent: '#f8d68a',
    glow: 'rgba(251, 191, 36, 0.22)',
    motion: 'static',
  },
  'note-seed': {
    src: frameNoteSeed,
    // 与书签初识、云匣初识共用同一头像孔标尺；直接裁取轻量绿幕原型，不重绘纸张与画笔。
    artSize: 101,
    innerArtSize: 101,
    outerSize: 86,
    accent: '#8ed5c7',
    glow: 'rgba(45, 212, 191, 0.2)',
    motion: 'static',
  },
  'bookmark-intro': {
    src: frameBookmarkIntro,
    // 基础免费档直接裁取轻量绿幕原型，保留星签、双星与底部相扣书签。
    artSize: 101,
    innerArtSize: 101,
    outerSize: 86,
    accent: '#b8a6ef',
    glow: 'rgba(139, 92, 246, 0.18)',
    motion: 'static',
  },
  'file-intro': {
    src: frameFileIntro,
    // 与另外两款基础免费框按同一头像孔中心和直径标定，文件卡片不参与额外缩放。
    artSize: 101,
    innerArtSize: 101,
    outerSize: 86,
    accent: '#9fc8ed',
    glow: 'rgba(96, 165, 250, 0.18)',
    motion: 'static',
  },
  'streak-seed': {
    src: frameStreakSeed,
    // 直接裁取轻量版静态原型；太阳、云朵、双环和底部宝石共享唯一画布。
    artSize: 118,
    innerArtSize: 99,
    outerSize: 90,
    accent: '#f7d889',
    glow: 'rgba(251, 191, 36, 0.2)',
    motion: 'static',
  },
  'bookmark-seed': {
    src: frameBookmarkSeed,
    // 直接裁取轻量版书页初藏原型，星签、链接卡片与底部宝石不做二次简化。
    artSize: 114,
    innerArtSize: 114,
    outerSize: 90,
    accent: '#b39cff',
    glow: 'rgba(139, 92, 246, 0.22)',
    motion: 'static',
  },
  'note-flow': {
    src: frameNoteFlow,
    // 画纸上的原字与印章来自轻量版原型像素，禁止重新生成或替换文字。
    artSize: 118,
    innerArtSize: 118,
    outerSize: 90,
    accent: '#69c7bd',
    glow: 'rgba(20, 184, 166, 0.2)',
    motion: 'static',
  },
  'file-seed': {
    src: frameFileSeed,
    // 直接按 1:1 画布裁取设计原图；105px 时中央开孔与 64px 头像对齐，锁匣、祥云与宝石不再二次重绘。
    artSize: 105,
    innerArtSize: 105,
    outerSize: 90,
    accent: '#9ee7f4',
    glow: 'rgba(34, 211, 238, 0.2)',
    motion: 'static',
  },
  gold: {
    src: frameGold,
    accentSrc: frameGoldGem,
    artSize: 108,
    innerArtSize: 102,
    outerSize: 98,
    accent: '#ffd66b',
    glow: 'rgba(245, 158, 11, 0.44)',
    motion: 'advanced',
  },
  sakura: {
    src: frameSakura,
    artSize: 108,
    innerArtSize: 83,
    outerSize: 100,
    accent: '#ffb2ca',
    glow: 'rgba(244, 114, 182, 0.42)',
    motion: 'advanced',
  },
  sunset: {
    src: frameSunset,
    motionSrc: frameSunsetCloudLeft,
    effectSrc: frameSunsetCloudRight,
    artSize: 108,
    innerArtSize: 85,
    outerSize: 102,
    accent: '#ffad91',
    glow: 'rgba(251, 113, 133, 0.4)',
    motion: 'advanced',
  },
  'streak-month': {
    src: frameStreakMonth,
    foregroundShell: true,
    // 原型月轮、满月、月相与云浪共用一个透明画布；头像孔固定，只有同源月光层改变亮度。
    artSize: 116,
    innerArtSize: 116,
    outerSize: 102,
    accent: '#b9caff',
    glow: 'rgba(129, 140, 248, 0.42)',
    motion: 'colorful',
  },
  'note-masterpiece': {
    src: frameNoteMasterpiece,
    foregroundShell: true,
    // 直接裁取文心长河原型，竹简、画笔、流波与金属环不参与位移。
    artSize: 116,
    innerArtSize: 116,
    outerSize: 102,
    accent: '#72e6d2',
    glow: 'rgba(20, 184, 166, 0.42)',
    motion: 'colorful',
  },
  'file-vault': {
    src: frameFileVault,
    foregroundShell: true,
    // 门楼、文件卡片和云海保持原型像素对齐，动态仅作用于门光、云光与数据星点。
    artSize: 116,
    innerArtSize: 116,
    outerSize: 102,
    accent: '#6f8cff',
    glow: 'rgba(59, 130, 246, 0.5)',
    motion: 'colorful',
  },
  'bookmark-corridor': {
    src: frameBookmarkCorridor,
    foregroundShell: true,
    // 新增书签 200 成就框；星页、书架和门廊全部固定，只驱动门光与少量书签微光。
    artSize: 116,
    innerArtSize: 116,
    outerSize: 102,
    accent: '#b8a7ff',
    glow: 'rgba(139, 92, 246, 0.42)',
    motion: 'colorful',
  },
  ocean: {
    src: frameOcean,
    foregroundShell: true,
    motionSrc: frameOceanCurrentLeft,
    effectSrc: frameOceanCurrentRight,
    artSize: 102,
    innerArtSize: 102,
    outerSize: 104,
    accent: '#62d9ff',
    glow: 'rgba(14, 165, 233, 0.54)',
    motion: 'colorful',
  },
  aurora: {
    src: frameAurora,
    foregroundShell: true,
    motionSrc: frameAuroraFlowLeft,
    effectSrc: frameAuroraFlowRight,
    accentSrc: frameAuroraCrystal,
    // 直接裁取用户绿幕原型；左右极光材质与上下晶核均保留同一 384px 画布锚点。
    artSize: 120,
    innerArtSize: 120,
    outerSize: 106,
    accent: '#9ff8ff',
    glow: 'rgba(129, 92, 246, 0.56)',
    motion: 'colorful',
  },
  flame: {
    src: frameFlame,
    foregroundShell: true,
    // 固定主体直接裁取用户原稿；动效、火星与火丝继续沿用既有独立图层。
    effectSrc: frameFlameEffect,
    trailSrc: frameFlameEmbers,
    particleSrcs: [frameFlameParticleTall, frameFlameParticleSlender, frameFlameParticleCurl],
    artSize: 128,
    innerArtSize: 133,
    outerSize: 108,
    accent: '#ffbc54',
    glow: 'rgba(249, 80, 28, 0.56)',
    motion: 'colorful',
  },
  // 八款传说框全部直接裁取用户绿幕原型:主体、内圈与身份件共用一张素材,孔心居中、外径按档位阶梯标定。
  // 主体作为前景实体框压在头像上方,龙头、菱镜等跨沿身份件不再被头像遮挡。
  // 需要真实开合/浮动的对象(天穹双翼等)登记同源分层 motionSrc/effectSrc:
  // 底图挖除运动对象并保持环体像素零改动,运动层只含该对象、切割边软渐隐,
  // 并向被环/冠遮挡的方向补同色垫肩,再以连接主体处为锚点小幅运动,避免残留静态双影或露背景缝。
  neon: {
    src: frameNeon,
    foregroundShell: true,
    artSize: 116,
    innerArtSize: 116,
    outerSize: 110,
    accent: '#72f2ff',
    glow: 'rgba(216, 74, 240, 0.56)',
    motion: 'legendary',
  },
  galaxy: {
    src: frameGalaxy,
    foregroundShell: true,
    artSize: 124,
    innerArtSize: 124,
    outerSize: 116,
    accent: '#d0b6ff',
    glow: 'rgba(99, 68, 245, 0.56)',
    motion: 'legendary',
  },
  dragon: {
    src: frameDragon,
    foregroundShell: true,
    // 从 v4 原画同画布提取的红金焰须与鳞片高光；只做遮罩/亮度动画，龙身和圆环结构始终固定。
    trailSrc: frameDragonTrails,
    artSize: 125,
    innerArtSize: 125,
    outerSize: 118,
    accent: '#ffd56a',
    glow: 'rgba(244, 138, 20, 0.56)',
    motion: 'legendary',
  },
  celestial: {
    src: frameCelestialBase,
    foregroundShell: true,
    // 原型为宽翼环形,素材零变形;137 为桌面个人中心入口留白反推的上限,环内沿按原型轻抱头像。
    // 双翼从 v4 原画同画布分层:底图保留翼根带(r114~136 径向向外渐隐)作固定腋羽,
    // 翼层在同带内互补渐隐、底冠交界带 8px 渐隐垫肩;开合旋转时由底图翼根兜底,
    // 不露背景缝也不产生双影;翼层压在环体下方,以翼根为锚点向外开合。
    motionSrc: frameCelestialWingLeft,
    effectSrc: frameCelestialWingRight,
    artSize: 137,
    innerArtSize: 137,
    outerSize: 124,
    accent: '#d4d6ff',
    glow: 'rgba(126, 110, 248, 0.56)',
    motion: 'ceiling',
  },
  'bookmark-archive': {
    src: frameBookmarkArchive,
    foregroundShell: true,
    artSize: 128,
    innerArtSize: 128,
    outerSize: 116,
    accent: '#9fc5ff',
    glow: 'rgba(83, 118, 245, 0.56)',
    motion: 'legendary',
  },
  'note-constellation': {
    src: frameNoteConstellation,
    foregroundShell: true,
    artSize: 127,
    innerArtSize: 127,
    outerSize: 116,
    accent: '#9db8f0',
    glow: 'rgba(64, 98, 205, 0.56)',
    motion: 'legendary',
  },
  'file-constellation': {
    src: frameFileConstellation,
    foregroundShell: true,
    artSize: 128,
    innerArtSize: 128,
    outerSize: 116,
    accent: '#bcd8ff',
    glow: 'rgba(96, 149, 250, 0.56)',
    motion: 'legendary',
  },
  'streak-eternal': {
    src: frameStreakEternalBase,
    foregroundShell: true,
    // 三只不对称翼从 v5 原画同画布分层:motionSrc=左上春翼、effectSrc=右上秋翼、trailSrc=右下冬翼。
    // 翼根按多边形切割边做 16px 距离场交叉渐隐,底图保留翼根兜底;樱枝、枫叶、金藤等披挂留底,
    // 三翼以各自翼根为锚点错相轻扬(季节波浪),环体、星冠与底冠钻石像素零位移。
    motionSrc: frameStreakEternalWingSpring,
    effectSrc: frameStreakEternalWingAutumn,
    trailSrc: frameStreakEternalWingWinter,
    artSize: 137,
    innerArtSize: 137,
    outerSize: 124,
    accent: '#ffe29a',
    glow: 'rgba(245, 158, 11, 0.56)',
    motion: 'ceiling',
  },
} as const satisfies Record<FrameVariant, AvatarFrameArtwork>;

export function avatarFrameArtwork(variant?: FrameVariant | null): AvatarFrameArtwork | null {
  return variant ? AVATAR_FRAME_ARTWORK[variant] : null;
}
