import type { CapturedPage, CapturedPageText } from './types';

const PAGE_TEXT_MAX_LENGTH = 50_000;

function readPageForLightNote() {
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

async function currentTabId(): Promise<number> {
  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tabId = activeTab?.id;
  if (tabId == null) {
    const error = new Error('没有可读取的网页，请重新点击浏览器工具栏中的轻笺图标');
    error.name = 'CAPTURE_TAB_MISSING';
    throw error;
  }
  return tabId;
}

export async function captureTriggeredPage(): Promise<CapturedPage> {
  // 只在用户进入书签流程或主动点击“填入当前页”后读取，不在插件入口自动执行。
  const tabId = await currentTabId();
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      func: readPageForLightNote,
    });
    const value = results[0]?.result;
    if (!value?.url) throw new Error('CAPTURE_EMPTY');
    return {
      tabId,
      url: String(value.url),
      title: String(value.title || ''),
      selection: String(value.selection || ''),
    };
  } catch (cause) {
    const error = new Error('当前页面受浏览器保护，无法自动读取；你仍可手动填写网址和标题');
    error.name = 'CAPTURE_RESTRICTED_PAGE';
    (error as any).cause = cause;
    throw error;
  }
}

export async function captureCurrentPageText(): Promise<CapturedPageText> {
  // 笔记页不会自动读取网页；只有用户明确点击“带入当前网页文字”才会执行这里。
  const tabId = await currentTabId();
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      func: readPageTextForLightNote,
      args: [PAGE_TEXT_MAX_LENGTH],
    });
    const value = results[0]?.result;
    if (!value?.url) throw new Error('CAPTURE_EMPTY');
    return {
      tabId,
      url: String(value.url),
      title: String(value.title || ''),
      text: String(value.text || ''),
      truncated: Boolean(value.truncated),
    };
  } catch (cause) {
    const error = new Error('当前页面受浏览器保护，无法读取网页文字');
    error.name = 'CAPTURE_RESTRICTED_PAGE';
    (error as any).cause = cause;
    throw error;
  }
}
