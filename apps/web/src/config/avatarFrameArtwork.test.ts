import { describe, expect, it } from 'vitest';
import { AVATAR_FRAME_ARTWORK, type AvatarFrameArtwork } from './avatarFrameArtwork';
import { FRAME_VARIANTS } from './growthFrames';

describe('头像框成品素材目录', () => {
  it('完整覆盖 29 个视觉变体且每款使用独立素材', () => {
    const variants = Object.values(FRAME_VARIANTS);
    const artworkVariants = Object.keys(AVATAR_FRAME_ARTWORK);

    expect(new Set(artworkVariants)).toEqual(new Set(variants));
    expect(new Set(Object.values(AVATAR_FRAME_ARTWORK).map((item) => item.src)).size).toBe(29);
  });

  it('保持静态、动态与当前动效天花板的档位约束', () => {
    const variantsFor = (motion: (typeof AVATAR_FRAME_ARTWORK)[keyof typeof AVATAR_FRAME_ARTWORK]['motion']) =>
      Object.entries(AVATAR_FRAME_ARTWORK)
        .filter(([, item]) => item.motion === motion)
        .map(([variant]) => variant);

    expect(variantsFor('static')).toEqual([
      'mint',
      'ink',
      'moonstone',
      'first-light',
      'note-seed',
      'bookmark-intro',
      'file-intro',
      'streak-seed',
      'bookmark-seed',
      'note-flow',
      'file-seed',
    ]);
    expect(variantsFor('advanced')).toEqual(['gold', 'sakura', 'sunset']);
    expect(variantsFor('ceiling')).toEqual(['celestial', 'streak-eternal']);
    expect(Object.values(AVATAR_FRAME_ARTWORK).filter((item) => item.motion !== 'static')).toHaveLength(18);
    expect(Object.values(AVATAR_FRAME_ARTWORK).every((item) => item.artSize >= 100 && item.artSize <= 140)).toBe(true);
    expect(Object.values(AVATAR_FRAME_ARTWORK).every((item) => item.outerSize >= 86 && item.outerSize <= 124)).toBe(
      true,
    );
  });

  it('所有主题的贴边彩色阴影透明度不超过万卷星库基准', () => {
    const glowAlpha = (glow: string) => Number(glow.match(/,\s*([\d.]+)\)$/)?.[1]);
    const referenceAlpha = glowAlpha(AVATAR_FRAME_ARTWORK['bookmark-archive'].glow);
    const glowAlphas = Object.values(AVATAR_FRAME_ARTWORK).map((item) => glowAlpha(item.glow));

    expect(referenceAlpha).toBe(0.56);
    expect(glowAlphas.every((alpha) => Number.isFinite(alpha) && alpha <= referenceAlpha)).toBe(true);
  });

  it('用实际布局外径表达档位和传说价格阶梯', () => {
    expect(AVATAR_FRAME_ARTWORK.gold.artSize).toBe(108);
    expect(AVATAR_FRAME_ARTWORK.gold.outerSize).toBe(98);
    expect(AVATAR_FRAME_ARTWORK.gold.outerSize).toBeGreaterThan(AVATAR_FRAME_ARTWORK.moonstone.outerSize);
    for (const variant of ['streak-month', 'note-masterpiece', 'file-vault', 'bookmark-corridor'] as const) {
      expect(AVATAR_FRAME_ARTWORK[variant].outerSize).toBeGreaterThanOrEqual(AVATAR_FRAME_ARTWORK.gold.outerSize);
      expect(AVATAR_FRAME_ARTWORK[variant].outerSize).toBeLessThanOrEqual(AVATAR_FRAME_ARTWORK.sunset.outerSize);
    }
    expect(AVATAR_FRAME_ARTWORK.sakura.outerSize).toBeGreaterThan(AVATAR_FRAME_ARTWORK.gold.outerSize);
    expect(AVATAR_FRAME_ARTWORK.sunset.outerSize).toBeGreaterThan(AVATAR_FRAME_ARTWORK.sakura.outerSize);
    expect(AVATAR_FRAME_ARTWORK.ocean.outerSize).toBeGreaterThan(AVATAR_FRAME_ARTWORK.gold.outerSize);
    expect(AVATAR_FRAME_ARTWORK.aurora.outerSize).toBeGreaterThan(AVATAR_FRAME_ARTWORK.ocean.outerSize);
    expect(AVATAR_FRAME_ARTWORK.flame.outerSize).toBeGreaterThan(AVATAR_FRAME_ARTWORK.aurora.outerSize);
    expect(AVATAR_FRAME_ARTWORK.neon.outerSize).toBeGreaterThan(AVATAR_FRAME_ARTWORK.ocean.outerSize);
    expect(AVATAR_FRAME_ARTWORK.neon.outerSize).toBeGreaterThan(AVATAR_FRAME_ARTWORK.flame.outerSize);
    expect(AVATAR_FRAME_ARTWORK.galaxy.outerSize).toBeGreaterThan(AVATAR_FRAME_ARTWORK.neon.outerSize);
    expect(AVATAR_FRAME_ARTWORK.dragon.outerSize).toBeGreaterThan(AVATAR_FRAME_ARTWORK.galaxy.outerSize);
    expect(AVATAR_FRAME_ARTWORK.celestial.outerSize).toBeGreaterThan(AVATAR_FRAME_ARTWORK.dragon.outerSize);
    expect(AVATAR_FRAME_ARTWORK['streak-eternal'].outerSize).toBe(AVATAR_FRAME_ARTWORK.celestial.outerSize);
  });

  it('鎏金替换素材时保持头像内核和布局指标不变', () => {
    expect(AVATAR_FRAME_ARTWORK.gold.src).toContain('frame_gold_v5.webp');
    expect(AVATAR_FRAME_ARTWORK.gold.accentSrc).toContain('frame_gold_gem_v2.webp');
    expect(AVATAR_FRAME_ARTWORK.gold.innerArtSize).toBe(102);
    expect(AVATAR_FRAME_ARTWORK.gold.outerSize).toBe(98);
  });

  it('三款基础积分框直接使用用户原型静态裁图', () => {
    expect(AVATAR_FRAME_ARTWORK.mint.src).toContain('frame_mint_v3.webp');
    expect(AVATAR_FRAME_ARTWORK.ink.src).toContain('frame_ink_v2.webp');
    expect(AVATAR_FRAME_ARTWORK.moonstone.src).toContain('frame_moonstone_v5.webp');
    expect(AVATAR_FRAME_ARTWORK.mint.motion).toBe('static');
    expect(AVATAR_FRAME_ARTWORK.ink.motion).toBe('static');
    expect(AVATAR_FRAME_ARTWORK.moonstone.motion).toBe('static');
  });

  it('初光直接使用用户原型静态裁图且保持基础档布局', () => {
    expect(AVATAR_FRAME_ARTWORK['first-light'].src).toContain('frame_first_light_v3.webp');
    expect(AVATAR_FRAME_ARTWORK['first-light'].motion).toBe('static');
    expect(AVATAR_FRAME_ARTWORK['first-light'].artSize).toBe(100);
    expect(AVATAR_FRAME_ARTWORK['first-light'].outerSize).toBe(86);
  });

  it('七日晨光替换素材时保持静态档位、头像内核和布局指标不变', () => {
    expect(AVATAR_FRAME_ARTWORK['streak-seed'].src).toContain('frame_streak_seed_v5.webp');
    expect(AVATAR_FRAME_ARTWORK['streak-seed'].motion).toBe('static');
    expect(AVATAR_FRAME_ARTWORK['streak-seed'].artSize).toBe(118);
    expect(AVATAR_FRAME_ARTWORK['streak-seed'].innerArtSize).toBe(99);
    expect(AVATAR_FRAME_ARTWORK['streak-seed'].outerSize).toBe(90);
  });

  it('三款基础免费创作框直接使用同一绿幕原型裁图和头像孔标尺', () => {
    expect(AVATAR_FRAME_ARTWORK['note-seed'].src).toContain('frame_note_seed_v4.webp');
    expect(AVATAR_FRAME_ARTWORK['bookmark-intro'].src).toContain('frame_bookmark_intro_v2.webp');
    expect(AVATAR_FRAME_ARTWORK['file-intro'].src).toContain('frame_file_intro_v2.webp');
    expect(AVATAR_FRAME_ARTWORK['note-flow'].src).toContain('frame_note_flow_v2.webp');
    expect(AVATAR_FRAME_ARTWORK['bookmark-seed'].src).toContain('frame_bookmark_seed_v4.webp');
    expect(AVATAR_FRAME_ARTWORK['file-seed'].src).toContain('frame_file_seed_v4.webp');
    expect(AVATAR_FRAME_ARTWORK['note-seed'].motion).toBe('static');
    expect(AVATAR_FRAME_ARTWORK['bookmark-intro'].motion).toBe('static');
    expect(AVATAR_FRAME_ARTWORK['file-intro'].motion).toBe('static');
    expect(AVATAR_FRAME_ARTWORK['note-flow'].motion).toBe('static');
    expect(AVATAR_FRAME_ARTWORK['bookmark-seed'].motion).toBe('static');
    expect(AVATAR_FRAME_ARTWORK['file-seed'].motion).toBe('static');
    expect(AVATAR_FRAME_ARTWORK['note-seed'].artSize).toBe(101);
    expect(AVATAR_FRAME_ARTWORK['bookmark-intro'].artSize).toBe(101);
    expect(AVATAR_FRAME_ARTWORK['file-intro'].artSize).toBe(101);
    expect(AVATAR_FRAME_ARTWORK['note-seed'].outerSize).toBe(86);
    expect(AVATAR_FRAME_ARTWORK['bookmark-intro'].outerSize).toBe(86);
    expect(AVATAR_FRAME_ARTWORK['file-intro'].outerSize).toBe(86);
    expect(AVATAR_FRAME_ARTWORK['bookmark-seed'].artSize).toBe(114);
    expect(AVATAR_FRAME_ARTWORK['file-seed'].artSize).toBe(105);
    expect(AVATAR_FRAME_ARTWORK['bookmark-seed'].outerSize).toBe(90);
    expect(AVATAR_FRAME_ARTWORK['file-seed'].outerSize).toBe(90);
  });

  it('赤焰使用原型主体和独立火星层，主体结构不参与位移动画', () => {
    expect(AVATAR_FRAME_ARTWORK.flame.src).toContain('frame_flame_v7.webp');
    expect(AVATAR_FRAME_ARTWORK.flame.effectSrc).toContain('frame_flame_effect_v4.webp');
    expect(AVATAR_FRAME_ARTWORK.flame.trailSrc).toContain('frame_flame_embers_v3.webp');
    expect(AVATAR_FRAME_ARTWORK.flame.particleSrcs).toHaveLength(3);
    expect(AVATAR_FRAME_ARTWORK.flame.particleSrcs?.[0]).toContain('frame_flame_particle_tall_v1.webp');
    expect(AVATAR_FRAME_ARTWORK.flame.foregroundShell).toBe(true);
    expect(AVATAR_FRAME_ARTWORK.flame.artSize).toBe(128);
    expect(AVATAR_FRAME_ARTWORK.flame.motion).toBe('colorful');
  });

  it('潮汐直接使用用户原型，并把左右水势拆成独立往返层', () => {
    expect(AVATAR_FRAME_ARTWORK.ocean.src).toContain('frame_ocean_v2.webp');
    expect(AVATAR_FRAME_ARTWORK.ocean.motionSrc).toContain('frame_ocean_current_left_v1.webp');
    expect(AVATAR_FRAME_ARTWORK.ocean.effectSrc).toContain('frame_ocean_current_right_v1.webp');
    expect(AVATAR_FRAME_ARTWORK.ocean.foregroundShell).toBe(true);
    expect(AVATAR_FRAME_ARTWORK.ocean.artSize).toBe(102);
    expect(AVATAR_FRAME_ARTWORK.ocean.innerArtSize).toBe(102);
    expect(AVATAR_FRAME_ARTWORK.ocean.outerSize).toBe(104);
    expect(AVATAR_FRAME_ARTWORK.ocean.motion).toBe('colorful');
  });

  it('极光直接使用用户原型，并把左右流体与上下晶核拆成同画布材质层', () => {
    expect(AVATAR_FRAME_ARTWORK.aurora.src).toContain('frame_aurora_v3.webp');
    expect(AVATAR_FRAME_ARTWORK.aurora.motionSrc).toContain('frame_aurora_flow_left_v1.webp');
    expect(AVATAR_FRAME_ARTWORK.aurora.effectSrc).toContain('frame_aurora_flow_right_v1.webp');
    expect(AVATAR_FRAME_ARTWORK.aurora.accentSrc).toContain('frame_aurora_crystal_v1.webp');
    expect(AVATAR_FRAME_ARTWORK.aurora.foregroundShell).toBe(true);
    expect(AVATAR_FRAME_ARTWORK.aurora.artSize).toBe(120);
    expect(AVATAR_FRAME_ARTWORK.aurora.innerArtSize).toBe(120);
    expect(AVATAR_FRAME_ARTWORK.aurora.outerSize).toBe(106);
    expect(AVATAR_FRAME_ARTWORK.aurora.motion).toBe('colorful');
  });

  it('四款成就炫彩框直接裁取同一原型，并只开放局部主题动效', () => {
    expect(AVATAR_FRAME_ARTWORK['streak-month'].src).toContain('frame_streak_month_v2.webp');
    expect(AVATAR_FRAME_ARTWORK['note-masterpiece'].src).toContain('frame_note_masterpiece_v2.webp');
    expect(AVATAR_FRAME_ARTWORK['file-vault'].src).toContain('frame_file_vault_v2.webp');
    expect(AVATAR_FRAME_ARTWORK['bookmark-corridor'].src).toContain('frame_bookmark_corridor_v1.webp');
    for (const variant of ['streak-month', 'note-masterpiece', 'file-vault', 'bookmark-corridor'] as const) {
      expect(AVATAR_FRAME_ARTWORK[variant].foregroundShell).toBe(true);
      expect(AVATAR_FRAME_ARTWORK[variant].artSize).toBe(116);
      expect(AVATAR_FRAME_ARTWORK[variant].innerArtSize).toBe(116);
      expect(AVATAR_FRAME_ARTWORK[variant].outerSize).toBe(102);
      expect(AVATAR_FRAME_ARTWORK[variant].motion).toBe('colorful');
    }
  });

  it('绯樱替换素材时保持头像内核和布局指标不变', () => {
    expect(AVATAR_FRAME_ARTWORK.sakura.src).toContain('frame_sakura_v6.webp');
    expect(AVATAR_FRAME_ARTWORK.sakura.artSize).toBe(108);
    expect(AVATAR_FRAME_ARTWORK.sakura.innerArtSize).toBe(83);
    expect(AVATAR_FRAME_ARTWORK.sakura.outerSize).toBe(100);
  });

  it('晚霞替换素材时保持头像内核和布局指标不变', () => {
    expect(AVATAR_FRAME_ARTWORK.sunset.src).toContain('frame_sunset_v9.webp');
    expect(AVATAR_FRAME_ARTWORK.sunset.motionSrc).toContain('frame_sunset_cloud_left_v1.webp');
    expect(AVATAR_FRAME_ARTWORK.sunset.effectSrc).toContain('frame_sunset_cloud_right_v1.webp');
    expect(AVATAR_FRAME_ARTWORK.sunset.artSize).toBe(108);
    expect(AVATAR_FRAME_ARTWORK.sunset.innerArtSize).toBe(85);
    expect(AVATAR_FRAME_ARTWORK.sunset.outerSize).toBe(102);
  });

  it('逐款标定中央内孔，同时保持外框视觉外径独立', () => {
    const expectedInnerArtSizes = {
      mint: 116,
      ink: 109,
      moonstone: 114,
      'first-light': 100,
      'note-seed': 101,
      'bookmark-intro': 101,
      'file-intro': 101,
      'streak-seed': 99,
      'bookmark-seed': 114,
      'note-flow': 118,
      'file-seed': 105,
      gold: 102,
      sakura: 83,
      sunset: 85,
      'streak-month': 116,
      'note-masterpiece': 116,
      'file-vault': 116,
      'bookmark-corridor': 116,
      ocean: 102,
      aurora: 120,
      flame: 133,
      neon: 116,
      galaxy: 124,
      dragon: 125,
      celestial: 137,
      'bookmark-archive': 128,
      'note-constellation': 127,
      'file-constellation': 128,
      'streak-eternal': 137,
    };

    expect(
      Object.fromEntries(
        Object.entries(AVATAR_FRAME_ARTWORK).map(([variant, artwork]) => [variant, artwork.innerArtSize]),
      ),
    ).toEqual(expectedInnerArtSizes);
    expect(
      Object.values(AVATAR_FRAME_ARTWORK).every(({ innerArtSize }) => innerArtSize >= 81 && innerArtSize <= 137),
    ).toBe(true);
  });

  it('让笔记与文件主题使用可辨认的独立色系', () => {
    expect(AVATAR_FRAME_ARTWORK['file-vault'].accent).not.toBe(AVATAR_FRAME_ARTWORK['note-masterpiece'].accent);
    expect(AVATAR_FRAME_ARTWORK['file-vault'].glow).toContain('59, 130, 246');
    expect(AVATAR_FRAME_ARTWORK['note-masterpiece'].glow).toContain('20, 184, 166');
  });

  it('八款传说框直接使用用户绿幕原型单图,作为前景实体框压在头像上方', () => {
    expect(AVATAR_FRAME_ARTWORK.neon.src).toContain('frame_neon_v3.webp');
    expect(AVATAR_FRAME_ARTWORK.galaxy.src).toContain('frame_galaxy_v3.webp');
    expect(AVATAR_FRAME_ARTWORK.dragon.src).toContain('frame_dragon_v4.webp');
    expect(AVATAR_FRAME_ARTWORK.dragon.trailSrc).toContain('frame_dragon_trails_v6.webp');
    expect(AVATAR_FRAME_ARTWORK.celestial.src).toContain('frame_celestial_base_v4.webp');
    expect(AVATAR_FRAME_ARTWORK['bookmark-archive'].src).toContain('frame_bookmark_archive_v2.webp');
    expect(AVATAR_FRAME_ARTWORK['note-constellation'].src).toContain('frame_note_constellation_v2.webp');
    expect(AVATAR_FRAME_ARTWORK['file-constellation'].src).toContain('frame_file_constellation_v2.webp');
    expect(AVATAR_FRAME_ARTWORK['streak-eternal'].src).toContain('frame_streak_eternal_base_v5.webp');
    expect(AVATAR_FRAME_ARTWORK['streak-eternal'].motion).toBe('ceiling');
    for (const variant of [
      'neon',
      'galaxy',
      'dragon',
      'celestial',
      'bookmark-archive',
      'note-constellation',
      'file-constellation',
      'streak-eternal',
    ] as const) {
      const artwork: AvatarFrameArtwork = AVATAR_FRAME_ARTWORK[variant];
      expect(artwork.foregroundShell).toBe(true);
      if (variant === 'celestial') {
        expect(artwork.effectSrc).toContain('frame_celestial_wing_right_v1.webp');
      } else if (variant === 'streak-eternal') {
        expect(artwork.effectSrc).toContain('frame_streak_eternal_wing_autumn_v1.webp');
      } else {
        expect(artwork.effectSrc).toBeUndefined();
      }
      if (variant === 'dragon') {
        expect(artwork.trailSrc).toContain('frame_dragon_trails_v6.webp');
      } else if (variant === 'streak-eternal') {
        expect(artwork.trailSrc).toContain('frame_streak_eternal_wing_winter_v1.webp');
      } else {
        expect(artwork.trailSrc).toBeUndefined();
      }
      expect(artwork.accentSrc).toBeUndefined();
      expect(artwork.motionSpriteSrc).toBeUndefined();
      expect(artwork.innerArtSize).toBe(artwork.artSize);
    }
  });

  it('传说款不携带实体运动分层:龙曜只允许高光轨迹层,天穹与岁序只允许同画布翼层', () => {
    for (const variant of [
      'neon',
      'galaxy',
      'dragon',
      'bookmark-archive',
      'note-constellation',
      'file-constellation',
    ] as const) {
      const artwork: AvatarFrameArtwork = AVATAR_FRAME_ARTWORK[variant];
      expect(artwork.motionSrc).toBeUndefined();
    }
  });

  it('天穹双翼与底图为同画布分层:底图挖翼,左右翼独立开合', () => {
    expect(AVATAR_FRAME_ARTWORK.celestial.motionSrc).toContain('frame_celestial_wing_left_v1.webp');
    expect(AVATAR_FRAME_ARTWORK.celestial.effectSrc).toContain('frame_celestial_wing_right_v1.webp');
    expect(AVATAR_FRAME_ARTWORK.celestial.artSize).toBe(137);
    expect(AVATAR_FRAME_ARTWORK.celestial.motion).toBe('ceiling');
  });

  it('岁序长明三翼与底图为同画布分层:春/秋/冬翼各自独立错相轻扬', () => {
    expect(AVATAR_FRAME_ARTWORK['streak-eternal'].motionSrc).toContain('frame_streak_eternal_wing_spring_v1.webp');
    expect(AVATAR_FRAME_ARTWORK['streak-eternal'].effectSrc).toContain('frame_streak_eternal_wing_autumn_v1.webp');
    expect(AVATAR_FRAME_ARTWORK['streak-eternal'].trailSrc).toContain('frame_streak_eternal_wing_winter_v1.webp');
    expect(AVATAR_FRAME_ARTWORK['streak-eternal'].artSize).toBe(137);
    expect(AVATAR_FRAME_ARTWORK['streak-eternal'].motion).toBe('ceiling');
  });
});
