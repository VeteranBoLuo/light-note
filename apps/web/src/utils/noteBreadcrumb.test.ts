import { describe, expect, it } from 'vitest';
import { buildNoteBreadcrumbDisplay } from './noteBreadcrumb';

const path = Array.from({ length: 6 }, (_, index) => ({ id: `n${index + 1}`, title: `第${index + 1}层` }));

describe('buildNoteBreadcrumbDisplay', () => {
  it('桌面深层路径保留虚拟根、最近父页面和当前页面', () => {
    expect(buildNoteBreadcrumbDisplay(path, false)).toEqual([
      { kind: 'root', key: 'root' },
      { kind: 'ellipsis', key: 'ellipsis' },
      { kind: 'note', key: 'note:n5', id: 'n5', title: '第5层' },
      { kind: 'note', key: 'note:n6', id: 'n6', title: '第6层' },
    ]);
  });

  it('移动端不显示虚拟根，深层路径保留首个真实祖先与当前页面', () => {
    expect(buildNoteBreadcrumbDisplay(path, true)).toEqual([
      { kind: 'note', key: 'note:n1', id: 'n1', title: '第1层' },
      { kind: 'ellipsis', key: 'ellipsis' },
      { kind: 'note', key: 'note:n6', id: 'n6', title: '第6层' },
    ]);
  });

  it('浅层路径完整显示并忽略重复或空 ID', () => {
    expect(
      buildNoteBreadcrumbDisplay(
        [
          { id: 'a', title: 'A' },
          { id: '', title: '空' },
          { id: 'a', title: '重复' },
          { id: 'b', title: 'B' },
        ],
        false,
      ),
    ).toEqual([
      { kind: 'root', key: 'root' },
      { kind: 'note', key: 'note:a', id: 'a', title: 'A' },
      { kind: 'note', key: 'note:b', id: 'b', title: 'B' },
    ]);
  });
});
