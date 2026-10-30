import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  forgetNoteReference,
  formatNoteReferenceQuery,
  parseNoteReferenceQuery,
  readRecentNoteReferences,
  rememberNoteReference,
} from './noteReference';

describe('参考地址参数', () => {
  it('解析与生成笔记、文件参考', () => {
    expect(parseNoteReferenceQuery('note:abc-1')).toEqual({ type: 'note', id: 'abc-1' });
    expect(parseNoteReferenceQuery(['file:42'])).toEqual({ type: 'file', id: '42' });
    expect(formatNoteReferenceQuery({ type: 'file', id: '42' })).toBe('file:42');
  });

  it('拒绝未知类型、空 ID 和超长 ID', () => {
    expect(parseNoteReferenceQuery('bookmark:1')).toBeNull();
    expect(parseNoteReferenceQuery('note:')).toBeNull();
    expect(parseNoteReferenceQuery(':1')).toBeNull();
    expect(parseNoteReferenceQuery(`note:${'x'.repeat(256)}`)).toBeNull();
    expect(parseNoteReferenceQuery(undefined)).toBeNull();
  });
});

describe('最近参考', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('按账号隔离、去重、最新在前且最多 5 条', () => {
    for (let index = 1; index <= 6; index += 1) {
      rememberNoteReference('u1', { type: 'note', id: String(index), title: `笔记 ${index}` });
    }
    rememberNoteReference('u1', { type: 'note', id: '3', title: '笔记 3 新标题' });
    const recent = readRecentNoteReferences('u1');
    expect(recent.map((item) => item.id)).toEqual(['3', '6', '5', '4', '2']);
    expect(recent[0].title).toBe('笔记 3 新标题');
    expect(readRecentNoteReferences('u2')).toEqual([]);
    expect(forgetNoteReference('u1', { type: 'note', id: '3' }).map((item) => item.id)).toEqual(['6', '5', '4', '2']);
  });

  it('存储不可用时不抛错', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readRecentNoteReferences('u1')).toEqual([]);
    expect(rememberNoteReference('u1', { type: 'file', id: '9', title: 'a.pdf' })).toEqual([
      { type: 'file', id: '9', title: 'a.pdf' },
    ]);
  });
});
