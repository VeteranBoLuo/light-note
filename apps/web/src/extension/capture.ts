import { currentExtensionPanelTabId } from './panelContext';
import type { CapturedPage } from './types';

function readPageForLightNote() {
  return {
    url: window.location.href,
    title: document.title,
    selection: window.getSelection()?.toString().trim().slice(0, 2_000) || '',
  };
}

export async function captureTriggeredPage(): Promise<CapturedPage> {
  const tabId = currentExtensionPanelTabId();
  if (tabId == null) {
    const error = new Error('没有可读取的网页，请重新点击浏览器工具栏中的轻笺图标');
    error.name = 'CAPTURE_TAB_MISSING';
    throw error;
  }
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
