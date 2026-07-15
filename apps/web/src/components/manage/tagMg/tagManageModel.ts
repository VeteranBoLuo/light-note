export interface RelatedItem {
  id: string;
  name: string;
  url?: string;
}

export interface TagRecord {
  id: string;
  name: string;
  iconUrl?: string;
  relatedTagList?: RelatedItem[];
  bookmarkList?: RelatedItem[];
  noteList?: RelatedItem[];
  fileList?: RelatedItem[];
}

export type TagFilterValue = 'all' | 'active' | 'bookmark' | 'note' | 'file' | 'empty';
export type TagSortValue = 'default' | 'resourceDesc' | 'nameAsc' | 'emptyFirst';

export interface TagFilterCounts {
  all: number;
  active: number;
  bookmark: number;
  note: number;
  file: number;
  empty: number;
}

export function getTotalResourceCount(tag: TagRecord) {
  return (tag.bookmarkList?.length || 0) + (tag.noteList?.length || 0) + (tag.fileList?.length || 0);
}

export function getUniqueResourceCount(tags: TagRecord[], key: 'bookmarkList' | 'noteList' | 'fileList') {
  const ids = new Set<string>();
  tags.forEach((tag) => {
    (tag[key] || []).forEach((item) => {
      if (item?.id) ids.add(item.id);
    });
  });
  return ids.size;
}

export function filterAndSortTags(tags: TagRecord[], keyword: string, filter: TagFilterValue, sort: TagSortValue) {
  const normalizedKeyword = keyword.trim().toLocaleLowerCase();
  let result = normalizedKeyword
    ? tags.filter((tag) => tag.name?.toLocaleLowerCase().includes(normalizedKeyword))
    : [...tags];

  switch (filter) {
    case 'active':
      result = result.filter((tag) => getTotalResourceCount(tag) > 0);
      break;
    case 'bookmark':
      result = result.filter((tag) => (tag.bookmarkList?.length || 0) > 0);
      break;
    case 'note':
      result = result.filter((tag) => (tag.noteList?.length || 0) > 0);
      break;
    case 'file':
      result = result.filter((tag) => (tag.fileList?.length || 0) > 0);
      break;
    case 'empty':
      result = result.filter((tag) => getTotalResourceCount(tag) === 0);
      break;
  }

  if (sort === 'default') return result;

  return [...result].sort((left, right) => {
    if (sort === 'resourceDesc') {
      return getTotalResourceCount(right) - getTotalResourceCount(left) || left.name.localeCompare(right.name, 'zh-CN');
    }
    if (sort === 'emptyFirst') {
      const emptyDiff = Number(getTotalResourceCount(left) > 0) - Number(getTotalResourceCount(right) > 0);
      return emptyDiff || left.name.localeCompare(right.name, 'zh-CN');
    }
    return left.name.localeCompare(right.name, 'zh-CN');
  });
}

export function buildFilterCounts(tags: TagRecord[], keyword = ''): TagFilterCounts {
  const normalizedKeyword = keyword.trim().toLocaleLowerCase();
  const scopedTags = normalizedKeyword
    ? tags.filter((tag) => tag.name?.toLocaleLowerCase().includes(normalizedKeyword))
    : tags;

  return {
    all: scopedTags.length,
    active: scopedTags.filter((tag) => getTotalResourceCount(tag) > 0).length,
    bookmark: scopedTags.filter((tag) => (tag.bookmarkList?.length || 0) > 0).length,
    note: scopedTags.filter((tag) => (tag.noteList?.length || 0) > 0).length,
    file: scopedTags.filter((tag) => (tag.fileList?.length || 0) > 0).length,
    empty: scopedTags.filter((tag) => getTotalResourceCount(tag) === 0).length,
  };
}
