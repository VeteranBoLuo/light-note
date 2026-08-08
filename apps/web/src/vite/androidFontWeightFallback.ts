const COMPAT_PROPERTY_PREFIX = '--ln-android-font-weight-';

type FontWeightKind = 'regular' | 'medium' | 'bold';

interface CssNodeLike {
  type?: string;
  name?: string;
  parent?: CssNodeLike | null;
}

interface CssDeclarationLike extends CssNodeLike {
  prop: string;
  value: string;
}

function isInsideFontFace(declaration: CssDeclarationLike) {
  let parent = declaration.parent;
  while (parent) {
    if (parent.type === 'atrule' && parent.name?.toLowerCase() === 'font-face') return true;
    parent = parent.parent;
  }
  return false;
}

function weightKind(weight: number): FontWeightKind {
  if (weight < 500) return 'regular';
  if (weight < 700) return 'medium';
  return 'bold';
}

/**
 * 保留现代浏览器的原始字重，同时允许旧 Android WebView 用兼容变量收敛字重。
 *
 * 部分旧系统 WebView 在系统字体没有 550/600/650 等中间字重时，会直接向上
 * 匹配到 700，导致普通导航、按钮和正文辅助信息看起来全部加粗。运行时只有 APK
 * 会定义这些变量；普通浏览器变量不存在，继续使用第二参数中的原始字重。
 */
export function wrapAndroidFontWeightFallback(value: string, property: string) {
  if (property.trim().toLowerCase() !== 'font-weight' || value.includes(COMPAT_PROPERTY_PREFIX)) {
    return value;
  }

  const normalized = value.trim();
  if (!/^(?:1000(?:\.0+)?|(?:[1-9]\d{0,2})(?:\.\d+)?)$/u.test(normalized)) return value;

  const weight = Number(normalized);
  if (!Number.isFinite(weight) || weight < 1 || weight > 1000) return value;

  return `var(${COMPAT_PROPERTY_PREFIX}${weightKind(weight)}, ${normalized})`;
}

export default function androidFontWeightFallback() {
  return {
    postcssPlugin: 'light-note-android-font-weight-fallback',
    Declaration(declaration: CssDeclarationLike) {
      if (isInsideFontFace(declaration)) return;
      declaration.value = wrapAndroidFontWeightFallback(declaration.value, declaration.prop);
    },
  };
}
