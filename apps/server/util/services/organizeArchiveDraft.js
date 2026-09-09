import { archiveBookmark, saveBookmarkSnapshotInTransaction } from '../snapshot.js';
import { archiveFailure } from '../bookmarkArchivePolicy.js';
import { suggestionError } from './organizeSuggestionRules.js';

// 读取只发生在规则租约内、事务外；草稿属于整理结果，应用前不写书签存档。
export async function prepareOrganizeArchive(userId, snapshot, read = archiveBookmark) {
  if (snapshot.type !== 'bookmark' || snapshot.hasArchive) return null;
  let result;
  try {
    result = await read(userId, snapshot.id, { persist: false, retry: false });
  } catch {
    result = archiveFailure('FETCH_FAILED');
  }
  if (!result.ok) return { status: 'failed', reason: archiveFailure(result.reason).msg };
  if (result.url !== snapshot.source.url) return { status: 'failed', reason: archiveFailure('RESOURCE_CHANGED').msg };
  return {
    status: 'ready',
    title: result.title,
    url: result.url,
    content: result.content,
    charCount: result.content.length,
    excerpt: result.content.slice(0, 220),
    source: result.source || 'static_html',
    generatedAt: new Date().toISOString(),
  };
}

export async function applyOrganizeArchive(c, userId, current, draft) {
  if (!draft || draft.status !== 'ready' || typeof draft.content !== 'string' || draft.content.trim().length < 100)
    throw suggestionError('ORGANIZE_ARCHIVE_NOT_READY', '此项没有可应用的正文，请重新整理生成存档', 409);
  if (draft.url !== current.source?.url)
    throw suggestionError('ORGANIZE_RESOURCE_CHANGED', '书签网址已变化，请重新整理', 409);
  await saveBookmarkSnapshotInTransaction(c, userId, current.id, draft);
  // 正式采用这份草稿后，旧存档任务的迟到结果不能覆盖用户确认的正文。
  await c.query(
    `UPDATE bookmark_archive_jobs SET status='succeeded',reason_code=NULL,source=?,char_count=?,lease_token=NULL,lease_expires_at=NULL
     WHERE bookmark_id=? AND user_id=?`,
    [draft.source, draft.content.length, current.id, userId],
  );
  return { applied: 'saved' };
}
