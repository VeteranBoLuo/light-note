import { describe, expect, it } from 'vitest';
import { ROOT_E2E_TOOL_CASES, rootE2EToolNames, selectRootE2ECases } from './rootE2ECases.js';
import {
  ROOT_E2E_CLIENT_CAPABILITIES,
  answerMentionsCount,
  formatRootE2EText,
  parseRootE2EArgs,
  validateRootE2ECoverage,
} from './rootE2ERunner.js';

describe('root 真实链路门禁', () => {
  it('完整矩阵中的每个工具只出现一次', () => {
    const names = rootE2EToolNames();
    expect(ROOT_E2E_TOOL_CASES).toHaveLength(55);
    expect(new Set(names).size).toBe(names.length);
    expect(validateRootE2ECoverage(names)).toEqual({
      valid: true,
      registered: 55,
      covered: 55,
      missing: [],
      stale: [],
      duplicateCases: [],
    });
  });

  it('发现新增未覆盖工具、过期用例和重复用例', () => {
    const duplicate = [...ROOT_E2E_TOOL_CASES, ROOT_E2E_TOOL_CASES[0]];
    expect(validateRootE2ECoverage(['brand_new_tool'], duplicate)).toMatchObject({
      valid: false,
      missing: ['brand_new_tool'],
      duplicateCases: ['create_note'],
    });
  });

  it('真实全量执行必须显式确认写入，dry-run 不需要', () => {
    expect(parseRootE2EArgs([])).toMatchObject({ live: false, suite: 'full', executeWrites: false });
    expect(() => parseRootE2EArgs(['--live'])).toThrow(/--execute-writes/u);
    expect(parseRootE2EArgs(['--live', '--execute-writes', '--provider', 'deepseek'])).toMatchObject({
      live: true,
      executeWrites: true,
      provider: 'deepseek',
    });
  });

  it('支持按用例 ID 定点复测，并拒绝未知用例', () => {
    expect(
      parseRootE2EArgs(['--live', '--execute-writes', '--case', 'create-note,create-todo', '--case', 'query-notes'])
        .caseIds,
    ).toEqual(['create-note', 'create-todo', 'query-notes']);
    expect(() => parseRootE2EArgs(['--case', 'missing-case'])).toThrow('未知用例');
  });

  it('真实客户端协议包含来源隔离能力，并支持只运行对应的两轮回归', () => {
    expect(ROOT_E2E_CLIENT_CAPABILITIES).toContain('grounding_scope_v2');
    expect(
      parseRootE2EArgs([
        '--live',
        '--case',
        'query-bookmarks',
        '--no-artifact-regression',
        '--grounding-scope-regression',
      ]),
    ).toMatchObject({
      live: true,
      executeWrites: false,
      groundingScopeRegression: true,
    });
  });

  it('定点报告不会把未运行的其他回归误报成通过', () => {
    const output = formatRootE2EText({
      passed: true,
      provider: 'deepseek',
      summary: { passedTools: 1, totalTools: 1, executedWrites: 0, totalWrites: 0, replayVerified: 0 },
      groundingScope: { passed: true, outcome: 'answer' },
      artifact: { passed: true, outcome: 'skipped' },
      cleanup: { passed: true },
      reportPath: '/tmp/redacted.json',
      cases: [],
    });

    expect(output).toContain('混合来源→仅查书签隔离：通过');
    expect(output).toContain('笔记 7 天→今天/字数/连续续写：未运行');
  });

  it('定点复测可收窄长草稿改写轮数，但正式默认仍保持五轮', () => {
    expect(parseRootE2EArgs([]).artifactRefinementRounds).toBe(5);
    expect(parseRootE2EArgs(['--artifact-refinement-rounds', '1']).artifactRefinementRounds).toBe(1);
    expect(() => parseRootE2EArgs(['--artifact-refinement-rounds', '0'])).toThrow('仅支持 1 到 5');
    expect(() => parseRootE2EArgs(['--artifact-refinement-rounds', '6'])).toThrow('仅支持 1 到 5');
  });

  it('零条结果同时接受数字 0 和自然中文的“没有笔记”', () => {
    expect(answerMentionsCount('今天有 0 篇笔记。', 0)).toBe(true);
    expect(answerMentionsCount('今天（2026-08-20，截至 00:06）没有找到笔记。', 0)).toBe(true);
    expect(answerMentionsCount('最近 7 天没有找到书签。', 0)).toBe(true);
    expect(answerMentionsCount('今天暂无新增记录。', 0)).toBe(true);
    expect(answerMentionsCount('最近 7 天共有六条书签。', 6)).toBe(true);
    expect(answerMentionsCount('今天有 1 篇笔记。', 0)).toBe(false);
  });

  it('关键集只保留相邻管理员语义回归', () => {
    expect(selectRootE2ECases('critical').map((item) => item.toolName)).toEqual([
      'query_notes',
      'query_users',
      'get_resource_creation_ranking',
      'query_platform_resources',
      'query_new_user_resources',
    ]);
  });
});
