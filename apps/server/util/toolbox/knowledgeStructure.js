import pool from '../../db/index.js';
import { buildNoteTree } from '../services/noteTreeService.js';
import { toolboxError } from './errors.js';

const MAX_KNOWLEDGE_NOTES = 20_000;
const STALE_AFTER_DAYS = 180;
const DEEP_NOTE_DEPTH = 6;

export const ORGANIZE_KNOWLEDGE_ISSUE_KINDS = Object.freeze([
  'invalid_parent',
  'empty',
  'duplicate_title',
  'untitled',
  'deep',
]);

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeTitle(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase();
}

function visibleContent(value, type) {
  const source = String(value || '');
  if (String(type || '').toLocaleLowerCase() === 'drawing') {
    try {
      const scene = JSON.parse(source);
      const elements = Array.isArray(scene?.elements) ? scene.elements : Array.isArray(scene) ? scene : [];
      return elements.length ? 'drawing' : '';
    } catch {
      return source.trim();
    }
  }
  return source
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, '')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&(?:nbsp|ensp|emsp|zwnj|zwj);/giu, ' ')
    .replace(/&#(?:160|8203);/gu, ' ')
    .replace(/[\s\u200b\ufeff#>*_`~\-[\](){}]+/gu, ' ')
    .trim();
}

function issue(kind, severity, node, reason) {
  return {
    kind,
    severity,
    noteId: node.id,
    title: node.title || '未命名文档',
    path: node.path,
    reason,
  };
}

function recommendation(code, count, priority) {
  return { code, count, priority };
}

export function analyzeKnowledgeStructure(
  rows = [],
  { now = Date.now(), issueKinds = null, issueOffset = 0, issueLimit = 500, includeNodes = true } = {},
) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const snapshot = buildNoteTree(sourceRows);
  const metadataById = new Map(sourceRows.map((row) => [String(row.id), row]));
  const pathMemo = new Map();

  function resolvePath(node) {
    if (pathMemo.has(node.id)) return pathMemo.get(node.id);
    const chain = [];
    const visited = new Set();
    let current = node;
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      chain.push(current);
      current = current.effectiveParentId ? snapshot.nodesById.get(current.effectiveParentId) : null;
    }
    const ordered = chain.reverse();
    const resolved = {
      depth: ordered.length || 1,
      path: ordered.map((item) => item.title || '未命名文档').join(' / '),
    };
    pathMemo.set(node.id, resolved);
    return resolved;
  }

  const nodes = [...snapshot.nodesById.values()].map((node) => {
    const row = metadataById.get(node.id) || {};
    const path = resolvePath(node);
    const explicitContentEmpty = row.content_empty ?? row.contentEmpty;
    return {
      id: node.id,
      parentId: node.parentId,
      effectiveParentId: node.effectiveParentId,
      title: node.title || '',
      type: node.type,
      depth: path.depth,
      path: path.path,
      childCount: snapshot.childrenByParent.get(node.id)?.length || 0,
      tagCount: numberOrZero(row.tag_count ?? row.tagCount),
      outgoingReferenceCount: numberOrZero(row.outgoing_reference_count ?? row.outgoingReferenceCount),
      incomingReferenceCount: numberOrZero(row.incoming_reference_count ?? row.incomingReferenceCount),
      contentLength: numberOrZero(row.content_length ?? row.contentLength),
      contentEmpty:
        explicitContentEmpty == null
          ? !visibleContent(row.content_sample ?? row.contentSample, node.type)
          : Boolean(numberOrZero(explicitContentEmpty)),
      invalidParent: Boolean(node.invalidParent),
      isTop: Boolean(node.isTop),
      sort: numberOrZero(node.sort),
      updatedAt: row.update_time ?? row.updateTime ?? null,
      createdAt: row.create_time ?? row.createTime ?? null,
    };
  });

  const staleThreshold = Number(now) - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
  const titleGroups = new Map();
  for (const node of nodes) {
    const key = normalizeTitle(node.title);
    if (!key) continue;
    if (!titleGroups.has(key)) titleGroups.set(key, []);
    titleGroups.get(key).push(node);
  }
  const duplicateGroups = [...titleGroups.values()].filter((group) => group.length > 1);
  const duplicateIds = new Set(duplicateGroups.flatMap((group) => group.map((node) => node.id)));
  const issueItems = [];
  for (const node of nodes) {
    const updatedTime = new Date(node.updatedAt || 0).getTime();
    if (node.invalidParent) issueItems.push(issue('invalid_parent', 'high', node, '父级目录缺失或结构形成循环'));
    if (node.contentEmpty) issueItems.push(issue('empty', 'high', node, '正文没有可阅读内容'));
    if (!normalizeTitle(node.title) || ['未命名文档', 'untitled'].includes(normalizeTitle(node.title))) {
      issueItems.push(issue('untitled', 'medium', node, '标题无法帮助检索与识别内容'));
    }
    if (duplicateIds.has(node.id)) issueItems.push(issue('duplicate_title', 'medium', node, '知识库中存在相同标题'));
    if (node.depth >= DEEP_NOTE_DEPTH)
      issueItems.push(issue('deep', 'medium', node, `位于第 ${node.depth} 层，查找成本较高`));
    if (node.tagCount === 0) issueItems.push(issue('untagged', 'low', node, '尚未添加标签'));
    if (updatedTime > 0 && updatedTime < staleThreshold)
      issueItems.push(issue('stale', 'low', node, '超过 180 天未更新'));
  }

  const issueCounts = issueItems.reduce((counts, item) => {
    counts[item.kind] = numberOrZero(counts[item.kind]) + 1;
    return counts;
  }, {});
  const total = nodes.length;
  const affected = (kind) => numberOrZero(issueCounts[kind]);
  const ratio = (count) => (total ? Math.min(1, count / total) : 0);
  const penalty =
    ratio(affected('empty')) * 24 +
    ratio(affected('invalid_parent')) * 20 +
    ratio(affected('duplicate_title')) * 14 +
    ratio(affected('untitled')) * 10 +
    ratio(affected('deep')) * 8 +
    ratio(affected('untagged')) * 8 +
    ratio(affected('stale')) * 8;
  const healthScore = total ? Math.max(0, Math.min(100, Math.round(100 - penalty))) : 100;
  const recommendations = [
    affected('invalid_parent') ? recommendation('repair_structure', affected('invalid_parent'), 'high') : null,
    affected('empty') ? recommendation('review_empty', affected('empty'), 'high') : null,
    affected('duplicate_title') ? recommendation('resolve_duplicates', affected('duplicate_title'), 'medium') : null,
    affected('untagged') ? recommendation('add_tags', affected('untagged'), 'low') : null,
    affected('stale') ? recommendation('review_stale', affected('stale'), 'low') : null,
  ].filter(Boolean);

  const severityRank = { high: 0, medium: 1, low: 2 };
  issueItems.sort(
    (left, right) =>
      severityRank[left.severity] - severityRank[right.severity] || left.path.localeCompare(right.path, 'zh-CN'),
  );
  nodes.sort((left, right) => left.path.localeCompare(right.path, 'zh-CN'));

  const selectedKinds = Array.isArray(issueKinds) && issueKinds.length ? new Set(issueKinds) : null;
  const selectedIssues = selectedKinds ? issueItems.filter((item) => selectedKinds.has(item.kind)) : issueItems;
  const normalizedOffset = Math.max(0, Math.floor(numberOrZero(issueOffset)));
  const normalizedLimit = Math.max(0, Math.floor(numberOrZero(issueLimit)));
  const selectedSeverityCounts = selectedIssues.reduce(
    (counts, item) => {
      counts[item.severity] += 1;
      return counts;
    },
    { high: 0, medium: 0, low: 0 },
  );

  return {
    scannedAt: new Date(Number(now)).toISOString(),
    policy: { staleAfterDays: STALE_AFTER_DAYS, deepNoteDepth: DEEP_NOTE_DEPTH },
    summary: {
      total,
      roots: nodes.filter((node) => !node.effectiveParentId).length,
      maxDepth: nodes.reduce((max, node) => Math.max(max, node.depth), 0),
      tagged: nodes.filter((node) => node.tagCount > 0).length,
      linked: nodes.filter((node) => node.outgoingReferenceCount + node.incomingReferenceCount > 0).length,
      empty: affected('empty'),
      stale: affected('stale'),
      invalidParents: affected('invalid_parent'),
      duplicateGroups: duplicateGroups.length,
      duplicateNotes: duplicateIds.size,
      healthScore,
    },
    issueCounts,
    issues: selectedIssues.slice(normalizedOffset, normalizedOffset + normalizedLimit),
    issueTotal: issueItems.length,
    selectedIssueTotal: selectedIssues.length,
    selectedAffectedNoteCount: new Set(selectedIssues.map((item) => item.noteId)).size,
    selectedSeverityCounts,
    recommendations,
    nodes: includeNodes ? nodes : [],
  };
}

export async function getToolboxKnowledgeOverview({ userId, db = pool, analysisOptions = {} } = {}) {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) throw toolboxError('TOOLBOX_USER_REQUIRED', '缺少用户身份', 401);
  const [rows] = await db.query(
    `SELECT n.id,
            n.parent_id,
            n.title,
            n.type,
            n.revision,
            n.sort,
            n.is_top,
            n.update_time,
            n.create_time,
            CHAR_LENGTH(COALESCE(n.content, '')) AS content_length,
            CASE
              WHEN CHAR_LENGTH(TRIM(COALESCE(n.content, ''))) = 0 THEN 1
              WHEN LOWER(COALESCE(n.type, '')) = 'drawing' AND JSON_VALID(n.content) THEN
                CASE
                  WHEN JSON_TYPE(JSON_EXTRACT(n.content, '$')) = 'ARRAY' THEN
                    CASE WHEN COALESCE(JSON_LENGTH(JSON_EXTRACT(n.content, '$')), 0) = 0 THEN 1 ELSE 0 END
                  ELSE
                    CASE WHEN COALESCE(JSON_LENGTH(JSON_EXTRACT(n.content, '$.elements')), 0) = 0 THEN 1 ELSE 0 END
                END
              WHEN CHAR_LENGTH(
                TRIM(
                  REPLACE(
                    REPLACE(
                      REPLACE(
                        REPLACE(
                          REPLACE(
                            REPLACE(
                              REPLACE(
                                REPLACE(
                                  REPLACE(
                                    REPLACE(LOWER(LEFT(COALESCE(n.content, ''), 1024)), '<p>', ''),
                                    '</p>',
                                    ''
                                  ),
                                  '<br>',
                                  ''
                                ),
                                '<br/>',
                                ''
                              ),
                              '<br />',
                              ''
                            ),
                            '&nbsp;',
                            ''
                          ),
                          '&#160;',
                          ''
                        ),
                        CHAR(10),
                        ''
                      ),
                      CHAR(13),
                      ''
                    ),
                    CHAR(9),
                    ''
                  )
                )
              ) = 0 THEN 1
              ELSE 0
            END AS content_empty,
            COALESCE(tag_stats.tag_count, 0) AS tag_count,
            COALESCE(outgoing_stats.reference_count, 0) AS outgoing_reference_count,
            COALESCE(incoming_stats.reference_count, 0) AS incoming_reference_count
       FROM note n
       LEFT JOIN (
         SELECT resource_id, COUNT(DISTINCT tag_id) AS tag_count
           FROM resource_tag_relations
          WHERE user_id = ? AND resource_type = 'note'
          GROUP BY resource_id
       ) tag_stats ON tag_stats.resource_id = n.id
       LEFT JOIN (
         SELECT source_note_id, COUNT(*) AS reference_count
           FROM note_resource_refs
          WHERE source_user_id = ?
          GROUP BY source_note_id
       ) outgoing_stats ON outgoing_stats.source_note_id = n.id
       LEFT JOIN (
         SELECT target_id, COUNT(*) AS reference_count
           FROM note_resource_refs
          WHERE source_user_id = ? AND target_type = 'note'
          GROUP BY target_id
       ) incoming_stats ON incoming_stats.target_id = n.id
      WHERE n.create_by = ? AND n.del_flag = 0
      ORDER BY n.is_top DESC, n.sort, n.update_time DESC, n.id DESC
      LIMIT ${MAX_KNOWLEDGE_NOTES + 1}`,
    [normalizedUserId, normalizedUserId, normalizedUserId, normalizedUserId],
  );
  if (rows.length > MAX_KNOWLEDGE_NOTES) {
    throw toolboxError(
      'TOOLBOX_KNOWLEDGE_TOO_LARGE',
      `当前知识库超过 ${MAX_KNOWLEDGE_NOTES} 篇笔记，暂无法在一次巡检中完整分析`,
      413,
    );
  }
  return analyzeKnowledgeStructure(rows, analysisOptions);
}

export const knowledgeStructureInternals = Object.freeze({
  MAX_KNOWLEDGE_NOTES,
  STALE_AFTER_DAYS,
  DEEP_NOTE_DEPTH,
  normalizeTitle,
  visibleContent,
});
