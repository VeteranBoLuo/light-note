import pool from '../db/index.js';
import { archiveFailure } from './bookmarkArchivePolicy.js';
import { EXPLICIT_WEB_READ_MAX_BYTES, fetchWebMeta } from './fetchWebMeta.js';
import { requestAi } from './agent/aiGateway.js';
import { classifyAiQuotaErrorCode } from '@lightnote/shared/ai-quota-protocol';
import { safeAgentError } from './agent/logSafety.js';
import { invalidatePersonalKnowledgeCache } from './personalKnowledgeSearch.js';

// 网页快照·防死链:收藏时(异步)抓取网页正文存档,原链失效(404/删文)也能读到当时内容。
// 复用 fetchWebMeta(带 SSRF 防护/编码探测),快照用大上限抓更完整正文;一书签一份快照(重复归档覆盖)。

const SNAPSHOT_LIMIT = 200_000; // 存档正文上限 ~200K 字符,够完整留存又不至于爆库
const MIN_SNAPSHOT_CHARS = 100; // 正文少于此视为没真正抓到(SPA 空壳/纯导航残渣),不存空快照骗人
const SNAPSHOT_FETCH_TIMEOUT = 15000; // 快照是后台/手动任务、不阻塞用户,给更宽松超时(实时 AI 抓取仍用默认 8s)

function waitForSnapshotRetry(delayMs, signal) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal?.removeEventListener?.('abort', abort);
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const timer = setTimeout(finish, delayMs);
    const abort = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      reject(signal?.reason || Object.assign(new Error('请求已取消'), { name: 'AbortError' }));
    };
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
  });
}

async function columnMissing(table, col) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, col],
  );
  return !Number(rows[0]?.c);
}

export async function ensureBookmarkSnapshotTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bookmark_snapshot (
      bookmark_id VARCHAR(64) NOT NULL,
      user_id VARCHAR(64) NOT NULL,
      url VARCHAR(2048) DEFAULT NULL,
      title VARCHAR(512) DEFAULT NULL,
      content LONGTEXT,
      char_count INT NOT NULL DEFAULT 0,
      source VARCHAR(20) DEFAULT NULL,
      summary TEXT DEFAULT NULL,
      summary_at DATETIME DEFAULT NULL,
      create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (bookmark_id),
      KEY idx_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='书签网页正文存档(防死链)'
  `);
  if (await columnMissing('bookmark_snapshot', 'source')) {
    await pool.query('ALTER TABLE bookmark_snapshot ADD COLUMN source VARCHAR(20) DEFAULT NULL');
  }
  // AI 摘要(I 批):基于存档正文生成,缓存复用
  if (await columnMissing('bookmark_snapshot', 'summary')) {
    await pool.query('ALTER TABLE `bookmark_snapshot` ADD COLUMN `summary` TEXT DEFAULT NULL COMMENT "AI 摘要"');
  }
  if (await columnMissing('bookmark_snapshot', 'summary_at')) {
    await pool.query(
      'ALTER TABLE `bookmark_snapshot` ADD COLUMN `summary_at` DATETIME DEFAULT NULL COMMENT "摘要生成时间"',
    );
  }
}

// 调用方持有用户、书签锁并复核 URL；与建议应用或后台任务终态原子提交。
export async function saveBookmarkSnapshotInTransaction(connection, userId, bookmarkId, result) {
  await connection.query(
    `INSERT INTO bookmark_snapshot (bookmark_id, user_id, url, title, content, char_count, source)
     VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE url = VALUES(url), title = VALUES(title),
     content = VALUES(content), char_count = VALUES(char_count), source = VALUES(source), summary = NULL, summary_at = NULL,
     update_time = CURRENT_TIMESTAMP`,
    [
      bookmarkId,
      userId,
      result.url,
      result.title,
      result.content,
      result.content.length,
      result.source || 'static_html',
    ],
  );
}

// 归档指定书签的网页正文(抓取 + 落库,幂等覆盖)。校验书签归属当前用户。
export async function archiveBookmark(userId, bookmarkId, { signal, persist = true, retry = true } = {}) {
  const [rows] = await pool.query('SELECT id, url, name FROM bookmark WHERE id = ? AND user_id = ? AND del_flag = 0', [
    bookmarkId,
    userId,
  ]);
  if (!rows.length) return { ok: false, reason: 'not_found', msg: '书签不存在' };
  const url = rows[0].url;
  if (!url) return { ok: false, reason: 'no_url', msg: '该书签没有网址' };
  let meta = await fetchWebMeta(url, {
    bodyLimit: SNAPSHOT_LIMIT,
    maxContentBytes: EXPLICIT_WEB_READ_MAX_BYTES,
    minimumBodyLength: MIN_SNAPSHOT_CHARS,
    renderFallback: true,
    timeout: SNAPSHOT_FETCH_TIMEOUT,
    signal,
  });
  // 抓取类失败(网络抖动/反爬/超时偶发)短暂重试一次:很多站"时好时坏",一次重试能明显提升成功率
  if (retry && !meta.ok && archiveFailure(meta.reason).retryable) {
    await waitForSnapshotRetry(1500, signal);
    meta = await fetchWebMeta(url, {
      bodyLimit: SNAPSHOT_LIMIT,
      maxContentBytes: EXPLICIT_WEB_READ_MAX_BYTES,
      minimumBodyLength: MIN_SNAPSHOT_CHARS,
      renderFallback: true,
      timeout: SNAPSHOT_FETCH_TIMEOUT,
      signal,
    });
  }
  if (!meta.ok) return archiveFailure(meta.reason);
  const content = meta.bodyText || '';
  // 正文太短(SPA 需 JS 渲染、纯导航/空壳)→ 不存空快照,明确返回失败,避免「有快照却打开是空的」
  if (content.trim().length < MIN_SNAPSHOT_CHARS) {
    return archiveFailure('EMPTY_CONTENT');
  }
  const title = (meta.title || rows[0].name || '').slice(0, 512);
  const u = String(url).slice(0, 2048);
  if (!persist) return { ok: true, content, title, url, source: meta.source, charCount: content.length };
  const [saved] = await pool.query(
    `INSERT INTO bookmark_snapshot (bookmark_id, user_id, url, title, content, char_count, source)
     SELECT ?, ?, ?, ?, ?, ?, ? FROM bookmark WHERE id = ? AND user_id = ? AND del_flag = 0 AND BINARY url = BINARY ?
     ON DUPLICATE KEY UPDATE url = ?, title = ?, content = ?, char_count = ?, source = VALUES(source),
       summary = NULL, summary_at = NULL, update_time = CURRENT_TIMESTAMP`,
    [
      bookmarkId,
      userId,
      u,
      title,
      content,
      content.length,
      meta.source || 'static_html',
      bookmarkId,
      userId,
      url,
      u,
      title,
      content,
      content.length,
    ],
  );
  if (!saved.affectedRows) return archiveFailure('RESOURCE_CHANGED');
  await invalidatePersonalKnowledgeCache(userId);
  return { ok: true, charCount: content.length, title };
}

// 入库完成后排队；任务状态持久化，由资源治理 Worker 续跑。
export async function archiveBookmarkBackground(userId, bookmarkId) {
  try {
    const { enqueueBookmarkArchive } = await import('./bookmarkArchiveJobs.js');
    return Boolean((await enqueueBookmarkArchive(userId, bookmarkId))?.ok);
  } catch (error) {
    console.warn('[snapshot] enqueue failed code=%s', error.code || 'QUEUE_FAILED');
    return false;
  }
}

export async function getBookmarkSnapshot(userId, bookmarkId) {
  const [rows] = await pool.query(
    'SELECT bookmark_id, url, title, content, char_count, source, summary, summary_at, update_time FROM bookmark_snapshot WHERE bookmark_id = ? AND user_id = ? LIMIT 1',
    [bookmarkId, userId],
  );
  return rows[0] || null;
}

// AI 一键摘要:基于已存快照正文经统一 AI Gateway 生成摘要,缓存到 summary 列。
// 调用方可明确选择无快照时是否先归档；已有摘要且非 force 直接返回缓存(省 token)。正文截断到 ~6000 字喂模型。
const SUMMARY_INPUT_LIMIT = 6000;
export async function summarizeBookmark(
  userId,
  bookmarkId,
  { force = false, trace, persist = true, archiveIfMissing = persist, signal } = {},
) {
  let snap = await getBookmarkSnapshot(userId, bookmarkId);
  if (!snap || !snap.content) {
    if (!archiveIfMissing) {
      return { ok: false, reason: 'no_snapshot', msg: '无可用正文' };
    }
    const arc = await archiveBookmark(userId, bookmarkId, { signal }); // 无快照先抓一次
    if (!arc.ok) return { ok: false, reason: arc.reason || 'no_snapshot', msg: arc.msg || '无可用正文' };
    snap = await getBookmarkSnapshot(userId, bookmarkId);
  }
  if (!snap || !snap.content) return { ok: false, reason: 'no_content', msg: '无可用正文' };
  if (snap.summary && !force) return { ok: true, summary: snap.summary, cached: true };

  const text = String(snap.content).slice(0, SUMMARY_INPUT_LIMIT);
  const messages = [
    {
      role: 'system',
      content:
        '你是知识管理助手。请基于网页正文生成简洁摘要:先用一句话总结主旨,再列 3-5 个关键要点(短句)。' +
        '严格依据正文,不要编造正文没有的信息;用与正文相同的语言输出;不要加多余的开场白。',
    },
    { role: 'user', content: `网页标题:${snap.title || ''}\n\n正文:\n${text}` },
  ];
  let summary = '';
  try {
    const resp = await requestAi(messages, {
      signal,
      toolChoice: 'none',
      maxTokens: 800,
      temperature: 0.2,
      trace: { ...trace, taskType: 'bookmark_summary', stage: 'bookmark_summary' },
    });
    summary = (resp.content || '').trim();
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    console.warn('[snapshot] AI 摘要调用失败:', safeAgentError(e));
    const quotaErrorKind = classifyAiQuotaErrorCode(e?.code);
    if (quotaErrorKind) {
      const requiredTokens = Number(e?.requiredTokens);
      const availableTokens = Number(e?.availableTokens);
      return {
        ok: false,
        code: String(e.code),
        reason: quotaErrorKind === 'exhausted' ? 'quota_exceeded' : 'quota_insufficient_for_request',
        ...(Number.isFinite(requiredTokens)
          ? {
              requiredTokens: Math.max(0, Math.floor(requiredTokens)),
              availableTokens: Number.isFinite(availableTokens) ? Math.max(0, Math.floor(availableTokens)) : 0,
            }
          : {}),
        msg:
          quotaErrorKind === 'exhausted'
            ? '当前 AI 额度已用完，请等待每日额度重置或补充永久额度'
            : '当前仍有 AI 额度，但不足以生成本次摘要，请减少材料或补充额度',
      };
    }
    return { ok: false, reason: 'ai_error', msg: 'AI 服务暂时不可用,请稍后再试' };
  }
  if (!summary) return { ok: false, reason: 'empty', msg: '摘要生成失败' };
  if (persist) {
    await pool.query(
      'UPDATE bookmark_snapshot SET summary = ?, summary_at = CURRENT_TIMESTAMP, update_time = update_time WHERE bookmark_id = ? AND user_id = ?',
      [summary, bookmarkId, userId],
    );
  }
  return { ok: true, summary, cached: false };
}

/**
 * 显式“生成网页存档”操作：重新抓取权威正文，并基于同一版正文生成摘要。
 * 被动收藏归档仍只抓正文，避免新增书签时静默消耗 AI 额度；readonly 代管只可读取既有存档生成临时摘要。
 */
export async function archiveAndSummarizeBookmark(userId, bookmarkId, { trace, persist = true, signal } = {}) {
  let archiveResult = null;
  if (persist) {
    archiveResult = await archiveBookmark(userId, bookmarkId, { signal });
    if (!archiveResult.ok) return { ...archiveResult, archiveOk: false };
  }

  const summaryResult = await summarizeBookmark(userId, bookmarkId, {
    force: true,
    trace,
    persist,
    archiveIfMissing: false,
    signal,
  });
  if (!summaryResult.ok) {
    return {
      ...summaryResult,
      archiveOk: Boolean(archiveResult?.ok),
      ...(archiveResult?.charCount ? { charCount: archiveResult.charCount } : {}),
      ...(archiveResult?.title ? { title: archiveResult.title } : {}),
    };
  }
  return {
    ok: true,
    archiveOk: Boolean(archiveResult?.ok),
    summary: summaryResult.summary,
    cached: false,
    ...(archiveResult?.charCount ? { charCount: archiveResult.charCount } : {}),
    ...(archiveResult?.title ? { title: archiveResult.title } : {}),
  };
}
