import { toLegacyViewportFallback } from '../utils/cssViewport';

interface CssDeclarationLike {
  prop: string;
  value: string;
  cloneBefore: (overrides: { value: string }) => void;
  prev?: () => { type?: string; prop?: string; value?: string } | undefined;
}

/**
 * 给 CSS 中的 dvh/svh/lvh 自动补一条位于前面的 vh 声明。
 * 现代浏览器使用后声明，旧 WebView 忽略不认识的后声明后继续使用前一条。
 */
export default function dynamicViewportFallback() {
  return {
    postcssPlugin: 'light-note-dynamic-viewport-fallback',
    Declaration(declaration: CssDeclarationLike) {
      const fallback = toLegacyViewportFallback(declaration.value);
      if (fallback === declaration.value) return;
      const previous = declaration.prev?.();
      if (previous?.type === 'decl' && previous.prop === declaration.prop && previous.value === fallback) return;
      declaration.cloneBefore({ value: fallback });
    },
  };
}
