export type ResolvedTheme = 'day' | 'night';

export function normalizeResolvedTheme(theme: unknown): ResolvedTheme {
  return theme === 'night' ? 'night' : 'day';
}

/**
 * 同步应用主题与浏览器原生配色。
 *
 * `only light` 会阻止支持该标准的浏览器对浅色页面再次执行自动深色转换；
 * 深色主题仍明确声明为 dark，让表单控件、滚动条和浏览器栏保持一致。
 */
export function applyDocumentTheme(theme: unknown, targetDocument: Document = document): ResolvedTheme {
  const resolvedTheme = normalizeResolvedTheme(theme);
  const root = targetDocument.documentElement;
  const isNight = resolvedTheme === 'night';

  root.setAttribute('data-theme', resolvedTheme);
  root.style.setProperty('color-scheme', isNight ? 'dark' : 'only light');

  const colorSchemeMeta = targetDocument.querySelector<HTMLMetaElement>('meta[name="color-scheme"]');
  colorSchemeMeta?.setAttribute('content', isNight ? 'dark' : 'only light');

  const themeColorMeta = targetDocument.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  themeColorMeta?.setAttribute('content', isNight ? '#222222' : '#ffffff');

  return resolvedTheme;
}
