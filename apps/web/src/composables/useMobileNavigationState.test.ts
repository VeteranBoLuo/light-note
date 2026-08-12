import { afterEach, describe, expect, it } from 'vitest';
import { resetMobileScrollElement, useMobileNavigationState } from './useMobileNavigationState';

afterEach(() => {
  document.body.innerHTML = '';
  sessionStorage.clear();
});

describe('useMobileNavigationState', () => {
  it('可以重置成长页等内部分段共用的显式滚动容器', () => {
    const scroll = document.createElement('div');
    scroll.scrollTop = 420;

    expect(resetMobileScrollElement(scroll)).toBe(true);
    expect(scroll.scrollTop).toBe(0);
    expect(resetMobileScrollElement(null)).toBe(false);
  });

  it('资料 Tab 继续恢复各自已有的滚动位置', () => {
    const scroll = document.createElement('div');
    scroll.dataset.mobileResourceScroll = '';
    scroll.getClientRects = () => [{ width: 320, height: 600 }] as unknown as DOMRectList;
    document.body.append(scroll);

    const { restoreResourceScroll, saveResourceScroll } = useMobileNavigationState();
    scroll.scrollTop = 268;
    saveResourceScroll('/home');

    scroll.scrollTop = 0;
    expect(restoreResourceScroll('/home')).toBe(true);
    expect(scroll.scrollTop).toBe(268);
  });

  it('笔记库交给页面按列表范围恢复，移动壳不会把它反复归零', () => {
    const scroll = document.createElement('div');
    scroll.dataset.mobileResourceScroll = '';
    scroll.getClientRects = () => [{ width: 320, height: 600 }] as unknown as DOMRectList;
    document.body.append(scroll);

    const { restoreResourceScroll, saveResourceScroll } = useMobileNavigationState();
    scroll.scrollTop = 420;
    saveResourceScroll('/noteLibrary');

    scroll.scrollTop = 135;
    expect(restoreResourceScroll('/noteLibrary')).toBe(true);
    expect(scroll.scrollTop).toBe(135);
  });
});
