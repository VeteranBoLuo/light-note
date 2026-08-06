import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, h } from 'vue';
import { createI18n } from 'vue-i18n';
import ResourceTagChip from './ResourceTagChip.vue';

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function mountTag(
  props: Record<string, unknown> = {},
  listeners: { onClick?: (event: MouseEvent) => void; onDetail?: (event: MouseEvent) => void } = {},
) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    setup: () => () =>
      h(ResourceTagChip, {
        tag: { id: 'tag-1', name: '很长的项目标签' },
        ...props,
        ...listeners,
      }),
  });
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      messages: { 'zh-CN': { common: { detail: '详情' } } },
    }),
  );
  app.component('OriginalIcon', { render: () => h('span') });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

describe('ResourceTagChip', () => {
  it('非交互展示态使用粉色语义 BChip，并保留长标签 title 与 max-width', () => {
    const host = mountTag({ maxWidth: '88px', showHash: true });
    const chip = host.querySelector<HTMLElement>('.resource-tag-chip');
    expect(chip?.tagName).toBe('SPAN');
    expect(chip?.classList.contains('b-chip--tag')).toBe(true);
    expect(chip?.getAttribute('title')).toBe('很长的项目标签');
    expect(chip?.style.maxWidth).toBe('88px');
    expect(chip?.textContent).toContain('#很长的项目标签');
  });

  it('交互态使用按钮并只在点击时抛出 click', () => {
    const onClick = vi.fn();
    const host = mountTag({ interactive: true }, { onClick });
    host.querySelector<HTMLButtonElement>('button.resource-tag-chip')?.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('详情角标使用两个并列 BButton，不产生嵌套按钮，并区分 click/detail', () => {
    const onClick = vi.fn();
    const onDetail = vi.fn();
    const host = mountTag({ showDetailCorner: true }, { onClick, onDetail });
    expect(host.querySelector('button button')).toBeNull();

    host.querySelector<HTMLButtonElement>('.resource-tag-chip__label')?.click();
    host.querySelector<HTMLButtonElement>('.resource-tag-chip__detail')?.click();
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onDetail).toHaveBeenCalledTimes(1);
  });

  it('没有标签 ID 时不展示无效详情入口', () => {
    const host = mountTag({ tag: { name: '无 ID 标签' }, showDetailCorner: true });
    expect(host.querySelector('.resource-tag-chip__detail')).toBeNull();
  });
});
