import { afterEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { requestBookmarkUrlDecision } from './bookmarkUrlDecision';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('requestBookmarkUrlDecision', () => {
  it('能够在主组件树外正常挂载 BModal，并返回用户选择', async () => {
    const result = requestBookmarkUrlDecision({
      title: '请选择书签地址',
      description: '识别到多个候选地址，请确认。',
      options: [
        {
          id: 'https://boluo66.top',
          label: 'https://boluo66.top',
          description: '完整网址',
          recommended: true,
        },
      ],
      cancelText: '返回修改',
      recommendedText: '推荐',
    });

    await nextTick();
    expect(document.body.textContent).toContain('请选择书签地址');
    expect(document.body.textContent).toContain('https://boluo66.top');

    const option = Array.from(document.querySelectorAll<HTMLElement>('.bookmark-url-decision__option')).find(
      (element) => element.textContent?.includes('https://boluo66.top'),
    );
    expect(option).toBeTruthy();
    option?.click();

    await expect(result).resolves.toBe('https://boluo66.top');
    expect(document.body.textContent).not.toContain('请选择书签地址');
  });
});
