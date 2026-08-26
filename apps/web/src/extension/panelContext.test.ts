import { describe, expect, it } from 'vitest';
import { buildExtensionPanelPath, parseExtensionPanelTabId } from './panelContext';

describe('浏览器插件标签页级侧栏上下文', () => {
  it('只接受非负安全整数标签页 ID', () => {
    expect(parseExtensionPanelTabId('?tabId=17')).toBe(17);
    expect(parseExtensionPanelTabId('?other=1&tabId=0')).toBe(0);
    expect(parseExtensionPanelTabId('')).toBeNull();
    expect(parseExtensionPanelTabId('?tabId=-1')).toBeNull();
    expect(parseExtensionPanelTabId('?tabId=1e3')).toBeNull();
    expect(parseExtensionPanelTabId(`?tabId=${Number.MAX_SAFE_INTEGER + 1}`)).toBeNull();
  });

  it('为每个触发标签页生成独立的侧栏入口', () => {
    expect(buildExtensionPanelPath(42)).toBe('sidepanel.html?tabId=42');
    expect(() => buildExtensionPanelPath(-1)).toThrow(TypeError);
  });
});
