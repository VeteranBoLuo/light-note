export type BookmarkCaptureMode = 'formal' | 'inbox';
export type BookmarkCaptureSource = 'browser_extension' | 'quick_capture';

export interface BookmarkCapturePayloadInput {
  mode: BookmarkCaptureMode;
  source: BookmarkCaptureSource;
  url: string;
  name: string;
  description?: string;
  relatedTags?: string[];
  relatedTagNames?: string[];
  saveSnapshot?: boolean;
}

export interface BookmarkCapturePayload {
  url: string;
  name: string;
  description: string;
  relatedTags: string[];
  relatedTagNames: string[];
  tagSource: 'browser_extension' | 'manual';
  addToInbox: boolean;
  inboxSource: BookmarkCaptureSource;
  saveSnapshot: boolean;
}

export interface BookmarkCaptureOperationReceipt {
  key: string;
  fingerprint: string;
}

/**
 * 浏览器扩展和书签栏收藏共享同一份模式语义：
 * - 正式保存才允许标签与网页存档；
 * - 快速待整理只保留当前信息并进入待整理，不隐式创建标签或存档。
 */
export function buildBookmarkCapturePayload(input: BookmarkCapturePayloadInput): BookmarkCapturePayload {
  const formal = input.mode === 'formal';
  return {
    url: input.url.trim(),
    name: input.name.trim(),
    description: String(input.description || '').trim(),
    relatedTags: formal ? [...(input.relatedTags || [])] : [],
    relatedTagNames: formal ? [...(input.relatedTagNames || [])] : [],
    tagSource: input.source === 'browser_extension' ? 'browser_extension' : 'manual',
    addToInbox: !formal,
    inboxSource: input.source,
    saveSnapshot: formal && input.saveSnapshot !== false,
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

async function fingerprintPayload(payload: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(payload)));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** 同一载荷重试复用幂等键；字段或模式变化后自动换键，避免旧结果误命中新请求。 */
export async function resolveBookmarkCaptureReceipt({
  current,
  mode,
  source,
  payload,
}: {
  current?: BookmarkCaptureOperationReceipt | null;
  mode: BookmarkCaptureMode;
  source: BookmarkCaptureSource;
  payload: unknown;
}): Promise<BookmarkCaptureOperationReceipt> {
  const fingerprint = await fingerprintPayload(payload);
  const surface = source === 'browser_extension' ? 'browser-extension' : 'quick-save';
  const prefix = `${surface}:bookmark:${mode}:`;
  if (current?.fingerprint === fingerprint && current.key.startsWith(prefix) && current.key.length <= 160) {
    return current;
  }
  return {
    key: `${prefix}${crypto.randomUUID()}`,
    fingerprint,
  };
}

export const bookmarkCaptureInternals = Object.freeze({ canonicalize, fingerprintPayload });
