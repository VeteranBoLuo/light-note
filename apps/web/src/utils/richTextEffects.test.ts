import { describe, expect, it } from 'vitest';
import {
  applyTextGradientConfig,
  createTextGradientHtml,
  normalizeTextGradientColor,
  readTextGradientConfig,
  serializeTextGradientElement,
} from './richTextEffects';

describe('richTextEffects', () => {
  it('规范化短十六进制颜色并拒绝任意 CSS 值', () => {
    expect(normalizeTextGradientColor('#6ac')).toBe('#66aacc');
    expect(normalizeTextGradientColor('#615CED')).toBe('#615ced');
    expect(normalizeTextGradientColor('red')).toBeNull();
    expect(normalizeTextGradientColor('url(https://example.com/x)')).toBeNull();
  });

  it('生成只包含受控 class、标记与 CSS 变量的渐变文字', () => {
    expect(
      createTextGradientHtml('<strong>重点</strong>', {
        from: '#615ced',
        to: '#00a884',
        angle: '135deg',
      }),
    ).toBe(
      '<span class="ln-text-gradient" data-ln-text-gradient="true" style="--ln-gradient-from:#615ced;--ln-gradient-to:#00a884;--ln-gradient-angle:135deg"><strong>重点</strong></span>',
    );
  });

  it('读取、更新并序列化现有渐变文字时清理外层临时属性', () => {
    const element = document.createElement('span');
    element.className = 'ln-text-gradient extra';
    element.setAttribute('data-mce-style', 'temporary');
    element.style.fontWeight = 'bold';
    element.style.backgroundImage = 'url(https://example.com/not-allowed.png)';
    element.innerHTML = '<em>渐变</em>';
    expect(
      applyTextGradientConfig(element, {
        from: '#ff8a00',
        to: '#ec4899',
        angle: '45deg',
      }),
    ).toBe(true);
    expect(readTextGradientConfig(element)).toEqual({ from: '#ff8a00', to: '#ec4899', angle: '45deg' });
    expect(serializeTextGradientElement(element)).toBe(
      '<span class="ln-text-gradient" data-ln-text-gradient="true" style="--ln-gradient-from: #ff8a00; --ln-gradient-to: #ec4899; --ln-gradient-angle: 45deg; font-weight: bold;"><em>渐变</em></span>',
    );
    expect(serializeTextGradientElement(element)).not.toContain('background-image');
  });
});
