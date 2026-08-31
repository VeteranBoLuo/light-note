import { AI_SKILL_RESOURCE_TYPES, AI_SKILL_RESULT_KINDS } from '@lightnote/shared/ai-skill-protocol';
import { describe, expect, it } from 'vitest';
import { AI_SKILL_AUTHENTICATED_ROLES, AI_SKILL_PUBLIC_ROLES } from './accessPolicy.js';
import { listAiSkills, resolveAiSkill } from './registry.js';

const EXPECTED_SKILLS = Object.freeze([
  ['search.answer', 'search', 'read'],
  ['help.answer', 'help', 'read'],
  ['search.summarize_selected', 'search', 'read'],
  ['search.compare_selected', 'search', 'read'],
  ['file.summarize', 'file', 'read'],
  ['file.ask', 'file', 'read'],
  ['file.compare', 'file', 'read'],
  ['file.create_note_preview', 'file', 'preview'],
  ['note.batch_summarize', 'note', 'read'],
  ['note.batch_compare', 'note', 'read'],
  ['note.create_from_sources', 'note', 'preview'],
  ['note.transform_text', 'note', 'preview'],
  ['bookmark.summarize_page', 'bookmark', 'read'],
  ['bookmark.compare_pages', 'bookmark', 'read'],
  ['bookmark.create_note_preview', 'bookmark', 'preview'],
  ['bookmark.parse_url', 'bookmark', 'preview'],
  ['todo.parse_draft', 'todo', 'preview'],
  ['todo.breakdown', 'todo', 'preview'],
  ['note.extract_todos', 'note', 'preview'],
  ['file.extract_todos', 'file', 'preview'],
]);
const EXPECTED_INTERNAL_SKILLS = Object.freeze([
  ['toolbox.idea_to_draft', 'toolbox', 'read'],
  ['toolbox.material_to_note', 'toolbox', 'read'],
  ['toolbox.research_brief', 'toolbox', 'read'],
  ['toolbox.study_kit', 'toolbox', 'read'],
  ['toolbox.concept_map', 'toolbox', 'read'],
  ['toolbox.action_plan', 'toolbox', 'read'],
  ['toolbox.source_comparison', 'toolbox', 'read'],
  ['toolbox.knowledge_audit', 'toolbox', 'read'],
]);
const ALL_EXPECTED_SKILLS = Object.freeze([...EXPECTED_SKILLS, ...EXPECTED_INTERNAL_SKILLS]);

const ALLOWED_ROLES = new Set(AI_SKILL_PUBLIC_ROLES);
const RESOURCE_TYPES = new Set(AI_SKILL_RESOURCE_TYPES);
const RESULT_KINDS = new Set(AI_SKILL_RESULT_KINDS);

describe('AI Skill registry contract', () => {
  it('固定登记公共 Skill 与工具箱内部 Profile，避免能力静默增删或改名', () => {
    expect(listAiSkills()).toEqual(
      ALL_EXPECTED_SKILLS.map(([id, domain, effect]) => ({ id, version: 1, domain, effect })),
    );
    expect(listAiSkills({ includeInternal: false })).toEqual(
      EXPECTED_SKILLS.map(([id, domain, effect]) => ({ id, version: 1, domain, effect })),
    );
  });

  it.each(ALL_EXPECTED_SKILLS)('%s 的定义遵守统一能力、安全和上下文契约', (id, domain, effect) => {
    const definition = resolveAiSkill(id, 1);
    const policy = definition.contextPolicy;

    expect(definition).toMatchObject({ id, version: 1, domain, effect });
    expect(Object.isFrozen(definition)).toBe(true);
    expect(definition.allowedRoles).toEqual(expect.arrayContaining(AI_SKILL_AUTHENTICATED_ROLES));
    expect(definition.allowedRoles.every((role) => ALLOWED_ROLES.has(role))).toBe(true);
    expect(new Set(definition.allowedRoles).size).toBe(definition.allowedRoles.length);

    expect(policy).toEqual(
      expect.objectContaining({
        resourceTypes: expect.any(Array),
        minResources: expect.any(Number),
        maxResources: expect.any(Number),
        allowConversation: expect.any(Boolean),
        historyTurns: expect.any(Number),
        freezeScopeAcrossThread: true,
      }),
    );
    expect(Number.isSafeInteger(policy.minResources)).toBe(true);
    expect(Number.isSafeInteger(policy.maxResources)).toBe(true);
    expect(policy.minResources).toBeGreaterThanOrEqual(0);
    expect(policy.maxResources).toBeGreaterThanOrEqual(policy.minResources);
    expect(policy.maxResources).toBeLessThanOrEqual(20);
    expect(policy.historyTurns).toBeGreaterThanOrEqual(0);
    expect(policy.historyTurns).toBeLessThanOrEqual(5);
    expect(policy.allowConversation).toBe(policy.historyTurns > 0);
    expect(policy.resourceTypes.every((type) => RESOURCE_TYPES.has(type))).toBe(true);
    expect(new Set(policy.resourceTypes).size).toBe(policy.resourceTypes.length);

    expect(definition.modelPolicy).toEqual(
      expect.objectContaining({
        temperature: expect.any(Number),
        maxTokens: expect.any(Number),
      }),
    );
    expect(Number.isFinite(definition.modelPolicy.temperature)).toBe(true);
    expect(Number.isSafeInteger(definition.modelPolicy.maxTokens)).toBe(true);
    expect(definition.modelPolicy.maxTokens).toBeGreaterThan(0);
    expect(RESULT_KINDS.has(definition.outputContract.kind)).toBe(true);
    expect(typeof definition.outputContract.requireSources).toBe('boolean');

    expect(definition.validateInput).toEqual(expect.any(Function));
    expect(definition.prepare).toEqual(expect.any(Function));
    expect(definition.execute).toBeUndefined();
    expect(definition.apply).toBeUndefined();
    expect(definition.write).toBeUndefined();
    expect(() => definition.validateInput({ __unknown: true })).toThrowError(
      expect.objectContaining({ code: 'AI_SKILL_INPUT_UNKNOWN_FIELD' }),
    );
  });

  it('未登记版本必须失败关闭', () => {
    expect(() => resolveAiSkill('search.answer', 2)).toThrowError(
      expect.objectContaining({ code: 'AI_SKILL_NOT_FOUND', status: 404 }),
    );
  });
});
