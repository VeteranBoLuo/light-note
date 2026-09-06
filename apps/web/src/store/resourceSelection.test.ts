import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useResourceSelectionStore, resourceSelectionKey } from './resourceSelection';

describe('resource selection session', () => {
  beforeEach(() => setActivePinia(createPinia()));
  const item = (id: string, type: 'note' | 'file' = 'note') => ({ id, type, title: id });
  it('跨目录累积，当前列表取消全选只移除交集', () => {
    const s = useResourceSelectionStore();
    s.start('notes', 'user');
    s.setVisible([item('a'), item('b')], true);
    s.setVisible([item('c'), item('d'), item('e')], true);
    expect(s.items).toHaveLength(5);
    s.refreshItems([item('a')]);
    expect(s.items).toHaveLength(5);
    s.setVisible([item('c'), item('d'), item('e')], false);
    expect(s.items.map(resourceSelectionKey)).toEqual(['note:a', 'note:b']);
  });
  it('资源类型隔离、去重、快照脱离列表且不保存正文及下载地址', () => {
    const s = useResourceSelectionStore();
    s.start('search', 'user');
    const raw = { ...item('1'), content: 'private', fileUrl: 'signed', title: 'old' };
    s.setItems([raw, item('1', 'file'), raw]);
    raw.title = 'new';
    expect(s.items).toHaveLength(2);
    expect(s.items[0]).toMatchObject({ title: 'old' });
    expect(s.items[0]).not.toHaveProperty('content');
    expect(s.items[0]).not.toHaveProperty('fileUrl');
  });
  it('超限整体拒绝，不截断、不覆盖原选择', () => {
    const s = useResourceSelectionStore();
    s.start('notes', 'user');
    s.setItems([item('old')]);
    expect(
      s.setVisible(
        Array.from({ length: 1000 }, (_, i) => item(String(i))),
        true,
      ),
    ).toBe(false);
    expect(s.items.map((x) => x.id)).toEqual(['old']);
  });
  it('锁定期间拒绝改选，结束会话后旧回执不能作用到新选择', () => {
    const s = useResourceSelectionStore();
    s.start('notes', 'user');
    s.setItems([item('a')]);
    const operation = s.beginOperation()!;
    expect(s.setItems([item('b')])).toBe(false);
    s.end();
    s.start('notes', 'other');
    s.setItems([item('a')]);
    expect(s.isCurrent(operation)).toBe(false);
    s.removeConfirmed(operation, [item('a')]);
    expect(s.items).toHaveLength(1);
  });
  it('标签往返保留会话，其他主模块导航清理，取消导航由调用方忽略', () => {
    const s = useResourceSelectionStore();
    s.start('notes', 'user');
    s.setItems([item('a')]);
    const operation = s.beginOperation()!;
    const token = s.handoffTags(operation, '/noteLibrary?parent=a');
    s.navigate({ path: '/search/batch-tags', query: { selectionSession: token } });
    expect(s.items).toHaveLength(1);
    s.navigate({ path: '/noteLibrary', query: { parent: 'b' } });
    expect(s.items).toHaveLength(1);
    expect(s.busy).toBe(false);
    s.navigate({ path: '/cloudSpace', query: {} });
    expect(s.module).toBe(null);
    expect(s.items).toEqual([]);
  });
});
