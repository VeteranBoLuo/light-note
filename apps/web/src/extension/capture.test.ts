import { beforeEach, describe, expect, it, vi } from 'vitest';
import { captureTriggeredPage } from './capture';

const executeScript = vi.fn();

describe('浏览器插件延迟读取当前页', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/sidepanel.html');
    vi.stubGlobal('chrome', {
      scripting: { executeScript },
    });
  });

  it('仅导入模块不会触发网页读取', () => {
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('用户进入书签流程后只读取触发标签页的顶层 frame', async () => {
    window.history.replaceState({}, '', '/sidepanel.html?tabId=17');
    executeScript.mockResolvedValue([
      { result: { url: 'https://example.com/article', title: '示例文章', selection: '选中的内容' } },
    ]);

    await expect(captureTriggeredPage()).resolves.toEqual({
      tabId: 17,
      url: 'https://example.com/article',
      title: '示例文章',
      selection: '选中的内容',
    });
    expect(executeScript).toHaveBeenCalledWith(
      expect.objectContaining({ target: { tabId: 17, frameIds: [0] } }),
    );
  });

  it('默认侧栏没有标签页上下文时拒绝读取', async () => {
    await expect(captureTriggeredPage()).rejects.toMatchObject({
      name: 'CAPTURE_TAB_MISSING',
    });
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('受限页面返回可手工填写的非阻断错误', async () => {
    window.history.replaceState({}, '', '/sidepanel.html?tabId=18');
    executeScript.mockRejectedValue(new Error('Cannot access a chrome:// URL'));

    await expect(captureTriggeredPage()).rejects.toMatchObject({
      name: 'CAPTURE_RESTRICTED_PAGE',
      message: expect.stringContaining('手动填写'),
    });
  });
});
