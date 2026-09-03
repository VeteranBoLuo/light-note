import { describe, expect, it } from 'vitest';
import {
  resolveDeletedNoteFallbackId,
  resolveNoteDetailReturnPath,
  resolveNoteLibraryListPath,
} from './noteDetailNavigation';

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
  it('允许工作台作为明确来源并保留查询参数', () => {
    expect(resolveNoteDetailReturnPath('/workbenches?panel=recent#continue')).toBe(
      '/workbenches?panel=recent#continue',
    );
  });

  it('允许整理中心作为明确来源并保留当前问题视图', () => {
    expect(resolveNoteDetailReturnPath('/organize?issue=knowledge_structure')).toBe(
      '/organize?issue=knowledge_structure',
    );
  });

  it('允许待办作为明确来源并保留页签与目标参数', () => {
    expect(resolveNoteDetailReturnPath('/inbox?tab=todo&todoId=todo-1')).toBe(
      '/inbox?tab=todo&todoId=todo-1',
    );
  });

  it('允许知识结构完整整理页作为明确来源', () => {
    expect(resolveNoteDetailReturnPath('/toolbox/knowledge_structure_audit')).toBe(
      '/toolbox/knowledge_structure_audit',
    );
  });

  it('允许具体工具任务作为明确来源，但拒绝模糊的工具入口', () => {
    expect(resolveNoteDetailReturnPath('/toolbox/task/job-1?tab=output#result')).toBe(
      '/toolbox/task/job-1?tab=output#result',
    );
    expect(resolveNoteDetailReturnPath('/toolbox')).toBe('');
    expect(resolveNoteDetailReturnPath('/toolbox/material_to_note')).toBe('');
    expect(resolveNoteDetailReturnPath('/toolbox/task/job-1/extra')).toBe('');
  });

  it('在详情页之间切换后仍解析到最初的工作台来源', () => {
    const parent = `/noteLibrary/parent?from=${encodeURIComponent('/workbenches')}`;
    const child = `/noteLibrary/child?from=${encodeURIComponent(parent)}`;
    expect(resolveNoteDetailReturnPath(child)).toBe('/workbenches');
  });

  it('从工具结果进入后，即使在笔记树中切换页面也保留原任务来源', () => {
    const source = '/toolbox/task/job-1?tab=output';
    const parent = `/noteLibrary/parent?from=${encodeURIComponent(source)}`;
    const child = `/noteLibrary/child?from=${encodeURIComponent(parent)}`;
    expect(resolveNoteDetailReturnPath(child)).toBe(source);
  });

  it.each(['/search', '/organize/other', 'https://example.com/workbenches', '//example.com/workbenches'])(
    '拒绝未授权的返回来源：%s',
    (path) => {
      expect(resolveNoteDetailReturnPath(path)).toBe('');
    },
  );
});

describe('resolveDeletedNoteFallbackId', () => {
  const siblings = [{ id: 'before' }, { id: 'current' }, { id: 'after' }];

  it('优先选择同级下一篇，没有下一篇时选择上一篇', () => {
    expect(resolveDeletedNoteFallbackId({ currentId: 'current', parentId: 'parent', siblings })).toBe('after');
    expect(resolveDeletedNoteFallbackId({ currentId: 'after', parentId: 'parent', siblings })).toBe('current');
  });

  it('没有其他同级页面时选择父页面，根页面则回笔记库', () => {
    expect(
      resolveDeletedNoteFallbackId({ currentId: 'current', parentId: 'parent', siblings: [{ id: 'current' }] }),
    ).toBe('parent');
    expect(resolveDeletedNoteFallbackId({ currentId: 'current', siblings: [{ id: 'current' }] })).toBe('');
  });

  it('目录缓存尚未包含当前页时，仍选择一个可见同级页面', () => {
    expect(resolveDeletedNoteFallbackId({ currentId: 'missing', parentId: 'parent', siblings })).toBe('before');
  });
});
