import { describe, expect, it } from 'vitest';
import { chatArtworkPrewarmSelections } from './chatArtworkPrewarm';

describe('chatArtworkPrewarmSelections', () => {
  it('进入聊天室前就预热首屏贴纸，其余表情作为可选低优先级', () => {
    const [firstScreen, artwork] = chatArtworkPrewarmSelections(false);
    expect(firstScreen.label).toBe('chat.first-screen');
    expect(firstScreen.urls).toHaveLength(8);
    expect(artwork).toMatchObject({ label: 'chat.artwork', optional: true });
  });

  it('正在使用聊天室时立即按当前优先级预热全部表情', () => {
    const selections = chatArtworkPrewarmSelections(true);
    expect(selections.map((item) => item.label)).toEqual(['chat.first-screen', 'chat.artwork']);
    expect(selections.every((item) => !item.optional)).toBe(true);
  });
});
