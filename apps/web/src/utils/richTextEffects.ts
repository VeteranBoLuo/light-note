export const DEFAULT_TEXT_GRADIENT = Object.freeze({
  from: '#615ced',
  to: '#00a884',
  angle: '90deg',
});

export const TEXT_GRADIENT_ANGLES = [
  '0deg',
  '45deg',
  '90deg',
  '135deg',
  '180deg',
  '225deg',
  '270deg',
  '315deg',
] as const;

export type TextGradientAngle = (typeof TEXT_GRADIENT_ANGLES)[number];

export interface TextGradientConfig {
  from: string;
  to: string;
  angle: TextGradientAngle;
}

const SAFE_TEXT_STYLE_PATTERNS = Object.freeze({
  'font-family': /^[\p{L}\p{N}\s,'"_-]{1,80}$/u,
  'font-size': /^(?:\d+(?:\.\d+)?)(?:px|pt|em|rem|%)$/u,
  'font-style': /^(?:normal|italic|oblique)$/u,
  'font-weight': /^(?:normal|bold|[1-9]00)$/u,
  'letter-spacing': /^(?:normal|-?\d+(?:\.\d+)?(?:px|em|rem))$/u,
  'line-height': /^(?:normal|\d+(?:\.\d+)?(?:px|em|rem|%)?)$/u,
  'text-align': /^(?:left|right|center|justify|start|end)$/u,
  'text-decoration': /^(?:none|underline|line-through)(?:\s+(?:underline|line-through))*$/u,
});

export function normalizeTextGradientColor(value: unknown): string | null {
  const input = String(value || '')
    .trim()
    .toLowerCase();
  const short = input.match(/^#([0-9a-f]{3})$/u);
  if (short) return `#${[...short[1]].map((char) => char.repeat(2)).join('')}`;
  return /^#[0-9a-f]{6}$/u.test(input) ? input : null;
}

export function normalizeTextGradientAngle(value: unknown): TextGradientAngle | null {
  const input = String(value || '')
    .trim()
    .toLowerCase();
  return TEXT_GRADIENT_ANGLES.includes(input as TextGradientAngle) ? (input as TextGradientAngle) : null;
}

export function normalizeTextGradientConfig(input: Partial<TextGradientConfig>): TextGradientConfig | null {
  const from = normalizeTextGradientColor(input.from);
  const to = normalizeTextGradientColor(input.to);
  const angle = normalizeTextGradientAngle(input.angle);
  return from && to && angle ? { from, to, angle } : null;
}

export function readTextGradientConfig(element: Element | null): TextGradientConfig | null {
  if (!(element instanceof HTMLElement) || !element.classList.contains('ln-text-gradient')) return null;
  return normalizeTextGradientConfig({
    from: element.style.getPropertyValue('--ln-gradient-from'),
    to: element.style.getPropertyValue('--ln-gradient-to'),
    angle: element.style.getPropertyValue('--ln-gradient-angle') as TextGradientAngle,
  });
}

export function applyTextGradientConfig(element: HTMLElement, config: TextGradientConfig) {
  const normalized = normalizeTextGradientConfig(config);
  if (!normalized) return false;
  element.classList.add('ln-text-gradient');
  element.setAttribute('data-ln-text-gradient', 'true');
  element.style.setProperty('--ln-gradient-from', normalized.from);
  element.style.setProperty('--ln-gradient-to', normalized.to);
  element.style.setProperty('--ln-gradient-angle', normalized.angle);
  return true;
}

export function createTextGradientHtml(content: string, config: TextGradientConfig) {
  const normalized = normalizeTextGradientConfig(config);
  if (!normalized) return null;
  return `<span class="ln-text-gradient" data-ln-text-gradient="true" style="--ln-gradient-from:${normalized.from};--ln-gradient-to:${normalized.to};--ln-gradient-angle:${normalized.angle}">${content}</span>`;
}

export function serializeTextGradientElement(element: HTMLElement) {
  const config = readTextGradientConfig(element);
  if (!config) return null;
  const clone = element.cloneNode(true) as HTMLElement;
  const preservedStyles = Object.entries(SAFE_TEXT_STYLE_PATTERNS).flatMap(([property, pattern]) => {
    const value = clone.style.getPropertyValue(property).trim().toLowerCase();
    return value && pattern.test(value) ? [[property, value] as const] : [];
  });
  clone.getAttributeNames().forEach((name) => clone.removeAttribute(name));
  applyTextGradientConfig(clone, config);
  preservedStyles.forEach(([property, value]) => clone.style.setProperty(property, value));
  return clone.outerHTML;
}
