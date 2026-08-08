import { describe, expect, it } from 'vitest';
import { FRAME_IDS, FRAME_VARIANTS, frameVariant } from './growthFrames';

describe('头像框视觉变体', () => {
  it('为 12 款商店头像框提供唯一样式', () => {
    expect(FRAME_IDS).toHaveLength(12);
    expect(new Set(Object.values(FRAME_VARIANTS)).size).toBe(FRAME_IDS.length);
    FRAME_IDS.forEach((id) => expect(frameVariant(id)).toBe(FRAME_VARIANTS[id]));
  });

  it('未知或未佩戴的头像框不误用其他样式', () => {
    expect(frameVariant('frame_removed')).toBeNull();
    expect(frameVariant(null)).toBeNull();
    expect(frameVariant()).toBeNull();
  });
});
