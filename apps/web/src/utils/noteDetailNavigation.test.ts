import { describe, expect, it } from 'vitest';
import { resolveNoteLibraryListPath } from './noteDetailNavigation';

describe('resolveNoteLibraryListPath', () => {
  it('保留笔记库列表的目录、标签与视图查询参数', () => {
    expect(resolveNoteLibraryListPath('/noteLibrary?parent=project&view=list#results')).toBe(
      '/noteLibrary?parent=project&view=list#results',
    );
  });

  it('兼容旧详情页层层嵌套的 from，并只返回最初列表地址', () => {
    const library = '/noteLibrary?parent=project';
    const parent = `/noteLibrary/parent?from=${encodeURIComponent(library)}`;
    const child = `/noteLibrary/child?from=${encodeURIComponent(parent)}`;

    expect(resolveNoteLibraryListPath(child)).toBe(library);
  });

  it.each(['https://example.com/noteLibrary', '//example.com/noteLibrary', '/noteLibrary-copy', '/search'])(
    '拒绝非笔记库内部地址：%s',
    (path) => {
      expect(resolveNoteLibraryListPath(path)).toBe('');
    },
  );
});
