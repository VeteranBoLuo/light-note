import { buildExtensionPanelPath } from './panelContext';

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setOptions({ enabled: true }).catch(() => undefined);
});

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id == null) return;
  // 标签页 ID 只进入这个标签页专属的侧栏路径；此处不读取 URL、标题或正文。
  await chrome.sidePanel.setOptions({
    tabId: tab.id,
    path: buildExtensionPanelPath(tab.id),
    enabled: true,
  });
  await chrome.sidePanel.open({ tabId: tab.id });
  void chrome.runtime.sendMessage({ type: 'LIGHT_NOTE_EXTENSION_OPENED', tabId: tab.id }).catch(() => undefined);
});
