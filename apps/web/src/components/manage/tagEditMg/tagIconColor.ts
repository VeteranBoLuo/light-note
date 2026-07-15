export const DEFAULT_TAG_ICON_COLOR = 'currentColor';

export const TAG_ICON_COLOR_OPTIONS = [
  '#EC4899',
  '#615CED',
  '#2563EB',
  '#0891B2',
  '#00A884',
  '#F59E0B',
  '#F97316',
  '#EF4444',
] as const;

const COLOR_MARKER_PATTERN = /\sdata-light-note-color=(['"])(currentColor|#[0-9a-f]{6})\1/i;
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

export type HsvColor = {
  h: number;
  s: number;
  v: number;
};

type SvgSource = {
  svg: string;
  format: 'raw' | 'base64';
};

function decodeSvgSource(value: string): SvgSource | null {
  const source = String(value || '').trim();
  if (source.includes('<svg')) return { svg: source, format: 'raw' };

  const prefix = 'data:image/svg+xml;base64,';
  if (!source.toLowerCase().startsWith(prefix)) return null;
  try {
    const binary = atob(source.slice(prefix.length));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return { svg: new TextDecoder().decode(bytes), format: 'base64' };
  } catch {
    return null;
  }
}

function encodeSvgSource(source: SvgSource) {
  if (source.format === 'raw') return source.svg;
  const bytes = new TextEncoder().encode(source.svg);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function hexToHsv(value: string): HsvColor {
  const normalized = HEX_COLOR_PATTERN.test(value) ? value.slice(1) : '615CED';
  const r = Number.parseInt(normalized.slice(0, 2), 16) / 255;
  const g = Number.parseInt(normalized.slice(2, 4), 16) / 255;
  const b = Number.parseInt(normalized.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max ? delta / max : 0, v: max };
}

export function hsvToHex({ h, s, v }: HsvColor): string {
  const hue = ((h % 360) + 360) % 360;
  const saturation = clamp(s, 0, 1);
  const value = clamp(v, 0, 1);
  const chroma = value * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const offset = value - chroma;
  const segments = [
    [chroma, x, 0],
    [x, chroma, 0],
    [0, chroma, x],
    [0, x, chroma],
    [x, 0, chroma],
    [chroma, 0, x],
  ];
  const [r, g, b] = segments[Math.floor(hue / 60) % 6];
  return `#${[r, g, b]
    .map((channel) =>
      Math.round((channel + offset) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`.toUpperCase();
}

export function getTagIconColor(value: string): string | null {
  const source = decodeSvgSource(value);
  if (!source) return null;
  const marker = source.svg.match(COLOR_MARKER_PATTERN)?.[2];
  if (marker) return marker === DEFAULT_TAG_ICON_COLOR ? DEFAULT_TAG_ICON_COLOR : marker.toUpperCase();
  return /currentColor/i.test(source.svg) ? DEFAULT_TAG_ICON_COLOR : null;
}

export function applyTagIconColor(value: string, color: string): string {
  const source = decodeSvgSource(value);
  if (!source) return value;

  const targetColor = color === DEFAULT_TAG_ICON_COLOR ? DEFAULT_TAG_ICON_COLOR : color.toUpperCase();
  if (targetColor !== DEFAULT_TAG_ICON_COLOR && !HEX_COLOR_PATTERN.test(targetColor)) return value;

  const previousColor = source.svg.match(COLOR_MARKER_PATTERN)?.[2];
  let svg = source.svg.replace(COLOR_MARKER_PATTERN, '');
  if (previousColor && HEX_COLOR_PATTERN.test(previousColor)) {
    svg = svg.replace(new RegExp(escapeRegExp(previousColor), 'gi'), DEFAULT_TAG_ICON_COLOR);
  }
  if (!/currentColor/i.test(svg)) return value;

  if (targetColor !== DEFAULT_TAG_ICON_COLOR) {
    svg = svg.replace(/currentColor/gi, targetColor);
  }
  svg = svg.replace('<svg', `<svg data-light-note-color="${targetColor}"`);
  return encodeSvgSource({ ...source, svg });
}
