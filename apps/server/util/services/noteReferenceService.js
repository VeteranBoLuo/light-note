/**
 * 笔记内联提及(N0)· 引用协议与关系同步服务。见 docs/plan/execution-handoff-v2.md 第 4 节。
 *
 * 只承载:正文站内链接解析 + 归属校验 + note_resource_refs 差异同步;不在 handler / AI tool 里复制 SQL。
 * 关键纪律:validate / sync / delete 均收调用方 connection,复用其事务(与页面、AI 保存同生共死),
 *   内部不 getConnection、不 begin/commit;这样任一路径写正文或写关系失败时,整个事务一起回滚。
 * canonical 协议唯一事实源是 @lightnote/shared(前后端共享同一 parse / build / 向量,杜绝漂移)。
 * 解析用真实结构化解析器:HTML 走 cheerio 只取 a[href];Markdown 走 marked token 的 link / html,
 *   天然跳过 fenced / inline code 与裸文本,绝不裸正则扫 href=(避免 data-href / data-mce-href / 代码块误判)。
 */

import { load } from 'cheerio';
import { marked } from 'marked';
import { RESOURCE_REF_TYPES, buildResourceHref, normalizeNoteType, parseResourceHref } from '@lightnote/shared';

// 与笔记正文写入上限一致;超限抛错交调用方在事务内回滚,禁止截断后再同步
// (否则上限之后的真实链接会被解析漏掉,sync 会把它误判为"已从正文删除"而删除真实关系)。
const MAX_CONTENT_LENGTH = 1_000_000;
const TARGET_TYPES = new Set(RESOURCE_REF_TYPES);
// 阅读态一次只需要解析当前笔记实际出现的去重集合。上限既防止请求被用作资源探测，
// 也避免一篇异常正文触发过大的 IN 查询；前端会先去重后再调用。
export const MAX_RESOURCE_REF_RESOLVE = 100;
export const DEFAULT_RESOURCE_BACKLINK_LIMIT = 5;
export const MAX_RESOURCE_BACKLINK_LIMIT = 50;

// 再导出 canonical parse(单一实现仍在 shared),兼容既有引用者。
export { parseResourceHref };

/**
 * 仅接受与正文 canonical href 等价的 {type,id}。请求体不能直接信任 type/id：
 * 借 shared 的 build → parse 对称校验，确保和正文解析使用完全相同的安全 ID 规则。
 */
export function normalizeResourceRef(value) {
  const type = typeof value?.type === 'string' ? value.type : '';
  const id = typeof value?.id === 'string' ? value.id : '';
  const href = buildResourceHref({ type, id });
  return href ? parseResourceHref(href) : null;
}

/**
 * 请求批量 ref 归一：保序去重，并把不合法与超限显式交给 handler 返回 400。
 * 不把无效 ref 当作「不可用资源」返回，避免调用方误以为可以探测任意 ID。
 */
export function normalizeResourceRefList(values, max = MAX_RESOURCE_REF_RESOLVE) {
  if (!Array.isArray(values)) return { refs: [], invalid: true, tooMany: false };
  if (values.length > max) return { refs: [], invalid: false, tooMany: true };
  const seen = new Set();
  const refs = [];
  for (const value of values) {
    const ref = normalizeResourceRef(value);
    if (!ref) return { refs: [], invalid: true, tooMany: false };
    const key = `${ref.type}:${ref.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(ref);
  }
  return { refs, invalid: false, tooMany: false };
}

/** 供 N1 返回给前端的明确跳转语义；实际导航仍复用前端 resolveAiSourceNavigation。 */
export function getResourceRefNavigation(ref) {
  const normalized = normalizeResourceRef(ref);
  if (!normalized) return null;
  if (normalized.type === 'note') return { target: 'note-detail' };
  // 书签引用的主语义是访问原站，而不是进入书签管理页。URL 仅由同一主体下的
  // validateOwnedResourceRefs 查询取得，再经前端统一的 http(s) 校验后打开。
  if (normalized.type === 'bookmark') return { target: 'bookmark-url' };
  return { target: 'cloud-file', fileId: normalized.id };
}

/** 用 cheerio 真实解析 HTML,只枚举 a[href] 的 href;不扫描裸字符串,不接受 data-href / data-mce-href。 */
function collectHtmlHrefs(html) {
  const hrefs = [];
  const $ = load(html);
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (href) hrefs.push(href);
  });
  return hrefs;
}

/**
 * 用 marked token 解析 Markdown：
 * - 标准 Markdown 链接取 link token 的 href；
 * - Markdown 允许的原生 HTML 仅在 html token 内用同一 HTML 解析器提取真实 a[href]。
 *
 * 不能直接扫描整段 Markdown，否则 fenced / inline code、裸字符串和 data-href 都可能被误判；
 * 而只处理结构化 token 可同时覆盖编辑器实际会渲染的 <a>，并天然跳过代码 token。
 */
function collectMarkdownHrefs(md) {
  const hrefs = [];
  const tokens = marked.lexer(md, { gfm: true });
  marked.walkTokens(tokens, (token) => {
    if (token.type === 'link' && typeof token.href === 'string') {
      hrefs.push(token.href);
      return;
    }
    if (token.type === 'html' && typeof token.raw === 'string') {
      hrefs.push(...collectHtmlHrefs(token.raw));
    }
  });
  return hrefs;
}

/**
 * 从正文提取去重、保序的站内引用集合。type 决定解析策略(md 归一为 markdown)。
 * 超长正文(超过写入上限)抛错交调用方回滚——绝不截断后同步,否则会误删上限之后链接的关系。
 */
export function extractOwnedResourceRefs({ content, type } = {}) {
  const text = typeof content === 'string' ? content : '';
  if (!text) return [];
  if (text.length > MAX_CONTENT_LENGTH) {
    const err = new Error(`CONTENT_TOO_LONG: 笔记正文超过 ${MAX_CONTENT_LENGTH} 字符,拒绝解析引用`);
    err.code = 'CONTENT_TOO_LONG';
    err.status = 400;
    throw err;
  }
  let hrefs;
  try {
    hrefs = normalizeNoteType(type) === 'markdown' ? collectMarkdownHrefs(text) : collectHtmlHrefs(text);
  } catch (cause) {
    // 结构化解析器对极端畸形输入抛错时,宁可让保存失败回滚,也不返回不完整集合导致 sync 误删关系。
    const err = new Error('RESOURCE_REF_PARSE_FAILED: 解析笔记正文引用失败');
    err.code = 'RESOURCE_REF_PARSE_FAILED';
    err.status = 500;
    err.cause = cause;
    throw err;
  }
  const seen = new Set();
  const out = [];
  for (const h of hrefs) {
    const ref = parseResourceHref(h);
    if (!ref || !TARGET_TYPES.has(ref.type)) continue;
    const key = `${ref.type}:${ref.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }
  return out;
}

/**
 * 归属校验:按类型分批查资源表,要求当前归属 + del_flag=0。返回校验通过的 { type, id, name }。
 * 不存在 / 越权 / 已删的引用被过滤掉(调用方据此决定不写/不更新关系,但不阻断正文保存)。
 */
export async function validateOwnedResourceRefs(connection, { userId, refs } = {}) {
  if (!userId || !Array.isArray(refs) || refs.length === 0) return [];
  const byType = { bookmark: [], note: [], file: [] };
  for (const r of refs) {
    if (r && TARGET_TYPES.has(r.type) && r.id != null && r.id !== '') byType[r.type].push(String(r.id));
  }
  const valid = [];
  const runBatch = async (type, table, ownerCol, nameCol) => {
    const ids = [...new Set(byType[type])];
    if (!ids.length) return;
    const [rows] = await connection.query(
      `SELECT id, ${nameCol} AS name${type === 'bookmark' ? ', url' : ''} FROM ${table} WHERE ${ownerCol} = ? AND del_flag = 0 AND id IN (${ids.map(() => '?').join(',')})`,
      [userId, ...ids],
    );
    for (const row of rows || []) {
      valid.push({
        type,
        id: String(row.id),
        name: row.name || '',
        ...(type === 'bookmark' ? { url: String(row.url || '') } : {}),
      });
    }
  };
  await runBatch('bookmark', 'bookmark', 'user_id', 'name');
  await runBatch('note', 'note', 'create_by', 'title');
  await runBatch('file', 'files', 'create_by', 'file_name');
  return valid;
}

/**
 * 差异同步:把源笔记的引用关系与正文引用全集对齐(在调用方事务内),按 toInsert / toUpdateSnapshot / toDelete。
 * - toDelete:正文已移除该链接(旧集合有、正文全集无)。
 * - toInsert:正文新出现且当前归属正确、未软删的目标。
 * - toUpdateSnapshot:正文仍保留、旧集合已有、当前可用且名称变化的目标(只更新快照与 update_time,不删再插)。
 * - 目标软删但正文仍保留链接:validate 过滤掉它 → 既不 insert 也不 update,旧行(含旧快照)原样保留;
 *   目标恢复后下次保存会重新变为可用并可更新快照。
 * @param refs 正文提取的全集(extractOwnedResourceRefs 结果),非校验后的子集。
 */
export async function syncNoteResourceRefs(connection, { userId, noteId, refs } = {}) {
  if (!userId || !noteId) return { inserted: 0, updated: 0, deleted: 0 };
  const contentRefs = Array.isArray(refs)
    ? refs.filter((r) => r && TARGET_TYPES.has(r.type) && r.id != null && r.id !== '')
    : [];
  const contentKeys = new Set(contentRefs.map((r) => `${r.type}:${String(r.id)}`));

  const [oldRows] = await connection.query(
    'SELECT target_type, target_id, target_name_snapshot FROM note_resource_refs WHERE source_note_id = ? AND source_user_id = ?',
    [noteId, userId],
  );
  const oldMap = new Map((oldRows || []).map((r) => [`${r.target_type}:${String(r.target_id)}`, r]));

  // 校验正文中的全部引用(不只新出现),以便对仍保留的可用目标计算名称快照更新。
  const valid = await validateOwnedResourceRefs(connection, { userId, refs: contentRefs });

  const toDelete = (oldRows || []).filter((r) => !contentKeys.has(`${r.target_type}:${String(r.target_id)}`));
  const toInsert = valid.filter((v) => !oldMap.has(`${v.type}:${String(v.id)}`));
  const toUpdateSnapshot = valid.filter((v) => {
    const old = oldMap.get(`${v.type}:${String(v.id)}`);
    return old && String(old.target_name_snapshot || '') !== String(v.name || '');
  });

  let deleted = 0;
  for (const r of toDelete) {
    await connection.query(
      'DELETE FROM note_resource_refs WHERE source_note_id = ? AND target_type = ? AND target_id = ?',
      [noteId, r.target_type, String(r.target_id)],
    );
    deleted += 1;
  }
  let inserted = 0;
  for (const r of toInsert) {
    await connection.query(
      `INSERT INTO note_resource_refs (source_note_id, source_user_id, target_type, target_id, target_name_snapshot)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE target_name_snapshot = VALUES(target_name_snapshot), update_time = CURRENT_TIMESTAMP`,
      [noteId, userId, r.type, String(r.id), String(r.name || '').slice(0, 255)],
    );
    inserted += 1;
  }
  let updated = 0;
  for (const r of toUpdateSnapshot) {
    await connection.query(
      'UPDATE note_resource_refs SET target_name_snapshot = ?, update_time = CURRENT_TIMESTAMP WHERE source_note_id = ? AND target_type = ? AND target_id = ?',
      [String(r.name || '').slice(0, 255), noteId, r.type, String(r.id)],
    );
    updated += 1;
  }
  return { inserted, updated, deleted };
}

/**
 * 批量取引用目标的当前名称与可用状态(供 N1 阅读渲染;N0 仅导出+测试)。保持输入顺序映射。
 * db 可为 pool 或 connection。不存在/已删/越权 → available:false、title:null。
 */
export async function resolveOwnedResourceRefSummaries(db, { userId, refs } = {}) {
  if (!Array.isArray(refs) || refs.length === 0) return [];
  const valid = await validateOwnedResourceRefs(db, { userId, refs });
  const map = new Map(valid.map((v) => [`${v.type}:${v.id}`, v]));
  return refs.map((r) => {
    const hit = r && r.type && r.id != null ? map.get(`${r.type}:${String(r.id)}`) : null;
    return {
      type: r?.type,
      id: r?.id != null ? String(r.id) : null,
      title: hit ? hit.name : null,
      available: !!hit,
      ...(hit?.type === 'bookmark' ? { url: hit.url } : {}),
    };
  });
}

/**
 * 读取一个资源被哪些仍有效、仍归当前主体所有的笔记引用。
 *
 * 注意这里必须同时约束 r.source_user_id、n.create_by、目标归属和 n.del_flag：
 * - 关系表是派生数据，不能单独信任；
 * - 源笔记软删除后不应出现在反链；
 * - 目标不存在/越权/已删统一返回 available:false，不泄露存在性。
 *
 * 「查看更多」由调用方提升 limit 后重新读取，避免 cursor/offset 组合让隐藏来源在翻页时泄露。
 */
export async function listOwnedResourceBacklinks(
  db,
  { userId, targetType, targetId, limit = DEFAULT_RESOURCE_BACKLINK_LIMIT } = {},
) {
  const target = normalizeResourceRef({ type: targetType, id: targetId });
  if (!userId || !target) return { available: false, items: [], hasMore: false };

  const requested = Number(limit);
  const safeLimit = Number.isFinite(requested)
    ? Math.min(MAX_RESOURCE_BACKLINK_LIMIT, Math.max(1, Math.trunc(requested)))
    : DEFAULT_RESOURCE_BACKLINK_LIMIT;

  // 先重新确认当前目标属于请求主体。不能只查 note_resource_refs，否则已删、越权、
  // 或从未真正属于该主体的目标会成为可探测的反链入口。
  const [ownedTarget] = await validateOwnedResourceRefs(db, { userId, refs: [target] });
  if (!ownedTarget) return { available: false, items: [], hasMore: false };

  const [rows] = await db.query(
    `SELECT n.id, n.title, n.update_time
     FROM note_resource_refs r
     INNER JOIN note n
       ON n.id = r.source_note_id
      AND n.create_by = r.source_user_id
      AND n.del_flag = 0
     WHERE r.source_user_id = ?
       AND n.create_by = ?
       AND r.target_type = ?
       AND r.target_id = ?
     ORDER BY COALESCE(n.update_time, n.create_time) DESC, n.id DESC
     LIMIT ?`,
    [userId, userId, target.type, target.id, safeLimit + 1],
  );
  const page = Array.isArray(rows) ? rows : [];
  const hasMore = page.length > safeLimit;
  return {
    available: true,
    items: page.slice(0, safeLimit).map((row) => ({
      id: String(row.id || ''),
      title: String(row.title || ''),
      updateTime: row.update_time ?? row.updateTime ?? null,
    })),
    hasMore,
  };
}

/** 永久删除源笔记时,在同一清理事务内删除其全部引用关系。 */
export async function deleteNoteResourceRefs(connection, { userId, noteId } = {}) {
  if (!userId || !noteId) return { deleted: 0 };
  const [res] = await connection.query(
    'DELETE FROM note_resource_refs WHERE source_note_id = ? AND source_user_id = ?',
    [noteId, userId],
  );
  return { deleted: res?.affectedRows || 0 };
}

/**
 * 永久清理一批源笔记时,在同一清理事务内删除它们的全部出边引用关系(批量)。
 * 供回收站三处永久删除(permanentDelete / emptyTrash / cleanupExpiredNotes)复用,
 * 与 purgeNoteImages / purgeNoteVersions 同一语义:noteIds 是即将被物理删除的权威目标列表,
 * 删其全部出边引用(source_note_id 是主键组成,按它删安全,无需再过滤 userId)。
 */
export async function deleteNoteResourceRefsForNotes(connection, noteIds = []) {
  const ids = [
    ...new Set((Array.isArray(noteIds) ? noteIds : []).filter((v) => v != null && v !== '').map((v) => String(v))),
  ];
  if (!ids.length) return { deleted: 0 };
  const ph = ids.map(() => '?').join(',');
  const [res] = await connection.query(`DELETE FROM note_resource_refs WHERE source_note_id IN (${ph})`, ids);
  return { deleted: res?.affectedRows || 0 };
}
