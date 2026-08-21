import { describe, expect, it } from 'vitest';
import { resolveNoteDetailReturnPath, resolveNoteLibraryListPath } from './noteDetailNavigation';

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

  it('清除误带回列表的 from，避免下一次打开正文继续递归嵌套', () => {
    expect(
      resolveNoteLibraryListPath(
        `/noteLibrary?parent=project&from=${encodeURIComponent('/noteLibrary?parent=old')}&view=list`,
      ),
    ).toBe('/noteLibrary?parent=project&view=list');
  });

  it.each(['https://example.com/noteLibrary', '//example.com/noteLibrary', '/noteLibrary-copy', '/search'])(
    '拒绝非笔记库内部地址：%s',
    (path) => {
      expect(resolveNoteLibraryListPath(path)).toBe('');
    },
  );
});

describe('resolveNoteDetailReturnPath', () => {
  it('允许今日与工作台作为明确来源并保留查询参数', () => {
    expect(resolveNoteDetailReturnPath('/workbenches?panel=recent#continue')).toBe(
      '/workbenches?panel=recent#continue',
    );
  });

  it('在详情页之间切换后仍解析到最初的工作台来源', () => {
    const parent = `/noteLibrary/parent?from=${encodeURIComponent('/workbenches')}`;
    const child = `/noteLibrary/child?from=${encodeURIComponent(parent)}`;
    expect(resolveNoteDetailReturnPath(child)).toBe('/workbenches');
  });

  it.each(['/search', '/inbox', 'https://example.com/workbenches', '//example.com/workbenches'])(
    '拒绝未授权的返回来源：%s',
    (path) => {
      expect(resolveNoteDetailReturnPath(path)).toBe('');
    },
  );
});
