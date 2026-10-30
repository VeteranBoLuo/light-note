import { createHash } from 'node:crypto';

export const knowledgeMaintenanceHash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Excludes timestamps and actor metadata: a repeated identical edit is not a content conflict. */
export function knowledgeSnapshotHash(row) {
  return knowledgeMaintenanceHash([
    row.id,
    row.title,
    row.content,
    row.category,
    row.help_section ?? null,
    row.status,
    row.type,
    Number(row.sort),
    Number(row.admin_archived || 0),
  ]);
}

export function knowledgePatch(entry) {
  return Object.fromEntries(
    ['title', 'content', 'category', 'helpSection', 'status', 'type'].map((key) => [key, entry[key]]),
  );
}

export function knowledgeMatches(row, input) {
  return Boolean(
    row &&
    !Number(row.admin_archived) &&
    row.title === input.title &&
    row.content === input.content &&
    row.category === input.category &&
    (row.help_section ?? null) === (input.category === '帮助中心' ? input.helpSection : null) &&
    row.status === input.status &&
    row.type === input.type,
  );
}

function fail(code) {
  throw Object.assign(new Error(code), { code });
}

export function buildKnowledgeMaintenancePlan(rows, entries) {
  const keys = new Set(),
    titles = new Set(),
    targets = new Set();
  const items = entries.map((entry) => {
    if (!entry.key || !entry.title || !entry.content || keys.has(entry.key) || titles.has(entry.title))
      fail('KNOWLEDGE_MANIFEST_INVALID');
    keys.add(entry.key);
    titles.add(entry.title);
    const candidates = rows.filter((row) => entry.matchTitles.includes(row.title));
    if (candidates.some((row) => Number(row.admin_archived))) fail('KNOWLEDGE_TARGET_ARCHIVED');
    if (candidates.length > 1) fail('KNOWLEDGE_TARGET_AMBIGUOUS');
    const before = candidates[0] || null;
    if (!before && entry.required) fail('KNOWLEDGE_TARGET_MISSING');
    if (before && before.status !== entry.status) fail('KNOWLEDGE_VISIBILITY_CHANGED');
    if (before && targets.has(before.id)) fail('KNOWLEDGE_TARGET_REPEATED');
    if (before) targets.add(before.id);
    const input = knowledgePatch(entry);
    return {
      key: entry.key,
      input,
      before,
      expectedSnapshot: before ? knowledgeSnapshotHash(before) : null,
      action: !before ? 'create' : knowledgeMatches(before, input) ? 'unchanged' : 'update',
    };
  });
  return {
    version: 1,
    manifestHash: knowledgeMaintenanceHash(entries),
    items,
    untouched: rows
      .filter((row) => !targets.has(row.id))
      .map((row) => ({ id: row.id, hash: knowledgeSnapshotHash(row), archived: Number(row.admin_archived || 0) })),
  };
}

/** Check the entire reviewed set before the first write; individual updates also lock and guard their row. */
export function assertKnowledgePlanCurrent(plan, rows) {
  for (const item of plan.items) {
    const current = item.before
      ? rows.find((row) => row.id === item.before.id)
      : rows.find((row) => row.title === item.input.title);
    if (knowledgeMatches(current, item.input)) continue;
    if (item.before ? !current || knowledgeSnapshotHash(current) !== item.expectedSnapshot : Boolean(current))
      fail('KNOWLEDGE_CHANGED');
  }
}

export function summarizeKnowledgePlan(plan) {
  return {
    create: plan.items.filter((item) => item.action === 'create').map((item) => item.input.title),
    update: plan.items.filter((item) => item.action === 'update').map((item) => item.input.title),
    unchanged: plan.items.filter((item) => item.action === 'unchanged').map((item) => item.input.title),
    archivedRetained: plan.untouched.filter((item) => item.archived).length,
  };
}
