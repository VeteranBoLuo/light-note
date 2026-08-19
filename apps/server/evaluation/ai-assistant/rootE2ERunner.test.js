import { describe, expect, it } from 'vitest';
import { ROOT_E2E_TOOL_CASES, rootE2EToolNames, selectRootE2ECases } from './rootE2ECases.js';
import { parseRootE2EArgs, validateRootE2ECoverage } from './rootE2ERunner.js';

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
