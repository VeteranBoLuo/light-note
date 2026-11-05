import type { SearchResultItem } from '@/api/search.ts';
import type { GlobalSearchType } from '@/utils/globalSearchTypes';

export type ResourceSort = 'relevance' | 'updated' | 'name';
export type ResourceView = 'card' | 'list';
export type ResourceDate = 'all' | '7d' | '30d' | '365d';

export interface DisplaySearchItem extends SearchResultItem {
  originalIndex: number;
  updatedAtMs: number;
  updatedAtText: string;
  tagNames: string[];
  domain: string;
  fileMeta: string;
  searchScore: number;
}

const DATE_RANGE_MS: Record<Exclude<ResourceDate, 'all'>, number> = {
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '365d': 365 * 24 * 60 * 60 * 1000,
};

function toArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function normalizeTimeValue(input: unknown): number {
  if (!input) return 0;
  if (typeof input === 'number' && Number.isFinite(input)) {
    return input > 9999999999 ? input : input * 1000;
  }
  if (typeof input === 'string') {
    const time = Date.parse(input);
    return Number.isFinite(time) ? time : 0;
  }
  return 0;
}

function getRawTime(raw: any): string {
  if (!raw || typeof raw !== 'object') return '';
  return (
    raw.updateTime ||
    raw.update_time ||
    raw.uploadTime ||
    raw.updatedAt ||
    raw.createTime ||
    raw.createAt ||
    raw.modifiedAt ||
    raw.lastModified ||
    ''
  );
}

function extractTagNames(raw: any): string[] {
  const tags = toArray(raw?.tagList).concat(toArray(raw?.tags));
  return tags
    .map((tag: any) => String(tag?.name || '').trim())
    .filter(Boolean)
    .slice(0, 30);
}

function normalizeTagName(value: string): string {
  return value.replace(/^#\s*/, '').trim();
}

function formatFileSizeLikeCloudSpace(sizeInput: unknown): string {
  const size = Number(sizeInput);
  if (!Number.isFinite(size) || size <= 0) return '';
  if (size >= 1024 * 1024) {
    return (
      Number(size / (1024 * 1024))
        .toFixed(1)
        .replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' MB'
    );
  }
  return (
    Number(size / 1024)
      .toFixed()
      .replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' KB'
  );
}

function extractSelfTagName(item: SearchResultItem): string {
  const rawName = String(item.raw?.name || item.title || '').trim();
  return normalizeTagName(rawName);
}

function extractFileMeta(raw: any): string {
  const ext = String(raw?.ext || raw?.suffix || raw?.fileType || raw?.file_type || '').trim();
  const size = formatFileSizeLikeCloudSpace(raw?.fileSize ?? raw?.file_size);
  if (ext && size) return `${ext.toUpperCase()} · ${size}`;
  if (ext) return ext.toUpperCase();
  if (size) return size;
  return '';
}

function extractDomain(url?: string): string {
  if (!url) return '';
  try {
    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    return new URL(normalized).hostname.replace(/^www\./i, '');
  } catch (error) {
    return '';
  }
}

function calcScore(item: SearchResultItem, keyword: string): number {
  const q = keyword.trim().toLowerCase();
  if (!q) return 0;
  const title = item.title?.toLowerCase() || '';
  const desc = item.description?.toLowerCase() || '';
  if (title === q) return 100;
  if (title.startsWith(q)) return 80;
  if (title.includes(q)) return 60;
  if (desc.includes(q)) return 30;
  return 0;
}

export function mapDisplayItems(items: SearchResultItem[], keyword: string): DisplaySearchItem[] {
  return items.map((item, index) => {
    const rawTime = item.origin === 'public' ? item.publicResource?.publishedAt || '' : getRawTime(item.raw);
    const updatedAtMs = normalizeTimeValue(rawTime || (item.type === 'todo' ? '' : item.extra));
    const baseTags = [...extractTagNames(item.raw), ...(item.tags || []).map((tag) => tag.name)]
      .map(normalizeTagName)
      .filter(Boolean);
    const selfTag = item.type === 'tag' ? extractSelfTagName(item) : '';
    const tagNames = Array.from(new Set([...baseTags, ...(selfTag ? [selfTag] : [])]));
    return {
      ...item,
      originalIndex: index,
      updatedAtMs,
      updatedAtText: rawTime || '',
      tagNames,
      domain: extractDomain(item.url),
      fileMeta: extractFileMeta(item.raw),
      searchScore: calcScore(item, keyword),
    };
  });
}

export function collectTagOptions(items: DisplaySearchItem[]): string[] {
  const set = new Set<string>();
  items.forEach((item) => {
    item.tagNames.forEach((tag) => set.add(tag));
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN', { sensitivity: 'base' }));
}

export function buildTypeBuckets(items: DisplaySearchItem[]) {
  const buckets: Record<GlobalSearchType, DisplaySearchItem[]> = {
    bookmark: [],
    note: [],
    file: [],
    tag: [],
    todo: [],
  };
  items.forEach((item) => {
    // 服务端协议变化时不能因为多出一个未知类型就整页崩掉
    buckets[item.type]?.push(item);
  });
  return buckets;
}

/** 资源中心展示层使用的分组结果，保持筛选器顺序并隐藏空分组。 */
export function buildVisibleGroups(items: DisplaySearchItem[], selectedTypes: GlobalSearchType[]) {
  const buckets = buildTypeBuckets(items);
  return selectedTypes
    .map((type) => ({
      type,
      items: buckets[type],
    }))
    .filter((group) => group.items.length);
}
