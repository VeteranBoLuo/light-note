import { describe, expect, it } from 'vitest';
import {
  GLOBAL_SEARCH_TYPES,
  INBOXABLE_RESOURCE_TYPES,
  REFERENCEABLE_RESOURCE_TYPES,
  RESOURCE_SEARCH_TYPES,
  TAGGABLE_RESOURCE_TYPES,
  isGlobalSearchType,
  isInboxableResourceType,
  isReferenceableResourceType,
  isResourceSearchType,
  isTaggableResourceType,
  keepResourceItems,
} from './globalSearchTypes';

describe('搜索类型边界', () => {
  it('待办只属于全局搜索，不属于资料类型', () => {
    expect(GLOBAL_SEARCH_TYPES).toEqual(['bookmark', 'note', 'file', 'tag', 'todo']);
    expect(RESOURCE_SEARCH_TYPES).toEqual(['bookmark', 'note', 'file', 'tag']);
    expect(isGlobalSearchType('todo')).toBe(true);
    expect(isResourceSearchType('todo')).toBe(false);
  });

  it('待办不进入标签、待整理和 @ 引用', () => {
    [TAGGABLE_RESOURCE_TYPES, INBOXABLE_RESOURCE_TYPES, REFERENCEABLE_RESOURCE_TYPES].forEach((list) => {
      expect(list).toEqual(['bookmark', 'note', 'file']);
      expect(list).not.toContain('todo');
    });
    expect(isTaggableResourceType('todo')).toBe(false);
    expect(isInboxableResourceType('todo')).toBe(false);
    expect(isReferenceableResourceType('todo')).toBe(false);
    // 标签本身也不是可打标签 / 可待整理 / 可引用的对象
    expect(isTaggableResourceType('tag')).toBe(false);
    expect(isInboxableResourceType('tag')).toBe(false);
    expect(isReferenceableResourceType('tag')).toBe(false);
  });

  it('拒绝未知类型与空值', () => {
    [undefined, null, '', 'TODO', 'bookmarks', 0].forEach((value) => {
      expect(isGlobalSearchType(value)).toBe(false);
      expect(isResourceSearchType(value)).toBe(false);
    });
  });

  it('keepResourceItems 从混合结果中剔除待办', () => {
    const items = [
      { type: 'bookmark', id: 'b1' },
      { type: 'todo', id: 't1' },
      { type: 'note', id: 'n1' },
      { type: 'todo', id: 't2' },
    ];
    expect(keepResourceItems(items).map((item) => item.id)).toEqual(['b1', 'n1']);
  });
});
