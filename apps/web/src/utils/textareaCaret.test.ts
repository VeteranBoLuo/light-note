import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTextareaCaretRect, toAnchorOffset } from './textareaCaret';

describe('textareaCaret', () => {
  afterEach(() => {
    document.documentElement.style.zoom = '';
    vi.restoreAllMocks();
  });

  it('镜像、滚动量与定位父级共用 CSS 像素', () => {
    const textarea = document.createElement('textarea');
    textarea.value = '说明 @codex';
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    Object.defineProperties(textarea, {
      offsetWidth: { configurable: true, value: 300 },
      scrollLeft: { configurable: true, value: 8 },
      scrollTop: { configurable: true, value: 4 },
    });
    const container = document.createElement('div');
    document.body.append(container, textarea);
    let mirrorPosition: { left: string; top: string } | null = null;

    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      if (this === textarea) return { left: 50, top: 100 } as DOMRect;
      if (this === container) return { left: 50, top: 100 } as DOMRect;
      if (this instanceof HTMLSpanElement && this.textContent === '​') {
        mirrorPosition = { left: this.parentElement?.style.left || '', top: this.parentElement?.style.top || '' };
        return { left: 120, top: 150, height: 25 } as DOMRect;
      }
      return { left: 0, top: 0, height: 0 } as DOMRect;
    });

    const caret = getTextareaCaretRect(textarea);
    const offset = toAnchorOffset(caret, container);

    expect(mirrorPosition).toEqual({ left: '50px', top: '100px' });
    expect(caret).toEqual({ left: 112, top: 146, height: 25 });
    expect(offset).toEqual({ left: 62, top: 46, lineHeight: 25 });

    container.remove();
    textarea.remove();
  });
});
