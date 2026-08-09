const DYNAMIC_VIEWPORT_UNIT_PATTERN = /(-?(?:\d+\.)?\d+)(dvh|svh|lvh)\b/giu;

/**
 * 把动态视口单位降级为传统 vh。
 *
 * Android 旧 WebView 不认识 dvh/svh/lvh，会把整条内联 style 丢弃；CSS 文件由
 * PostCSS 自动生成双声明，BModal/BDrawer 的运行时 style 则在这里按能力选择。
 */
export function toLegacyViewportFallback(value: string): string {
  return String(value || '').replace(DYNAMIC_VIEWPORT_UNIT_PATTERN, '$1vh');
}

export function supportsDynamicViewportUnits(cssObject: Pick<typeof CSS, 'supports'> | undefined = globalThis.CSS) {
  try {
    return Boolean(cssObject?.supports?.('height', '1dvh'));
  } catch {
    return false;
  }
}

/** 给内联 style 使用：现代浏览器保留 dvh，旧 WebView 使用等价 vh。 */
export function resolveViewportUnitValue(
  value: string,
  dynamicViewportSupported = supportsDynamicViewportUnits(),
): string {
  return dynamicViewportSupported ? value : toLegacyViewportFallback(value);
}
