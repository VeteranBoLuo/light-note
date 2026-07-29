const COMPAT_PROPERTY_PREFIX = '--ln-android-color-mix-';

type ColorMixKind = 'background' | 'border' | 'foreground' | 'shadow';

interface ParsedOperand {
  color: string;
  weight: number | null;
}

function splitTopLevel(value: string) {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '(') depth += 1;
    if (character === ')') depth = Math.max(0, depth - 1);
    if (character === ',' && depth === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  parts.push(value.slice(start).trim());
  return parts;
}

function parseOperand(value: string): ParsedOperand {
  const percentage = value.match(/\s+(-?\d*\.?\d+)%\s*$/);
  if (!percentage || percentage.index === undefined) {
    return { color: value.trim(), weight: null };
  }
  return {
    color: value.slice(0, percentage.index).trim(),
    weight: Number(percentage[1]),
  };
}

function declarationKind(property: string): ColorMixKind {
  const normalized = property.toLowerCase();
  if (normalized.includes('shadow') || normalized === 'filter') return 'shadow';
  if (normalized.includes('border') || normalized.includes('outline')) return 'border';
  if (normalized.includes('background') || normalized.endsWith('-bg') || normalized.includes('surface')) {
    return 'background';
  }
  return 'foreground';
}

function isTransparent(color: string) {
  return color.trim().toLowerCase() === 'transparent';
}

function selectFallbackOperand(first: ParsedOperand, second: ParsedOperand, kind: ColorMixKind) {
  let firstWeight = first.weight;
  let secondWeight = second.weight;
  if (firstWeight === null && secondWeight === null) {
    firstWeight = 50;
    secondWeight = 50;
  } else if (firstWeight === null) {
    firstWeight = Math.max(0, 100 - Number(secondWeight));
  } else if (secondWeight === null) {
    secondWeight = Math.max(0, 100 - firstWeight);
  }

  if (kind === 'shadow') return 'transparent';

  const firstTransparent = isTransparent(first.color);
  const secondTransparent = isTransparent(second.color);
  if (firstTransparent !== secondTransparent) {
    const visible = firstTransparent ? second : first;
    const visibleWeight = firstTransparent ? Number(secondWeight) : Number(firstWeight);
    if (kind === 'background' && visibleWeight < 50) return 'transparent';
    return visible.color;
  }

  return Number(firstWeight) > Number(secondWeight) ? first.color : second.color;
}

function literalCategory(color: string, kind: ColorMixKind) {
  const normalized = color.trim().toLowerCase();
  if (normalized === 'transparent') return 'transparent';
  if (normalized === 'white' || /^#f{3}(?:f{3})?$/.test(normalized)) return 'white';
  if (normalized === 'black' || /^#0{3}(?:0{3})?$/.test(normalized)) return 'black';
  if (/(?:f59e0b|f97316|ea580c|ca8a04|facc15)/.test(normalized)) return 'warning';
  if (/(?:ef4444|dc2626|d14343|e5484d)/.test(normalized)) return 'danger';
  if (/(?:34d399|22a447|16a34a|00a884)/.test(normalized)) return 'success';
  if (/(?:ec4899)/.test(normalized)) return 'tag';
  if (/(?:615ced|6366f1|7c3aed|8b5cf6|a78bfa|9b8cff|4b46cc|6861f0|756ff5)/.test(normalized)) {
    return 'primary';
  }
  if (kind === 'border') return 'border';
  if (kind === 'background') return 'background';
  if (kind === 'shadow') return 'transparent';
  return 'text';
}

function variableCategory(color: string, kind: ColorMixKind) {
  const variable = color.match(/^var\(\s*(--[\w-]+)/i)?.[1]?.toLowerCase();
  if (!variable) return literalCategory(color, kind);

  if (variable.includes('resource-bookmark')) return 'bookmark';
  if (variable.includes('resource-note')) return 'note';
  if (variable.includes('resource-file')) return 'file';
  if (variable.includes('resource-tag')) return 'tag';
  if (variable.includes('warning')) return 'warning';
  if (variable.includes('danger') || variable.includes('error')) return 'danger';
  if (variable.includes('success')) return 'success';
  if (/primary-btn-(?:h-)?bg/.test(variable)) return 'background';
  if (variable.includes('primary')) return 'primary';
  if (variable.includes('desc') || variable.includes('muted')) return 'muted';
  if (variable.includes('text') || variable.includes('foreground')) return 'text';
  if (variable.includes('common-tag-bg')) return 'tag-background';
  if (variable.includes('workspace-panel')) return 'panel-background';
  if (variable.includes('menu-body')) return 'menu-background';
  if (variable.includes('noborder-bg') || variable.includes('input-bg')) return 'input-background';
  if (variable.includes('card-background') || variable.includes('card-bg')) return 'card-background';
  if (variable.includes('background') || variable.includes('surface')) return 'background';
  if (variable.includes('border') || variable.includes('divider') || variable.includes('trail')) {
    return 'border';
  }
  if (variable.includes('accent')) {
    return kind === 'background' ? 'background' : 'primary';
  }
  return literalCategory(color, kind);
}

function fallbackCategory(colorMix: string, property: string) {
  const kind = declarationKind(property);
  const openParenthesis = colorMix.indexOf('(');
  const parts = splitTopLevel(colorMix.slice(openParenthesis + 1, -1));
  if (parts.length !== 3) {
    if (kind === 'shadow') return 'transparent';
    if (kind === 'foreground') return 'text';
    return kind;
  }
  const first = parseOperand(parts[1]);
  const second = parseOperand(parts[2]);
  return variableCategory(selectFallbackOperand(first, second, kind), kind);
}

export function wrapAndroidColorMixFallbacks(value: string, property: string) {
  if (!value.toLowerCase().includes('color-mix(') || value.includes(COMPAT_PROPERTY_PREFIX)) {
    return value;
  }

  const lowered = value.toLowerCase();
  let cursor = 0;
  let searchFrom = 0;
  let result = '';

  while (searchFrom < value.length) {
    const start = lowered.indexOf('color-mix(', searchFrom);
    if (start < 0) break;

    const parenthesisStart = value.indexOf('(', start);
    let depth = 0;
    let end = -1;
    for (let index = parenthesisStart; index < value.length; index += 1) {
      if (value[index] === '(') depth += 1;
      if (value[index] === ')') {
        depth -= 1;
        if (depth === 0) {
          end = index;
          break;
        }
      }
    }
    if (end < 0) break;

    const colorMix = value.slice(start, end + 1);
    const category = fallbackCategory(colorMix, property);
    result += value.slice(cursor, start);
    result += `var(${COMPAT_PROPERTY_PREFIX}${category}, ${colorMix})`;
    cursor = end + 1;
    searchFrom = end + 1;
  }

  return cursor === 0 ? value : result + value.slice(cursor);
}

export default function androidColorMixFallback() {
  return {
    postcssPlugin: 'light-note-android-color-mix-fallback',
    Declaration(declaration: { prop: string; value: string }) {
      declaration.value = wrapAndroidColorMixFallbacks(declaration.value, declaration.prop);
    },
  };
}
