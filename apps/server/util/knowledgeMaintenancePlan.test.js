import { describe, expect, it } from 'vitest';
import {
  assertKnowledgePlanCurrent,
  buildKnowledgeMaintenancePlan,
  knowledgeMatches,
  knowledgeSnapshotHash,
} from './knowledgeMaintenancePlan.js';
import { buildHelpKnowledgeRefreshEntries } from './helpKnowledgeRefreshContent.js';

const row = {
  id: 'existing-id',
  title: '旧标题',
  content: '旧内容',
  category: '帮助中心',
  help_section: '快速上手',
  status: 'public',
  type: 'markdown',
  sort: 3,
  admin_archived: 0,
};
const entry = {
  key: 'guide',
  title: '新标题',
  content: '新内容',
  category: '帮助中心',
  helpSection: '快速上手',
  status: 'public',
  type: 'markdown',
  required: true,
  matchTitles: ['旧标题', '新标题'],
};
const resultRow = (item, id = row.id) => ({ ...row, id, ...item.input, help_section: item.input.helpSection });

describe('knowledge maintenance review boundary', () => {
  it('renames and updates an existing article without changing its link or unrelated archived articles', () => {
    const archived = { ...row, id: 'archived', title: '旧助手', status: 'internal', admin_archived: 1 };
    const plan = buildKnowledgeMaintenancePlan([row, archived], [entry]);
    expect(plan.items[0]).toMatchObject({
      action: 'update',
      before: { id: row.id },
      expectedSnapshot: knowledgeSnapshotHash(row),
    });
    expect(plan.untouched).toEqual([{ id: archived.id, hash: knowledgeSnapshotHash(archived), archived: 1 }]);
    expect(knowledgeMatches(resultRow(plan.items[0]), entry)).toBe(true);
  });
  it('rerunning the same content is unchanged, including a renamed article', () => {
    const plan = buildKnowledgeMaintenancePlan([row], [entry]);
    const current = resultRow(plan.items[0]);
    expect(buildKnowledgeMaintenancePlan([current], [entry]).items[0].action).toBe('unchanged');
    expect(() => assertKnowledgePlanCurrent(plan, [current])).not.toThrow();
  });
  it('never recreates archived matches, publishes an internal match, or guesses among duplicate titles', () => {
    expect(() =>
      buildKnowledgeMaintenancePlan([{ ...row, admin_archived: 1 }], [{ ...entry, required: false }]),
    ).toThrow('KNOWLEDGE_TARGET_ARCHIVED');
    expect(() => buildKnowledgeMaintenancePlan([{ ...row, status: 'internal' }], [entry])).toThrow(
      'KNOWLEDGE_VISIBILITY_CHANGED',
    );
    expect(() => buildKnowledgeMaintenancePlan([row, { ...row, id: 'another' }], [entry])).toThrow(
      'KNOWLEDGE_TARGET_AMBIGUOUS',
    );
    expect(() => buildKnowledgeMaintenancePlan([], [entry])).toThrow('KNOWLEDGE_TARGET_MISSING');
  });
  it('detects changed or missing rows and new title collisions before applying any item', () => {
    const fresh = { ...entry, key: 'fresh', title: '新教程', matchTitles: ['新教程'], required: false };
    const plan = buildKnowledgeMaintenancePlan([row], [entry, fresh]);
    for (const changed of [[{ ...row, content: '另一次编辑' }], [], [row, { ...row, id: 'new', title: fresh.title }]])
      expect(() => assertKnowledgePlanCurrent(plan, changed)).toThrow('KNOWLEDGE_CHANGED');
    expect(() => assertKnowledgePlanCurrent(plan, [row, resultRow(plan.items[1], 'new')])).not.toThrow();
  });
  it('does not allow manifest aliases to overwrite the same row twice', () => {
    expect(() => buildKnowledgeMaintenancePlan([row], [entry, { ...entry, key: 'alias', title: '另一标题' }])).toThrow(
      'KNOWLEDGE_TARGET_REPEATED',
    );
  });
});

describe('product help content manifest', () => {
  const facts = {
    ranks: Array.from({ length: 15 }, (_, index) => ({
      level: index + 1,
      aiTokenDaily: 100000 + index * 10000,
      spaceMb: 1024 + index * 256,
      trashDays: index < 4 ? 30 : 60,
    })),
    guestQuota: 50000,
    makeupWindowDays: 30,
    galaxyFrame: { cost: 9000, minLevel: 4 },
  };
  it('has unique targets, visible help sections, and renderable content with no missing runtime values', () => {
    const entries = buildHelpKnowledgeRefreshEntries(facts);
    expect(new Set(entries.map((item) => item.key)).size).toBe(entries.length);
    expect(new Set(entries.flatMap((item) => item.matchTitles)).size).toBe(
      entries.flatMap((item) => item.matchTitles).length,
    );
    for (const item of entries) {
      expect(item.content.length).toBeGreaterThan(50);
      expect(item.content).not.toMatch(/undefined|NaN/);
      if (item.category === '帮助中心') expect(item.helpSection).toBeTruthy();
      if (item.status === 'internal') expect(item.category).not.toBe('帮助中心');
    }
  });
  it('fails closed when runtime entitlements or product catalog facts are unavailable', () => {
    expect(() => buildHelpKnowledgeRefreshEntries({ ...facts, galaxyFrame: null })).toThrow('HELP_FACTS_INVALID');
    expect(() => buildHelpKnowledgeRefreshEntries({ ...facts, ranks: facts.ranks.slice(1) })).toThrow(
      'HELP_FACTS_INVALID',
    );
  });
});
