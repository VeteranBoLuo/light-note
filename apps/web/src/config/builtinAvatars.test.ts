import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUILTIN_AVATARS, builtinAvatarPreviewStyle, renderBuiltinAvatar } from './builtinAvatars';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('builtin avatars', () => {
  it('retains both original series and adds six distinct refined portraits', () => {
    expect(BUILTIN_AVATARS).toHaveLength(24);
    expect(new Set(BUILTIN_AVATARS.map((avatar) => avatar.id)).size).toBe(24);
    for (const sprite of ['classic', 'variety']) {
      const cells = BUILTIN_AVATARS.filter((avatar) => avatar.sprite === sprite).map(
        (avatar) => `${avatar.row}:${avatar.column}`,
      );
      expect(new Set(cells)).toEqual(new Set(['0:0', '0:1', '0:2', '1:0', '1:1', '1:2', '2:0', '2:1', '2:2']));
    }
    expect(BUILTIN_AVATARS.filter((avatar) => avatar.sprite === 'refined').map((avatar) => avatar.id)).toEqual([
      'silver-fox',
      'ink-cat',
      'white-deer',
      'snow-owl',
      'star-whale',
      'paper-traveler',
    ]);
  });

  it('maps the sprite cells to stable CSS positions', () => {
    expect(builtinAvatarPreviewStyle(BUILTIN_AVATARS[0]).backgroundPosition).toBe('0% 0%');
    expect(builtinAvatarPreviewStyle(BUILTIN_AVATARS[4]).backgroundPosition).toBe('50% 50%');
    expect(builtinAvatarPreviewStyle(BUILTIN_AVATARS[8]).backgroundPosition).toBe('100% 100%');
    expect(builtinAvatarPreviewStyle(BUILTIN_AVATARS[4]).backgroundSize).toBe('300% 300%');
    expect(builtinAvatarPreviewStyle(BUILTIN_AVATARS[0]).backgroundImage).not.toBe(
      builtinAvatarPreviewStyle(BUILTIN_AVATARS[9]).backgroundImage,
    );
    expect(builtinAvatarPreviewStyle(BUILTIN_AVATARS[23])).toMatchObject({
      backgroundPosition: '100% 100%',
      backgroundSize: '300% 200%',
    });
  });

  it('exports square portraits from the rectangular refined sheet and the original square sheets', async () => {
    class TestImage {
      naturalWidth = 1152;
      naturalHeight = 1152;
      onload?: () => void;
      set src(url: string) {
        this.naturalHeight = url.includes('refined') ? 768 : 1152;
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', TestImage);
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/webp;base64,portrait');

    await renderBuiltinAvatar('paper-traveler');
    expect(drawImage).toHaveBeenLastCalledWith(expect.any(TestImage), 768, 384, 384, 384, 0, 0, 256, 256);
    await renderBuiltinAvatar('ink-cat');
    expect(drawImage).toHaveBeenLastCalledWith(expect.any(TestImage), 384, 0, 384, 384, 0, 0, 256, 256);
    await renderBuiltinAvatar('koi-lotus');
    expect(drawImage).toHaveBeenLastCalledWith(expect.any(TestImage), 384, 384, 384, 384, 0, 0, 256, 256);
  });

  it('keeps complete bilingual copy keys for every avatar', () => {
    BUILTIN_AVATARS.forEach((avatar) => {
      expect(avatar.nameKey).toMatch(/^myInfo\.builtinAvatarNames\./);
      expect(avatar.descriptionKey).toMatch(/^myInfo\.builtinAvatarDescriptions\./);
    });
  });
});
