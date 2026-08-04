import { afterEach, describe, expect, it } from 'vitest';
import { createApp, h } from 'vue';
import BProgress from './BProgress.vue';

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function mount(props: Record<string, unknown>) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(BProgress, props) });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

describe('BProgress', () => {
  it('把越界与非法百分比夹取到 0–100，评分统计口径异常时不画出界', () => {
    expect(mount({ percent: 140 }).querySelector<HTMLElement>('.b-progress__bar')!.style.width).toBe('100%');
    cleanup?.();
    expect(mount({ percent: -20 }).querySelector<HTMLElement>('.b-progress__bar')!.style.width).toBe('0%');
    cleanup?.();
    expect(mount({ percent: Number.NaN }).querySelector<HTMLElement>('.b-progress__bar')!.style.width).toBe('0%');
    cleanup?.();
    // 小数四舍五入，避免 width 出现长尾小数
    expect(mount({ percent: 42.6 }).querySelector<HTMLElement>('.b-progress__bar')!.style.width).toBe('43%');
  });

  it('按阈值取色与自定义底色都生效', () => {
    const host = mount({ percent: 80, strokeColor: 'rgb(220, 38, 38)', trailColor: 'rgb(1, 2, 3)' });
    expect(host.querySelector<HTMLElement>('.b-progress__bar')!.style.background).toContain('rgb(220, 38, 38)');
    expect(host.querySelector<HTMLElement>('.b-progress__trail')!.style.background).toContain('rgb(1, 2, 3)');
  });

  it('默认不显示数值，showInfo 打开后显示夹取后的整数', () => {
    expect(mount({ percent: 30 }).querySelector('.b-progress__info')).toBeNull();
    cleanup?.();
    expect(mount({ percent: 130, showInfo: true }).querySelector('.b-progress__info')!.textContent).toBe('100%');
  });

  it('暴露 progressbar 语义与取值范围，供读屏软件识别', () => {
    const el = mount({ percent: 55, ariaLabel: '风险评分 55' }).querySelector('.b-progress')!;
    expect(el.getAttribute('role')).toBe('progressbar');
    expect(el.getAttribute('aria-valuenow')).toBe('55');
    expect(el.getAttribute('aria-valuemin')).toBe('0');
    expect(el.getAttribute('aria-valuemax')).toBe('100');
    expect(el.getAttribute('aria-label')).toBe('风险评分 55');
    // 未显式给 title 时回退为数值，鼠标悬停仍可读出精确分数
    expect(el.getAttribute('title')).toBe('55');
  });
});
