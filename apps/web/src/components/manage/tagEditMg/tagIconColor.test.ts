import { describe, expect, it } from 'vitest';
import { applyTagIconColor, DEFAULT_TAG_ICON_COLOR, getTagIconColor, hexToHsv, hsvToHex } from './tagIconColor';

function toDataUrl(svg: string) {
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

function fromDataUrl(value: string) {
  return atob(value.split(',')[1]);
}

describe('tagIconColor', () => {
  it('默认保留 currentColor，并可固化为指定颜色', () => {
    const source = toDataUrl('<svg><path fill="currentColor" /></svg>');
    const colored = applyTagIconColor(source, '#2563EB');

    expect(getTagIconColor(source)).toBe(DEFAULT_TAG_ICON_COLOR);
    expect(getTagIconColor(colored)).toBe('#2563EB');
    expect(fromDataUrl(colored)).toContain('fill="#2563EB"');
  });

  it('固定颜色可以切换并恢复为 currentColor', () => {
    const source = toDataUrl('<svg><path fill="currentColor" stroke="currentColor" /></svg>');
    const blue = applyTagIconColor(source, '#2563EB');
    const green = applyTagIconColor(blue, '#00A884');
    const restored = applyTagIconColor(green, DEFAULT_TAG_ICON_COLOR);

    expect(fromDataUrl(green)).toContain('fill="#00A884"');
    expect(fromDataUrl(green)).not.toContain('#2563EB');
    expect(getTagIconColor(restored)).toBe(DEFAULT_TAG_ICON_COLOR);
    expect(fromDataUrl(restored)).toContain('fill="currentColor"');
    expect(fromDataUrl(restored)).toContain('stroke="currentColor"');
  });

  it('普通图片和不可换色 SVG 保持原样', () => {
    const image = 'https://example.com/icon.png';
    const fixedSvg = toDataUrl('<svg><path fill="#123456" /></svg>');

    expect(applyTagIconColor(image, '#2563EB')).toBe(image);
    expect(applyTagIconColor(fixedSvg, '#2563EB')).toBe(fixedSvg);
    expect(getTagIconColor(fixedSvg)).toBeNull();
  });

  it('自定义颜色在 HEX 与 HSV 之间稳定转换', () => {
    expect(hsvToHex(hexToHsv('#3A7BD5'))).toBe('#3A7BD5');
    expect(hsvToHex({ h: 0, s: 1, v: 1 })).toBe('#FF0000');
  });
});
