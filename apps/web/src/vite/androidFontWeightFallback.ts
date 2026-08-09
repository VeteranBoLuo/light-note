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
 * 保留桌面浏览器的原始字重，同时允许共享移动渲染基线收敛中间字重。
 *
 * 部分厂商系统 WebView 连 500 也会向上匹配成粗体，导致普通导航、按钮和正文
 * 辅助信息看起来全部加粗。移动浏览器与 App 都定义这些变量，并把 medium 与 regular
 * 解析为 400；桌面渲染基线不定义变量，继续使用第二参数中的原始字重。
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
