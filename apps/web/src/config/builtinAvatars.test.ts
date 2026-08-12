import { describe, expect, it } from 'vitest';
import { BUILTIN_AVATARS, builtinAvatarPreviewStyle } from './builtinAvatars';

describe('builtin avatars', () => {
  it('provides one distinctive avatar for every cell in both 3×3 sprites', () => {
    expect(BUILTIN_AVATARS).toHaveLength(18);
    expect(new Set(BUILTIN_AVATARS.map((avatar) => avatar.id)).size).toBe(18);
    for (const sprite of ['classic', 'variety']) {
      const cells = BUILTIN_AVATARS.filter((avatar) => avatar.sprite === sprite).map(
        (avatar) => `${avatar.row}:${avatar.column}`,
      );
      expect(new Set(cells)).toEqual(new Set(['0:0', '0:1', '0:2', '1:0', '1:1', '1:2', '2:0', '2:1', '2:2']));
    }
  });

  it('maps the sprite cells to stable CSS positions', () => {
    expect(builtinAvatarPreviewStyle(BUILTIN_AVATARS[0]).backgroundPosition).toBe('0% 0%');
    expect(builtinAvatarPreviewStyle(BUILTIN_AVATARS[4]).backgroundPosition).toBe('50% 50%');
    expect(builtinAvatarPreviewStyle(BUILTIN_AVATARS[8]).backgroundPosition).toBe('100% 100%');
    expect(builtinAvatarPreviewStyle(BUILTIN_AVATARS[4]).backgroundSize).toBe('300% 300%');
    expect(builtinAvatarPreviewStyle(BUILTIN_AVATARS[0]).backgroundImage).not.toBe(
      builtinAvatarPreviewStyle(BUILTIN_AVATARS[9]).backgroundImage,
    );
  });

  it('keeps complete bilingual copy keys for every avatar', () => {
    BUILTIN_AVATARS.forEach((avatar) => {
      expect(avatar.nameKey).toMatch(/^myInfo\.builtinAvatarNames\./);
      expect(avatar.descriptionKey).toMatch(/^myInfo\.builtinAvatarDescriptions\./);
    });
  });
});
