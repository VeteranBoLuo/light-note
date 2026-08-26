import type { CapturedPage, CapturedPageText, CapturedTab, PreparedPageTextCapture } from './types';

const PAGE_TEXT_MAX_LENGTH = 50_000;

function readPageSelectionForLightNote() {
  return {
    url: window.location.href,
    title: document.title,
    selection: window.getSelection()?.toString().trim().slice(0, 2_000) || '',
  };
}

function readPageTextForLightNote(maxLength: number) {
  const rawText = document.body?.innerText || '';
  const normalizedText = rawText
    .replace(/\r\n?/gu, '\n')
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
  return {
    url: window.location.href,
    title: document.title,
    text: normalizedText.slice(0, maxLength),
    truncated: normalizedText.length > maxLength,
  };
}

function captureError(name: string, message: string, cause?: unknown): Error {
  const error = new Error(message);
  error.name = name;
  if (cause !== undefined) (error as Error & { cause?: unknown }).cause = cause;
  return error;
}

function isWebPageUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

async function currentTab(): Promise<chrome.tabs.Tab> {
  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (activeTab?.id == null) {
    throw captureError('CAPTURE_TAB_MISSING', '没有找到当前标签页，请切回要收集的网页后重试');
  }
  return activeTab;
}

export async function captureCurrentTabAddress(): Promise<CapturedTab> {
  const activeTab = await currentTab();
  const url = String(activeTab.url || activeTab.pendingUrl || '');
  if (!url) {
    throw captureError('CAPTURE_ADDRESS_UNAVAILABLE', '无法读取当前标签页地址，请重新加载扩展后重试');
  }
  return {
    tabId: activeTab.id as number,
    url,
    title: String(activeTab.title || ''),
  };
}

export async function captureTriggeredPage(): Promise<CapturedPage> {
  // URL 与标题来自当前标签页元数据；选中文本才需要进入网页读取。
  // 这样即使浏览器禁止脚本注入，书签的基本信息仍然可用。
  const tab = await captureCurrentTabAddress();
  if (!isWebPageUrl(tab.url)) return { ...tab, selection: '' };
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.tabId, frameIds: [0] },
      func: readPageSelectionForLightNote,
    });
    const value = results[0]?.result;
    if (!value?.url) return { ...tab, selection: '' };
    return {
      tabId: tab.tabId,
      url: String(value.url),
      title: String(value.title || tab.title),
      selection: String(value.selection || ''),
    };
  } catch {
    return { ...tab, selection: '' };
  }
}

export async function prepareCurrentPageTextCapture(): Promise<PreparedPageTextCapture> {
  // 只准备当前标签页与精确域名，不读取 DOM；真正的正文读取仍由按钮点击触发。
  const tab = await captureCurrentTabAddress();
  if (!isWebPageUrl(tab.url)) {
    throw captureError('CAPTURE_RESTRICTED_PAGE', 'Chrome / Edge 内部页、扩展页和本地文件不允许插件读取网页文字');
  }
  return {
    ...tab,
    originPattern: `${new URL(tab.url).origin}/*`,
  };
}

export function captureCurrentPageText(target: PreparedPageTextCapture): Promise<CapturedPageText> {
  // permissions.request 必须在点击事件的同步调用栈内发起，不能先跨过异步边界。
  const permissionRequest = chrome.permissions.request({ origins: [target.originPattern] });
  return permissionRequest
    .catch((cause) => {
      throw captureError('CAPTURE_PERMISSION_DENIED', '没有获得当前网站的读取权限，笔记草稿未改变', cause);
    })
    .then(async (granted) => {
      if (!granted) {
        throw captureError('CAPTURE_PERMISSION_DENIED', '没有获得当前网站的读取权限，笔记草稿未改变');
      }
      const current = await prepareCurrentPageTextCapture();
      if (current.tabId !== target.tabId || current.originPattern !== target.originPattern) {
        throw captureError('CAPTURE_PAGE_CHANGED', '当前标签页已经切换，请再点一次“一键带入”');
      }
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: current.tabId, frameIds: [0] },
          func: readPageTextForLightNote,
          args: [PAGE_TEXT_MAX_LENGTH],
        });
        const value = results[0]?.result;
        if (!value?.url) throw new Error('CAPTURE_EMPTY');
        return {
          tabId: current.tabId,
          url: String(value.url),
          title: String(value.title || current.title),
          text: String(value.text || ''),
          truncated: Boolean(value.truncated),
        };
      } catch (cause) {
        throw captureError(
          'CAPTURE_RESTRICTED_PAGE',
          '当前网站不允许插件读取网页文字；Chrome 应用商店等保护页面无法绕过此限制',
          cause,
        );
      }
    });
}
