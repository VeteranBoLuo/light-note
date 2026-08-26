import { beforeEach, describe, expect, it, vi } from 'vitest';
import { captureTriggeredPage } from './capture';

const executeScript = vi.fn();
const queryTabs = vi.fn();

describe('浏览器插件延迟读取当前页', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/sidepanel.html');
    vi.stubGlobal('chrome', {
      tabs: { query: queryTabs },
      scripting: { executeScript },
    });
  });

  it('仅导入模块不会触发网页读取', () => {
    expect(queryTabs).not.toHaveBeenCalled();
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('用户进入书签流程后只读取当前标签页的顶层 frame', async () => {
    queryTabs.mockResolvedValue([{ id: 17 }]);
    executeScript.mockResolvedValue([
      { result: { url: 'https://example.com/article', title: '示例文章', selection: '选中的内容' } },
    ]);

    await expect(captureTriggeredPage()).resolves.toEqual({
      tabId: 17,
      url: 'https://example.com/article',
      title: '示例文章',
      selection: '选中的内容',
    });
    expect(queryTabs).toHaveBeenCalledWith({ active: true, lastFocusedWindow: true });
    expect(executeScript).toHaveBeenCalledWith(
      expect.objectContaining({ target: { tabId: 17, frameIds: [0] } }),
    );
  });

  it('没有活动标签页时拒绝读取', async () => {
    queryTabs.mockResolvedValue([]);
    await expect(captureTriggeredPage()).rejects.toMatchObject({
      name: 'CAPTURE_TAB_MISSING',
    });
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('受限页面返回可手工填写的非阻断错误', async () => {
    queryTabs.mockResolvedValue([{ id: 18 }]);
    executeScript.mockRejectedValue(new Error('Cannot access a chrome:// URL'));

    await expect(captureTriggeredPage()).rejects.toMatchObject({
      name: 'CAPTURE_RESTRICTED_PAGE',
      message: expect.stringContaining('手动填写'),
    });
  });
});
