import { describe, expect, it } from 'vitest';
import { ROOT_E2E_TOOL_CASES, rootE2EToolNames, selectRootE2ECases } from './rootE2ECases.js';
import {
  ROOT_E2E_CLIENT_CAPABILITIES,
  ROOT_E2E_WEB_FIXTURE_URL,
  applyRootE2ERuntimeProfile,
  answerMentionsCount,
  assertRootE2ERuntimeTrace,
  ensureArtifactMaterialFixture,
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
    expect(parseRootE2EArgs([])).toMatchObject({ live: false, suite: 'full', executeWrites: false, runtime: 'v2' });
    expect(() => parseRootE2EArgs(['--live'])).toThrow(/--execute-writes/u);
    expect(parseRootE2EArgs(['--live', '--execute-writes', '--provider', 'deepseek'])).toMatchObject({
      live: true,
      executeWrites: true,
      provider: 'deepseek',
    });
  });

  it('显式 V3 档位覆盖残留环境，V2 档位也不会被外部 V3 配置污染', () => {
    expect(parseRootE2EArgs(['--runtime', 'v3'])).toMatchObject({ runtime: 'v3' });
    expect(() => parseRootE2EArgs(['--runtime'])).toThrow('--runtime 后必须提供 v2 或 v3');
    expect(() => parseRootE2EArgs(['--runtime', 'legacy'])).toThrow('--runtime 仅支持 v2 或 v3');

    const env = {
      AI_AGENT_RUNTIME_MODE: 'v3_shadow',
      AI_AGENT_RUNTIME_V3_ROLLOUT: 'all',
      AI_AGENT_RUNTIME_V2_MODE: 'legacy',
    };
    expect(applyRootE2ERuntimeProfile({ runtime: 'v3' }, env)).toBe('turn_contract_v3_enforce_root');
    expect(env).toMatchObject({
      AI_AGENT_RUNTIME_MODE: 'v3_enforce',
      AI_AGENT_RUNTIME_V3_ROLLOUT: 'root',
      AI_AGENT_RUNTIME_V2_MODE: 'enforce',
    });

    expect(applyRootE2ERuntimeProfile({ runtime: 'v2' }, env)).toBe('turn_contract_v2_enforce');
    expect(env).toMatchObject({
      AI_AGENT_RUNTIME_MODE: 'legacy',
      AI_AGENT_RUNTIME_V3_ROLLOUT: 'none',
      AI_AGENT_RUNTIME_V2_MODE: 'enforce',
    });
  });

  it('V3 真实全矩阵需要额外明确批准，定点复测不会被误拦', () => {
    expect(() => parseRootE2EArgs(['--runtime', 'v3', '--live', '--execute-writes'])).toThrow(
      'V3 真实全矩阵必须显式添加 --approve-full-matrix',
    );
    expect(
      parseRootE2EArgs(['--runtime', 'v3', '--live', '--execute-writes', '--approve-full-matrix']),
    ).toMatchObject({ runtime: 'v3', live: true, approveFullMatrix: true });
    expect(
      parseRootE2EArgs([
        '--runtime',
        'v3',
        '--live',
        '--execute-writes',
        '--case',
        'query-todos',
        '--no-artifact-regression',
      ]),
    ).toMatchObject({ caseIds: ['query-todos'], approveFullMatrix: false });
  });

  it('真实门禁必须从脱敏 Trace 证明实际执行了所选 Runtime', () => {
    expect(
      assertRootE2ERuntimeTrace(
        {
          runtimeMode: 'v3_enforce',
          runtimeConfiguredMode: 'v3_enforce',
          runtimeRolloutReason: 'role_allowlist',
          rawHistoryMessageCount: 0,
          legacyStageCount: 0,
        },
        'v3',
      ),
    ).toBe(true);
    expect(
      assertRootE2ERuntimeTrace(
        { runtimeMode: 'legacy', runtimeConfiguredMode: 'legacy', intentCompilerMode: 'enforce' },
        'v2',
      ),
    ).toBe(true);
    expect(() =>
      assertRootE2ERuntimeTrace(
        {
          runtimeMode: 'v3_enforce',
          runtimeConfiguredMode: 'v3_enforce',
          runtimeRolloutReason: 'role_allowlist',
          rawHistoryMessageCount: 1,
          legacyStageCount: 0,
        },
        'v3',
      ),
    ).toThrow('ROOT_E2E_RUNTIME_TRACE_MISMATCH');
  });

  it('支持按用例 ID 定点复测，并拒绝未知用例', () => {
    expect(
      parseRootE2EArgs(['--live', '--execute-writes', '--case', 'create-note,create-todo', '--case', 'query-notes'])
        .caseIds,
    ).toEqual(['create-note', 'create-todo', 'query-notes']);
    expect(() => parseRootE2EArgs(['--case', 'missing-case'])).toThrow('未知用例');
  });

  it('read_url 的真实用例使用已校验书签上下文，不再以手输 URL 冒充资源指代', () => {
    const readUrlCase = ROOT_E2E_TOOL_CASES.find((item) => item.id === 'read-url');
    expect(readUrlCase).toMatchObject({
      toolName: 'read_url',
      contextFixture: 'bookmark',
      followUpMessage: '总结网页内容',
    });
    expect(readUrlCase.message).toBe('分析这个地址');
    expect(readUrlCase.message).not.toMatch(/https?:\/\//u);
    expect(ROOT_E2E_WEB_FIXTURE_URL).toBe('https://www.iana.org/help/example-domains');
    expect(ROOT_E2E_WEB_FIXTURE_URL).not.toBe('https://example.com');
  });

  it('真实客户端协议包含来源隔离能力，并支持只运行对应的两轮回归', () => {
    expect(ROOT_E2E_CLIENT_CAPABILITIES).toContain('grounding_scope_v2');
    expect(ROOT_E2E_CLIENT_CAPABILITIES).toContain('capability_scope_v3');
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
      runtime: 'turn_contract_v3_enforce_root',
      summary: { passedTools: 1, totalTools: 1, executedWrites: 0, totalWrites: 0, replayVerified: 0 },
      groundingScope: { passed: true, outcome: 'answer' },
      artifact: { passed: true, outcome: 'skipped' },
      cleanup: { passed: true },
      reportPath: '/tmp/redacted.json',
      cases: [],
    });

    expect(output).toContain('混合来源→仅查书签隔离：通过');
    expect(output).toContain('笔记 7 天→今天/字数/连续续写：未运行');
    expect(output).toContain('Runtime：turn_contract_v3_enforce_root');
  });

  it('定点复测可收窄长草稿改写轮数，但正式默认仍保持五轮', () => {
    expect(parseRootE2EArgs([]).artifactRefinementRounds).toBe(5);
    expect(parseRootE2EArgs(['--artifact-refinement-rounds', '1']).artifactRefinementRounds).toBe(1);
    expect(() => parseRootE2EArgs(['--artifact-refinement-rounds', '0'])).toThrow('仅支持 1 到 5');
    expect(() => parseRootE2EArgs(['--artifact-refinement-rounds', '6'])).toThrow('仅支持 1 到 5');
  });

  it('待办提醒真实查询包含测试夹具写入，必须显式授权执行并可单独运行', () => {
    expect(() => parseRootE2EArgs(['--live', '--case', 'query-todos', '--no-artifact-regression'])).toThrow(
      '必须显式添加 --execute-writes',
    );
    expect(
      parseRootE2EArgs(['--live', '--execute-writes', '--case', 'query-todos', '--no-artifact-regression']),
    ).toMatchObject({ caseIds: ['query-todos'], executeWrites: true, artifactRegression: false });
  });

  it('笔记产物回归通过正式服务创建当天材料，并在同一轮内保持幂等', async () => {
    const calls = [];
    const state = {
      prefix: '[AI-E2E fixture]',
      user: { id: 'root-user', role: 'root' },
      artifactMaterialNoteId: '',
    };
    const services = {
      createNote: async (payload) => {
        calls.push(payload);
        return { id: 'fixture-note-id' };
      },
    };

    await ensureArtifactMaterialFixture(state, services);
    await ensureArtifactMaterialFixture(state, services);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      userId: 'root-user',
      userRole: 'root',
      addToInbox: false,
      suppressUserRewards: true,
      note: {
        title: '[AI-E2E fixture] 草稿材料',
        type: 'markdown',
      },
    });
    expect(calls[0].note.content).toContain('日期范围切换');
    expect(state.artifactMaterialNoteId).toBe('fixture-note-id');
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
