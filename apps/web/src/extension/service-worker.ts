// 交给浏览器原生 action 行为打开侧栏，避免异步调用丢失用户点击手势。
void chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('LIGHT_NOTE_SIDE_PANEL_SETUP_FAILED', error));
