import pool from '../db/index.js';
import { EXPLICIT_WEB_READ_MAX_BYTES, fetchWebMeta } from './fetchWebMeta.js';
import { requestAi } from './agent/aiGateway.js';
import { safeAgentError } from './agent/logSafety.js';
import { invalidatePersonalKnowledgeCache } from './personalKnowledgeSearch.js';

// 网页快照·防死链:收藏时(异步)抓取网页正文存档,原链失效(404/删文)也能读到当时内容。
// 复用 fetchWebMeta(带 SSRF 防护/编码探测),快照用大上限抓更完整正文;一书签一份快照(重复归档覆盖)。

const SNAPSHOT_LIMIT = 200_000; // 存档正文上限 ~200K 字符,够完整留存又不至于爆库
const MIN_SNAPSHOT_CHARS = 100; // 正文少于此视为没真正抓到(SPA 空壳/纯导航残渣),不存空快照骗人
const SNAPSHOT_FETCH_TIMEOUT = 15000; // 快照是后台/手动任务、不阻塞用户,给更宽松超时(实时 AI 抓取仍用默认 8s)

function boundedPositiveInteger(value, fallback, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(maximum, Math.floor(parsed));
}

/**
 * 自动存档是免费旁路，不能因为用户批量收藏而无限创建外网连接。队列只约束后台抓取，
 * 满载时返回 false 让书签主事务照常成功；手动“生成网页存档”另有 HTTP 级限频。
 */
export function createBackgroundArchiveScheduler({
  run,
  concurrency = 3,
  maxOutstanding = 100,
  maxOutstandingPerActor = 20,
  onDrop,
} = {}) {
  const execute = typeof run === 'function' ? run : async () => undefined;
  const queue = [];
  const actorOutstanding = new Map();
  let active = 0;

  const totalOutstanding = () => active + queue.length;
  const decrementActor = (actorId) => {
    const next = Math.max(0, Number(actorOutstanding.get(actorId) || 0) - 1);
    if (next) actorOutstanding.set(actorId, next);
    else actorOutstanding.delete(actorId);
  };
  const pump = () => {
    while (active < concurrency && queue.length) {
      const job = queue.shift();
      active += 1;
      Promise.resolve()
        .then(() => execute(job.actorId, job.resourceId))
        .catch(() => undefined)
        .finally(() => {
          active -= 1;
          decrementActor(job.actorId);
          pump();
        });
    }
  };

  return Object.freeze({
    schedule(actorId, resourceId) {
      const normalizedActor = String(actorId || '').trim();
      const normalizedResource = String(resourceId || '').trim();
      if (!normalizedActor || !normalizedResource) return false;
      const actorCount = Number(actorOutstanding.get(normalizedActor) || 0);
      const reason =
        totalOutstanding() >= maxOutstanding
          ? 'global_limit'
          : actorCount >= maxOutstandingPerActor
            ? 'actor_limit'
            : '';
      if (reason) {
        onDrop?.(reason);
        return false;
      }
      actorOutstanding.set(normalizedActor, actorCount + 1);
      queue.push({ actorId: normalizedActor, resourceId: normalizedResource });
      pump();
      return true;
    },
    status() {
      return { active, queued: queue.length, total: totalOutstanding() };
    },
  });
}

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
      create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (bookmark_id),
      KEY idx_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='书签网页正文存档(防死链)'
  `);
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

// 归档指定书签的网页正文(抓取 + 落库,幂等覆盖)。校验书签归属当前用户。
export async function archiveBookmark(userId, bookmarkId, { signal } = {}) {
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
  if (!meta.ok && meta.reason === 'FETCH_FAILED') {
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
  if (!meta.ok) {
    // 归档失败给出更贴切的原因(SPA/需登录常见)
    const MSG = {
      EMPTY_CONTENT: '该网页正文为空(多为需 JS 渲染的单页应用或需登录),无法存档',
      JS_REQUIRED: '该网页需要脚本渲染，但未能提取到正文，无法存档',
      AUTH_REQUIRED: '该网页需要登录后查看，无法在不使用站点账号的情况下存档',
      ACCESS_CHALLENGE: '该网页触发了访问验证，暂时无法存档',
      ACCESS_DENIED: '该网页拒绝自动读取，暂时无法存档',
      RENDERER_UNAVAILABLE: '网页渲染服务暂不可用，无法存档',
      RENDERER_BUSY: '网页渲染任务较多，请稍后重试存档',
      RENDER_TIMEOUT: '网页渲染超时，请稍后重试存档',
      NOT_HTML: '该链接不是网页(文件/图片等),无法存档',
      FETCH_FAILED: '网页无法访问(可能反爬、需登录或已失效),归档失败',
      BLOCKED_HOST: '拒绝访问该地址',
      INVALID_URL: '网址格式无效',
    };
    return { ok: false, reason: meta.reason || 'fetch_failed', msg: MSG[meta.reason] || '归档失败' };
  }
  const content = meta.bodyText || '';
  // 正文太短(SPA 需 JS 渲染、纯导航/空壳)→ 不存空快照,明确返回失败,避免「有快照却打开是空的」
  if (content.trim().length < MIN_SNAPSHOT_CHARS) {
    return { ok: false, reason: 'empty_content', msg: '未能提取到正文(可能是需 JS 渲染的页面),未生成快照' };
  }
  const title = (meta.title || rows[0].name || '').slice(0, 512);
  const u = String(url).slice(0, 2048);
  await pool.query(
    `INSERT INTO bookmark_snapshot (bookmark_id, user_id, url, title, content, char_count) VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE url = ?, title = ?, content = ?, char_count = ?,
       summary = NULL, summary_at = NULL, update_time = CURRENT_TIMESTAMP`,
    [bookmarkId, userId, u, title, content, content.length, u, title, content, content.length],
  );
  await invalidatePersonalKnowledgeCache(userId);
  return { ok: true, charCount: content.length, title };
}

async function runBackgroundArchive(userId, bookmarkId) {
  try {
    // 抓取失败的重试已下沉到 archiveBookmark 内部,这里只负责吞异常 + 记 warn,不阻塞新增流程
    const r = await archiveBookmark(userId, bookmarkId);
    if (!r.ok) {
      console.warn(`[snapshot] 书签 ${bookmarkId} 归档失败: ${r.reason || 'unknown'} ${r.msg || ''}`.trim());
    }
  } catch (e) {
    console.warn(`[snapshot] 书签 ${bookmarkId} 归档异常:`, safeAgentError(e));
  }
}

const backgroundArchiveScheduler = createBackgroundArchiveScheduler({
  run: runBackgroundArchive,
  concurrency: boundedPositiveInteger(process.env.BOOKMARK_ARCHIVE_BACKGROUND_CONCURRENCY, 3, 10),
  maxOutstanding: boundedPositiveInteger(process.env.BOOKMARK_ARCHIVE_BACKGROUND_MAX_OUTSTANDING, 100, 1_000),
  maxOutstandingPerActor: boundedPositiveInteger(process.env.BOOKMARK_ARCHIVE_BACKGROUND_MAX_PER_ACCOUNT, 20, 200),
  onDrop: (reason) => console.warn('[snapshot] 后台归档队列已保护性降级 reason=%s', reason),
});

// 新增书签时只进入有界后台队列。返回 false 仅表示本次自动存档未排队，书签保存不得因此失败。
export function archiveBookmarkBackground(userId, bookmarkId) {
  return backgroundArchiveScheduler.schedule(userId, bookmarkId);
}

export async function getBookmarkSnapshot(userId, bookmarkId) {
  const [rows] = await pool.query(
    'SELECT bookmark_id, url, title, content, char_count, summary, summary_at, update_time FROM bookmark_snapshot WHERE bookmark_id = ? AND user_id = ? LIMIT 1',
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
    if (e?.code === 'AI_QUOTA_EXCEEDED') {
      return { ok: false, reason: 'quota_exceeded', msg: '今日 AI 额度已用完，请明天再试' };
    }
    return { ok: false, reason: 'ai_error', msg: 'AI 服务暂时不可用,请稍后再试' };
  }
  if (!summary) return { ok: false, reason: 'empty', msg: '摘要生成失败' };
  if (persist) {
    await pool.query(
      'UPDATE bookmark_snapshot SET summary = ?, summary_at = CURRENT_TIMESTAMP WHERE bookmark_id = ? AND user_id = ?',
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
