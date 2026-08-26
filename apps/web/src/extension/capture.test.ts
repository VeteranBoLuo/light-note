import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureCurrentPageText,
  captureCurrentTabAddress,
  captureTriggeredPage,
  prepareCurrentPageTextCapture,
} from './capture';

const executeScript = vi.fn();
const queryTabs = vi.fn();
const requestPermission = vi.fn();

describe('浏览器插件按意图读取当前页', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/sidepanel.html');
    vi.stubGlobal('chrome', {
      tabs: { query: queryTabs },
      scripting: { executeScript },
      permissions: { request: requestPermission },
    });
  });

  it('仅导入模块不会触发标签页或网页读取', () => {
    expect(queryTabs).not.toHaveBeenCalled();
    expect(executeScript).not.toHaveBeenCalled();
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('用户进入书签流程后用标签页元数据取得地址和标题，只注入选中文本', async () => {
    queryTabs.mockResolvedValue([{ id: 17, url: 'https://example.com/article', title: '标签页标题' }]);
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
    expect(executeScript).toHaveBeenCalledWith(expect.objectContaining({ target: { tabId: 17, frameIds: [0] } }));
  });

  it('网页脚本受限时仍返回地址和标题，不把书签基本信息误判为失败', async () => {
    queryTabs.mockResolvedValue([{ id: 18, url: 'https://example.com/protected', title: '受限文章' }]);
    executeScript.mockRejectedValue(new Error('Cannot access contents of the page'));

    await expect(captureTriggeredPage()).resolves.toEqual({
      tabId: 18,
      url: 'https://example.com/protected',
      title: '受限文章',
      selection: '',
    });
  });

  it('当前页信息回填只读取当前标签页元数据，不执行网页脚本', async () => {
    queryTabs.mockResolvedValue([{ id: 21, url: 'https://example.com/new', title: '新页面' }]);

    await expect(captureCurrentTabAddress()).resolves.toEqual({
      tabId: 21,
      url: 'https://example.com/new',
      title: '新页面',
    });
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('笔记带入只申请当前网站权限，并在授权后读取最多五万字', async () => {
    queryTabs.mockResolvedValue([{ id: 19, url: 'https://example.com/long', title: '长文章' }]);
    requestPermission.mockResolvedValue(true);
    executeScript.mockResolvedValue([
      {
        result: {
          url: 'https://example.com/long',
          title: '长文章',
          text: '正文内容',
          truncated: true,
        },
      },
    ]);
    const target = await prepareCurrentPageTextCapture();

    const capturePromise = captureCurrentPageText(target);
    expect(requestPermission).toHaveBeenCalledWith({ origins: ['https://example.com/*'] });
    await expect(capturePromise).resolves.toEqual({
      tabId: 19,
      url: 'https://example.com/long',
      title: '长文章',
      text: '正文内容',
      truncated: true,
    });
    expect(executeScript).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { tabId: 19, frameIds: [0] },
        args: [50_000],
      }),
    );
  });

  it('用户拒绝当前网站权限时保留草稿并停止读取正文', async () => {
    requestPermission.mockResolvedValue(false);
    const target = {
      tabId: 22,
      url: 'https://example.com/',
      title: '示例',
      originPattern: 'https://example.com/*',
    };

    await expect(captureCurrentPageText(target)).rejects.toMatchObject({
      name: 'CAPTURE_PERMISSION_DENIED',
      message: expect.stringContaining('草稿未改变'),
    });
    expect(queryTabs).not.toHaveBeenCalled();
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('授权期间切换标签页时不读取错误页面', async () => {
    requestPermission.mockResolvedValue(true);
    queryTabs.mockResolvedValue([{ id: 24, url: 'https://another.example/page', title: '另一页' }]);
    const target = {
      tabId: 23,
      url: 'https://example.com/',
      title: '原页面',
      originPattern: 'https://example.com/*',
    };

    await expect(captureCurrentPageText(target)).rejects.toMatchObject({
      name: 'CAPTURE_PAGE_CHANGED',
      message: expect.stringContaining('再点一次'),
    });
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('没有活动标签页时拒绝读取', async () => {
    queryTabs.mockResolvedValue([]);
    await expect(captureTriggeredPage()).rejects.toMatchObject({
      name: 'CAPTURE_TAB_MISSING',
    });
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('浏览器内部页可以取得地址，但不会申请或读取正文', async () => {
    queryTabs.mockResolvedValue([{ id: 20, url: 'chrome://extensions/', title: '扩展程序' }]);

    await expect(captureCurrentTabAddress()).resolves.toMatchObject({ url: 'chrome://extensions/' });
    await expect(prepareCurrentPageTextCapture()).rejects.toMatchObject({
      name: 'CAPTURE_RESTRICTED_PAGE',
      message: expect.stringContaining('内部页'),
    });
    expect(requestPermission).not.toHaveBeenCalled();
    expect(executeScript).not.toHaveBeenCalled();
  });
});
