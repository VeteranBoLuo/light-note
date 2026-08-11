import { describe, expect, it } from 'vitest';
import { prepareMaskedIconsForCanvas } from './canvasExport';

describe('prepareMaskedIconsForCanvas', () => {
  it('把 currentColor CSS mask 转成 html2canvas 可绘制的普通背景图', () => {
    const root = document.createElement('div');
    const maskedIcon = document.createElement('div');
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path stroke="currentColor" d="M0 0h8"/></svg>';
    const source = `data:image/svg+xml;base64,${window.btoa(svg)}`;
    maskedIcon.className = 'icon-base64';
    maskedIcon.style.color = 'rgb(245, 246, 251)';
    maskedIcon.style.setProperty('--src', `url("${source}")`);
    maskedIcon.style.setProperty('mask-image', `url("${source}")`);
    root.append(maskedIcon);

    prepareMaskedIconsForCanvas(root, window);

    expect(maskedIcon.dataset.canvasExportIcon).toBe('ready');
    expect(maskedIcon.style.maskImage).toBe('none');
    expect(maskedIcon.style.backgroundColor).toBe('transparent');
    expect(maskedIcon.style.backgroundImage).toBe('none');
    expect(maskedIcon.querySelector('svg')?.getAttribute('width')).toBe('100%');
    expect(maskedIcon.querySelector('svg')?.getAttribute('height')).toBe('100%');
    expect(maskedIcon.querySelector('path')?.getAttribute('stroke')).toBe('rgb(245, 246, 251)');
  });

  it('忽略损坏或非 SVG 的 mask，不破坏原元素', () => {
    const root = document.createElement('div');
    const maskedIcon = document.createElement('div');
    maskedIcon.className = 'icon-base64';
    maskedIcon.style.setProperty('--src', 'url("data:image/png;base64,broken")');
    root.append(maskedIcon);

    prepareMaskedIconsForCanvas(root, window);

    expect(maskedIcon.dataset.canvasExportIcon).toBeUndefined();
    expect(maskedIcon.style.backgroundImage).toBe('');
  });
});
