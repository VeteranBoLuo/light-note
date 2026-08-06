import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const themeSource = readFileSync(resolve(process.cwd(), 'src/assets/css/theme.less'), 'utf8');
const dayStart = themeSource.indexOf("\n[data-theme='day'] {");
const nightStart = themeSource.indexOf("\n[data-theme='night'] {");
const themeBlocks = {
  day: themeSource.slice(dayStart, nightStart),
  night: themeSource.slice(nightStart),
};

const expected = {
  day: {
    'chip-tag-fg': '#b42365',
    'chip-tag-bg': '#fdf0f6',
    'chip-tag-border': '#f5c7dc',
    'chip-tag-hover-fg': '#8f174f',
    'chip-tag-hover-bg': '#f9d9e8',
    'chip-pin-fg': '#5146d9',
    'chip-pin-bg': '#eeecff',
    'chip-pin-border': '#d9d4ff',
    'chip-pending-fg': '#8a4b00',
    'chip-pending-bg': '#fff3df',
    'chip-pending-border': '#f3d4a1',
    'chip-neutral-fg': '#65656e',
    'chip-neutral-bg': '#f0f0f0',
    'chip-neutral-border': '#e4e4e7',
  },
  night: {
    'chip-tag-fg': '#ff8ec3',
    'chip-tag-bg': '#4a2538',
    'chip-tag-border': '#6d3350',
    'chip-tag-hover-fg': '#ffc0dd',
    'chip-tag-hover-bg': '#5b2b43',
    'chip-pin-fg': '#aaa6ff',
    'chip-pin-bg': '#38335f',
    'chip-pin-border': '#575083',
    'chip-pending-fg': '#ffc56a',
    'chip-pending-bg': '#4a3521',
    'chip-pending-border': '#6a4b28',
    'chip-neutral-fg': '#a7adba',
    'chip-neutral-bg': '#343a45',
    'chip-neutral-border': '#464d59',
  },
} as const;

function tokenValue(block: string, name: string) {
  return block.match(new RegExp(`--${name}\\s*:\\s*([^;]+);`))?.[1]?.trim();
}

function relativeLuminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((value) => Number.parseInt(value, 16) / 255)
    .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(foreground: string, background: string) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
}

describe('资源胶囊主题 Token', () => {
  it.each(['day', 'night'] as const)('%s 主题完整且使用规范给定的稳定实色', (theme) => {
    for (const [name, value] of Object.entries(expected[theme])) {
      expect(tokenValue(themeBlocks[theme], name), name).toBe(value);
    }

    const coreTokenSource = Object.keys(expected[theme])
      .map((name) => tokenValue(themeBlocks[theme], name))
      .join(' ');
    expect(coreTokenSource).not.toContain('color-mix');
    expect(tokenValue(themeBlocks[theme], 'chip-neutral-color')).toBe('var(--chip-neutral-fg)');
  });

  it.each(['day', 'night'] as const)('%s 主题的小字号胶囊文字均达到 WCAG AA 4.5:1', (theme) => {
    const tokens = expected[theme];
    const pairs = [
      ['chip-tag-fg', 'chip-tag-bg'],
      ['chip-tag-hover-fg', 'chip-tag-hover-bg'],
      ['chip-pin-fg', 'chip-pin-bg'],
      ['chip-pending-fg', 'chip-pending-bg'],
      ['chip-neutral-fg', 'chip-neutral-bg'],
    ] as const;

    for (const [foreground, background] of pairs) {
      expect(contrastRatio(tokens[foreground], tokens[background]), `${foreground}/${background}`).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });
});
