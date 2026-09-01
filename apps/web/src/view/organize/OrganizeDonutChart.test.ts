import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp, h } from 'vue';
import OrganizeDonutChart from './OrganizeDonutChart.vue';

const source = readFileSync(resolve(process.cwd(), 'src/view/organize/OrganizeDonutChart.vue'), 'utf8');

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function mountChart(props: Record<string, unknown>) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(OrganizeDonutChart, props) });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

describe('OrganizeDonutChart', () => {
  it('隐藏 SVG 语义，并用可见文本图例呈现名称、数量和百分比', () => {
    const host = mountChart({
      total: 10,
      centerLabel: '待整理',
      ariaLabel: '待整理类型构成，共 10 项',
      items: [
        { key: 'bookmark', label: '书签', value: 5, color: '#615ced' },
        { key: 'note', label: '笔记', value: 3, color: '#00a884' },
        { key: 'file', label: '文件', value: 2, color: '#ff8a00' },
      ],
    });

    const svg = host.querySelector('svg');
    expect(host.querySelector('figure')?.getAttribute('aria-label')).toBe('待整理类型构成，共 10 项');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.getAttribute('focusable')).toBe('false');
    expect(host.querySelectorAll('.organize-donut-chart__segment')).toHaveLength(3);
    expect(host.querySelectorAll('.organize-donut-chart__legend-item')).toHaveLength(3);
    expect(host.textContent).toContain('待整理');
    expect(host.textContent).toContain('书签');
    expect(host.textContent).toContain('50%');
    expect(host.textContent).toContain('30%');
    expect(host.textContent).toContain('20%');
  });

  it('总数为零或分项缺失时显示空态，且不会产生无效 SVG 数值', () => {
    const host = mountChart({
      total: null,
      centerLabel: '检测覆盖',
      emptyLabel: '暂无数据',
      items: [
        { key: 'missing', label: '缺失', value: Number.NaN, color: '' },
        { key: 'negative', label: '负数', value: -12, color: '#ef4444' },
      ],
    });

    expect(host.querySelectorAll('.organize-donut-chart__segment')).toHaveLength(0);
    expect(host.querySelector('.organize-donut-chart')?.classList.contains('organize-donut-chart--empty')).toBe(true);
    expect(host.textContent).toContain('暂无数据');
    expect(host.textContent).toContain('0%');
    expect(host.innerHTML).not.toMatch(/NaN|Infinity/);
  });

  it('分项超过传入总数或出现超大数时，以安全分母归一化且环段不超过一圈', () => {
    const host = mountChart({
      total: 1,
      items: [
        { key: 'first', label: '第一项', value: Number.MAX_VALUE, color: '#615ced' },
        { key: 'second', label: '第二项', value: Number.MAX_VALUE, color: '#00a884' },
        { key: 'invalid', label: '无效项', value: Number.POSITIVE_INFINITY, color: '#ff8a00' },
      ],
    });

    const segments = Array.from(host.querySelectorAll<SVGCircleElement>('.organize-donut-chart__segment'));
    expect(segments).toHaveLength(2);
    expect(segments.map((segment) => segment.style.strokeDasharray)).toEqual(['50 50', '50 50']);
    expect(segments.map((segment) => segment.style.strokeDashoffset)).toEqual(['0', '-50']);
    expect(host.textContent).toContain('50%');
    expect(host.innerHTML).not.toMatch(/NaN|Infinity/);
  });

  it('允许调用方覆盖中心值，图例仍保留真实数量', () => {
    const host = mountChart({
      total: 232,
      centerLabel: '已检测',
      centerValue: '67 / 232',
      items: [{ key: 'checked', label: '已检测', value: 67, color: 'var(--primary-color)' }],
    });

    expect(host.querySelector('.organize-donut-chart__center strong')?.textContent).toBe('67 / 232');
    expect(host.querySelector('.organize-donut-chart__legend-value')?.textContent).toContain('67');
  });

  it('样式只依赖共享主题表面，并在减少动态效果时关闭环段过渡', () => {
    expect(source).toContain('var(--text-color)');
    expect(source).toContain('var(--desc-color)');
    expect(source).toContain('var(--surface-divider-color');
    expect(source).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?transition: none/);
  });
});
