import { describe, expect, it } from 'vitest';
import { normalizeTagIconValue } from '@/utils/tagIcon';

describe('normalizeTagIconValue', () => {
  it('将包含中文的 SVG 转为 UTF-8 Base64 Data URL', () => {
    const result = normalizeTagIconValue('<svg><text>标签</text></svg>');
    expect(result).toMatch(/^data:image\/svg\+xml;base64,/);
    const encoded = result.split(',')[1];
    expect(new TextDecoder().decode(Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0)))).toBe(
      '<svg><text>标签</text></svg>',
    );
  });

  it('为裸 Base64 补全 SVG Data URL 前缀', () => {
    const base64 = 'A'.repeat(68);
    expect(normalizeTagIconValue(base64)).toBe(`data:image/svg+xml;base64,${base64}`);
  });

  it('保留已有 Data URL 与历史图片地址', () => {
    expect(normalizeTagIconValue('data:image/png;base64,abc')).toBe('data:image/png;base64,abc');
    expect(normalizeTagIconValue('https://example.com/icon.png')).toBe('https://example.com/icon.png');
  });
});
