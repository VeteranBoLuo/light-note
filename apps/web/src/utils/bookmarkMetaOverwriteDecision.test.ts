import { afterEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { requestBookmarkMetaOverwriteDecision } from './bookmarkMetaOverwriteDecision';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('requestBookmarkMetaOverwriteDecision', () => {
  it('展示新旧内容，并返回用户逐字段勾选的结果', async () => {
    const result = requestBookmarkMetaOverwriteDecision([
      { id: 'name', currentValue: '当前名称', generatedValue: '识别名称' },
      { id: 'description', currentValue: '当前描述', generatedValue: '识别描述' },
    ]);

    await nextTick();
    expect(document.body.textContent).toContain('当前名称');
    expect(document.body.textContent).toContain('识别名称');
    expect(document.body.textContent).toContain('当前描述');
    expect(document.body.textContent).toContain('识别描述');

    const nameField = document.querySelector<HTMLElement>('.bookmark-meta-overwrite__field');
    nameField?.querySelector<HTMLElement>('.b-checkbox')?.click();
    await nextTick();

    const applyButton = document.querySelector<HTMLElement>(
      '.bookmark-meta-overwrite__footer .primary_btn',
    );
    expect(applyButton).toBeTruthy();
    applyButton?.click();

    await expect(result).resolves.toEqual(['description']);
    expect(document.querySelector('.bookmark-meta-overwrite')).toBeNull();
  });

  it('页面离开或外部取消时会关闭未完成的覆盖确认', async () => {
    const controller = new AbortController();
    const result = requestBookmarkMetaOverwriteDecision(
      [{ id: 'name', currentValue: '当前名称', generatedValue: '识别名称' }],
      { signal: controller.signal },
    );
    await nextTick();
    expect(document.querySelector('.bookmark-meta-overwrite')).toBeTruthy();

    controller.abort();

    await expect(result).resolves.toBeNull();
    expect(document.querySelector('.bookmark-meta-overwrite')).toBeNull();
  });
});
