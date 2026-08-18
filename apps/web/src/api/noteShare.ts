import { apiBasePost, type ApiResponse } from '@/http/request';
import { copyTextToClipboard } from '@/utils/clipboard';

export type NoteShareScope = 'single' | 'subtree';

export interface NoteShareInput {
  scopeType: NoteShareScope;
  description?: string;
  expiresInDays?: 1 | 7 | 30;
  accessCode?: string;
  maxAccessCount?: number | null;
}

export interface NoteShareRecord {
  id: string;
  rootNoteId: string;
  rootTitle: string;
  scopeType: NoteShareScope;
  tokenHint: string;
  description: string;
  requiresCode: boolean;
  expiresAt: string;
  maxAccessCount: number | null;
  accessCount: number;
  lastAccessAt: string | null;
  revokedAt: string | null;
  createTime: string;
  state: string;
}

export interface PublicNoteSharePage {
  id: string;
  parentId: string | null;
  title: string;
  content: string;
  type: string;
  revision: number;
  updateTime: string | null;
}

export interface PublicNoteShareTreeItem {
  id: string;
  parentId: string | null;
  title: string;
  type: string;
  revision: number;
  updateTime: string | null;
  childCount: number;
  hasChildren: boolean;
}

export interface PublicNoteShareData {
  accessTicket: string;
  ticketExpiresIn: number;
  share: {
    id: string;
    rootNoteId: string;
    rootTitle: string;
    rootType: string;
    scopeType: NoteShareScope;
    description: string;
    creatorName: string;
    expiresAt: string;
  };
  page: PublicNoteSharePage;
  breadcrumb: Array<{ id: string; title: string }>;
  children: PublicNoteShareTreeItem[];
}

function requireSuccess<T>(response: ApiResponse, fallbackCode: string): T {
  if (response.status === 200 && response.data) return response.data as T;
  const code = response.data?.errorCode || response.data?.code || fallbackCode;
  throw Object.assign(new Error(response.msg || fallbackCode), { code, status: response.status });
}

export function buildNoteShareUrl(token: string, pageId?: string) {
  // 主分享令牌放在 URL fragment：浏览器不会把 fragment 发给 Nginx/应用服务器，避免进入访问日志。
  const url = new URL('/share/note', window.location.origin);
  url.hash = `token=${encodeURIComponent(token)}`;
  if (pageId) url.searchParams.set('page', pageId);
  return url.toString();
}

export async function copyNoteShareUrl(token: string, pageId?: string) {
  const url = buildNoteShareUrl(token, pageId);
  if (!(await copyTextToClipboard(url))) throw new Error('NOTE_SHARE_COPY_FAILED');
  return url;
}

export async function createNoteShare(rootNoteId: string, input: NoteShareInput) {
  return requireSuccess<{ id: string; token: string; scopeType: NoteShareScope; expiresInDays: number }>(
    await apiBasePost('/api/note/share/create', { rootNoteId, ...input }, { silent: true }),
    'NOTE_SHARE_CREATE_FAILED',
  );
}

export async function listNoteShares(rootNoteId: string) {
  const response = await apiBasePost('/api/note/share/list', { rootNoteId }, { silent: true });
  if (response.status !== 200 || !Array.isArray(response.data)) {
    throw new Error(response.data?.errorCode || 'NOTE_SHARE_LIST_FAILED');
  }
  return response.data as NoteShareRecord[];
}

export async function revokeNoteShare(shareId: string) {
  requireSuccess(await apiBasePost('/api/note/share/revoke', { shareId }, { silent: true }), 'NOTE_SHARE_REVOKE_FAILED');
}

export async function rotateNoteShare(shareId: string, input: NoteShareInput) {
  return requireSuccess<{ id: string; token: string; replacedShareId: string }>(
    await apiBasePost('/api/note/share/rotate', { shareId, ...input }, { silent: true }),
    'NOTE_SHARE_ROTATE_FAILED',
  );
}

export async function resolvePublicNoteShare(token: string, accessCode = '', pageId = '') {
  return requireSuccess<PublicNoteShareData>(
    await apiBasePost('/api/note/share/resolve', { token, accessCode, pageId }, { silent: true }),
    'NOTE_SHARE_RESOLVE_FAILED',
  );
}

export async function getPublicNoteSharePage(accessTicket: string, noteId: string) {
  return requireSuccess<{ page: PublicNoteSharePage; breadcrumb: Array<{ id: string; title: string }> }>(
    await apiBasePost('/api/note/share/page', { accessTicket, noteId }, { silent: true }),
    'NOTE_SHARE_PAGE_FAILED',
  );
}

export async function getPublicNoteShareTree(accessTicket: string, parentId: string) {
  return requireSuccess<{ parentId: string; items: PublicNoteShareTreeItem[] }>(
    await apiBasePost('/api/note/share/tree', { accessTicket, parentId }, { silent: true }),
    'NOTE_SHARE_TREE_FAILED',
  );
}
