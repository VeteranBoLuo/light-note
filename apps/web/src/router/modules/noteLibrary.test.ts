import { describe, expect, it } from 'vitest';
import noteLibraryRouter from './noteLibrary';

describe('笔记库路由', () => {
  it('模板管理静态路由位于笔记详情通配路由之前', () => {
    const templateIndex = noteLibraryRouter.findIndex((route) => route.name === 'noteTemplateManage');
    const detailIndex = noteLibraryRouter.findIndex((route) => route.name === 'noteDetail');

    expect(templateIndex).toBeGreaterThan(-1);
    expect(detailIndex).toBeGreaterThan(templateIndex);
    expect(noteLibraryRouter[templateIndex]?.path).toBe('/noteLibrary/templates');
  });
});
