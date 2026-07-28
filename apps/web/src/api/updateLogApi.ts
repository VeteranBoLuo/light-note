import { apiBasePost } from '@/http/request';

export type UpdateLogStatus = 'draft' | 'published';

export interface UpdateLogItem {
  id: string;
  title: string;
  publishDate: string;
  summary: string;
  highlights: string[];
  tags: string[];
  contentMarkdown: string;
  imageKeys: string[];
  status: UpdateLogStatus;
  sort?: number;
  createdTime?: string;
  updatedTime?: string;
  // 兼容工作台摘要读模型。
  label?: string;
  time?: string;
  list?: string[];
}

export interface UpdateLogPayload {
  id: string;
  title: string;
  publishDate: string;
  summary: string;
  highlights: string[];
  tags: string[];
  contentMarkdown: string;
  status: UpdateLogStatus;
}

function stripMarkdownInline(value: string) {
  return value
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/[`*_~]/g, '')
    .replace(/^\[[ xX]\]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function updateLogMarkdownSummaryItems(markdown: string, limit = 30) {
  const listItems: string[] = [];
  const paragraphs: string[] = [];

  String(markdown || '')
    .split(/\r?\n/)
    .forEach((line) => {
      const text = line.trim();
      if (!text || /^#{1,6}\s/.test(text) || /^[-*_]{3,}$/.test(text) || /^!\[[^\]]*\]\([^)]+\)$/.test(text)) return;
      const listMatch = text.match(/^(?:[-+*]|\d+[.)])\s+(.+)$/);
      const normalized = stripMarkdownInline(listMatch?.[1] || text).slice(0, 500);
      if (!normalized) return;
      (listMatch ? listItems : paragraphs).push(normalized);
    });

  return (listItems.length ? listItems : paragraphs).slice(0, Math.max(0, limit));
}

function stripLegacyHtml(value: unknown) {
  return String(value ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .trim();
}

function normalizeLegacyUpdateLogs(rawContent: unknown): UpdateLogItem[] {
  let entries = rawContent;
  if (typeof entries === 'string') {
    try {
      entries = JSON.parse(entries);
    } catch {
      entries = [];
    }
  }
  if (!Array.isArray(entries)) return [];

  return entries
    .map((entry: any, index) => {
      const highlights = (Array.isArray(entry?.list) ? entry.list : []).map(stripLegacyHtml).filter(Boolean);
      const title = stripLegacyHtml(entry?.label);
      const publishDate = String(entry?.time || '').match(/^\d{4}-\d{2}-\d{2}/)?.[0] || '';
      return {
        id: `legacy-${index + 1}`,
        title,
        publishDate,
        summary: '',
        highlights,
        tags: [],
        contentMarkdown: '',
        imageKeys: [],
        status: 'published' as const,
        label: title,
        time: publishDate,
        list: highlights,
      };
    })
    .reverse();
}

export async function listUpdateLogs() {
  try {
    const response = await apiBasePost('/api/updateLog/list', undefined, { silent: true });
    if (response.status === 200 && Array.isArray(response.data?.items)) return response;
  } catch {
    // 滚动发布时前端可能先于新后端上线，继续尝试旧配置接口，避免页面与预渲染短暂空白。
  }

  const legacyResponse = await apiBasePost('/api/json/getConfigByName', { name: '更新日志' }, { silent: true });
  return {
    ...legacyResponse,
    data: {
      items: normalizeLegacyUpdateLogs(legacyResponse.data?.jsonContent),
      source: 'config_json_client_fallback',
    },
  };
}

export function listManagedUpdateLogs() {
  return apiBasePost('/api/updateLog/manageList', undefined, { silent: true });
}

export function createUpdateLogDraft() {
  return apiBasePost('/api/updateLog/createDraft', undefined, { silent: true });
}

export function saveUpdateLog(payload: UpdateLogPayload) {
  return apiBasePost('/api/updateLog/save', payload, { silent: true });
}

export function deleteUpdateLog(id: string) {
  return apiBasePost('/api/updateLog/delete', { id }, { silent: true });
}

export function cleanupUpdateLogImages(id: string, objectKeys: string[]) {
  return apiBasePost('/api/updateLog/cleanupImages', { id, objectKeys }, { silent: true });
}

export async function uploadUpdateLogImage(id: string, file: File, onProgress?: (percent: number) => void) {
  const formData = new FormData();
  formData.append('id', id);
  formData.append('file', file, file.name);

  return apiBasePost('/api/updateLog/uploadImage', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    silent: true,
    onUploadProgress(event) {
      if (!event.total) return;
      onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    },
  });
}
