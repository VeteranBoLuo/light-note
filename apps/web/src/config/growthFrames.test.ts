import { describe, expect, it } from 'vitest';
import { FRAME_IDS, FRAME_VARIANTS, frameVariant, sortFramesByRarity } from './growthFrames';

describe('头像框视觉变体', () => {
  it('为 13 款商店头像框和 12 款成就头像框提供唯一样式', () => {
    expect(FRAME_IDS).toHaveLength(25);
    expect(new Set(Object.values(FRAME_VARIANTS)).size).toBe(FRAME_IDS.length);
    FRAME_IDS.forEach((id) => expect(frameVariant(id)).toBe(FRAME_VARIANTS[id]));
  });

  it('未知或未佩戴的头像框不误用其他样式', () => {
    expect(frameVariant('frame_removed')).toBeNull();
    expect(frameVariant(null)).toBeNull();
    expect(frameVariant()).toBeNull();
  });

  it('按基础、进阶、炫彩、传说排序并保持同档目录顺序', () => {
    const original = [
      { id: 'legendary', rarity: 'legendary' as const },
      { id: 'basic-first', rarity: 'basic' as const },
      { id: 'epic', rarity: 'epic' as const },
      { id: 'basic-second', rarity: 'basic' as const },
      { id: 'rare', rarity: 'rare' as const },
    ];

    expect(sortFramesByRarity(original).map((item) => item.id)).toEqual([
      'basic-first',
      'basic-second',
      'rare',
      'epic',
      'legendary',
    ]);
    expect(original[0].id).toBe('legendary');
  });
});
