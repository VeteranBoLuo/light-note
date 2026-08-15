import { describe, expect, it } from 'vitest';
import { AVATAR_FRAME_ARTWORK } from './avatarFrameArtwork';
import { FRAME_VARIANTS } from './growthFrames';

describe('头像框成品素材目录', () => {
  it('完整覆盖 25 个视觉变体且每款使用独立素材', () => {
    const variants = Object.values(FRAME_VARIANTS);
    const artworkVariants = Object.keys(AVATAR_FRAME_ARTWORK);

    expect(new Set(artworkVariants)).toEqual(new Set(variants));
    expect(new Set(Object.values(AVATAR_FRAME_ARTWORK).map((item) => item.src)).size).toBe(25);
  });

  it('保持静态、动态与双天花板的档位约束', () => {
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
      'streak-seed',
      'bookmark-seed',
      'file-seed',
    ]);
    expect(variantsFor('advanced')).toEqual(['gold', 'sakura', 'sunset']);
    expect(variantsFor('ceiling')).toEqual(['celestial', 'streak-eternal']);
    expect(Object.values(AVATAR_FRAME_ARTWORK).filter((item) => item.motion !== 'static')).toHaveLength(17);
    expect(Object.values(AVATAR_FRAME_ARTWORK).every((item) => item.artSize >= 100 && item.artSize <= 140)).toBe(true);
    expect(Object.values(AVATAR_FRAME_ARTWORK).every((item) => item.outerSize >= 86 && item.outerSize <= 124)).toBe(
      true,
    );
  });

  it('用实际布局外径表达档位和传说价格阶梯', () => {
    expect(AVATAR_FRAME_ARTWORK.gold.outerSize).toBeGreaterThan(AVATAR_FRAME_ARTWORK.moonstone.outerSize);
    expect(AVATAR_FRAME_ARTWORK['streak-month'].outerSize).toBeLessThan(AVATAR_FRAME_ARTWORK.gold.outerSize);
    expect(AVATAR_FRAME_ARTWORK['note-masterpiece'].outerSize).toBeLessThan(AVATAR_FRAME_ARTWORK.gold.outerSize);
    expect(AVATAR_FRAME_ARTWORK['file-vault'].outerSize).toBeLessThan(AVATAR_FRAME_ARTWORK.gold.outerSize);
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

  it('让笔记与文件主题使用可辨认的独立色系', () => {
    expect(AVATAR_FRAME_ARTWORK['file-vault'].accent).not.toBe(AVATAR_FRAME_ARTWORK['note-masterpiece'].accent);
    expect(AVATAR_FRAME_ARTWORK['file-vault'].glow).toContain('59, 130, 246');
    expect(AVATAR_FRAME_ARTWORK['note-masterpiece'].glow).toContain('20, 184, 166');
  });

  it('为高价值头像框提供可独立驱动的真实结构分层', () => {
    expect(AVATAR_FRAME_ARTWORK.dragon.motionSrc).toContain('frame_dragon_body_v2');
    expect(AVATAR_FRAME_ARTWORK.dragon.effectSrc).toContain('frame_dragon_cloud_flame_v2');
    expect(AVATAR_FRAME_ARTWORK.dragon.trailSrc).toContain('frame_dragon_trails_v5');
    expect(AVATAR_FRAME_ARTWORK.dragon.accentSrc).toContain('frame_dragon_pearl_v2');
    expect(AVATAR_FRAME_ARTWORK.celestial.motionSrc).toBeTruthy();
    expect(AVATAR_FRAME_ARTWORK['streak-eternal'].motionSrc).toBeTruthy();
    expect(AVATAR_FRAME_ARTWORK['streak-eternal'].motionSpriteSrc).toContain('frame_streak_eternal_rabbit_sprite');
  });
});
