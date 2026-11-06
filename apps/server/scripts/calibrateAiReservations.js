import fs from 'node:fs/promises';
import path from 'node:path';
import {
  CALIBRATION_INSTRUCTION,
  calibrationFixtures,
  calibrationText,
  calibrationManifestHash,
  comparableBaselineReservation,
  compareCalibrationUsage,
} from '../util/aiQuotaCalibration.js';

const args = process.argv.slice(2);
let pool;
try {
  const runProvider = args.includes('--run-provider');
  if (
    args.some(
      (arg) =>
        !['--run-provider', '--confirm-synthetic-calls', '--help'].includes(arg) &&
        !arg.startsWith('--report=') &&
        !arg.startsWith('--limit='),
    )
  )
    throw new Error('AI_CALIBRATION_ARGUMENT_INVALID');
  if (args.includes('--help')) {
    console.log(
      'calibrateAiReservations.js [--run-provider --confirm-synthetic-calls --report=/absolute/private/report.json --limit=27]\n默认仅输出合成样本清单，不连接模型或数据库。执行真实 Provider 前须另行授权；只记录数值。',
    );
  } else if (!runProvider)
    console.log(
      JSON.stringify(
        { mode: 'offline_manifest', manifestHash: calibrationManifestHash(), fixtures: calibrationFixtures() },
        null,
        2,
      ),
    );
  else {
    const reportFile = args.find((arg) => arg.startsWith('--report='))?.slice(9);
    const limit = Number(args.find((arg) => arg.startsWith('--limit='))?.slice(8) ?? 27);
    if (
      !args.includes('--confirm-synthetic-calls') ||
      !path.isAbsolute(reportFile || '') ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 27
    )
      throw new Error('AI_CALIBRATION_CONFIRMATION_REQUIRED');
    // 必须指向完整隔离本机环境，禁止测试命令借用线上额度或写线上账本。
    process.env.AI_RESERVATION_CALIBRATION_MODE = 'v2';
    const { assertLocalTestEnvironment } = await import('../util/localTestEnvironment.js');
    assertLocalTestEnvironment(process.env);
    pool = (await import('../db/index.js')).default;
    const { runAiExecution } = await import('../util/aiExecution/service.js');
    const { createAiGateway } = await import('../util/agent/aiGateway.js');
    const { estimateAiSkillReservationBudget, compileAiSkillProviderPlan } =
      await import('../util/aiBillingCatalog.js');
    const skill = (await import('../util/aiSkill/skills/noteTransformSkill.js')).default;
    const gateway = createAiGateway();
    const abort = new AbortController();
    process.once('SIGTERM', () => abort.abort());
    process.once('SIGINT', () => abort.abort());
    let report = { version: 2, manifestHash: calibrationManifestHash(), attempts: 0, rows: [] };
    try {
      report = JSON.parse(await fs.readFile(reportFile, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (report.manifestHash !== calibrationManifestHash() || !Array.isArray(report.rows))
      throw new Error('AI_CALIBRATION_MANIFEST_CHANGED');
    if (
      !Number.isSafeInteger(report.attempts) ||
      report.attempts < 0 ||
      report.attempts > 27 ||
      report.attempts < report.rows.length
    )
      throw new Error('AI_CALIBRATION_JOURNAL_INVALID');
    for (const fixture of calibrationFixtures().slice(0, limit)) {
      if (report.rows.some((row) => row.id === fixture.id && row.completed)) continue;
      const input = skill.validateInput({
        text: calibrationText(fixture.language, fixture.chars),
        operation: fixture.operation,
        instruction: CALIBRATION_INSTRUCTION,
      });
      const request = { skillId: skill.id, input, scope: { resourceRefs: [] } };
      const baseline = estimateAiSkillReservationBudget(skill, request, undefined, undefined, { calibrated: false });
      const candidate = estimateAiSkillReservationBudget(skill, request, undefined, undefined, { calibrated: true });
      const prepared = await skill.prepare({ input });
      const policy = skill.resolveModelPolicy(input, { calibrated: true });
      if (Number(report.attempts || 0) >= 27) throw new Error('AI_CALIBRATION_CALL_LIMIT_REACHED');
      report.attempts = Number(report.attempts || 0) + 1;
      await fs.writeFile(reportFile + '.tmp', JSON.stringify(report, null, 2), { mode: 0o600 });
      await fs.rename(reportFile + '.tmp', reportFile);
      const numeric = await runAiExecution(
        {
          billingPolicy: 'system',
          systemId: 'quota_calibration',
          skillId: skill.id,
          skillVersion: skill.version,
          taskType: 'ai_quota_calibration',
          surface: 'local_quota_calibration',
          reservationTokens: candidate.totalTokens,
          providerPlan: compileAiSkillProviderPlan(skill, request),
        },
        async () => {
          const result = await gateway.complete(prepared.messages, {
            ...policy,
            timeoutMs: 180000,
            signal: abort.signal,
            trace: { stage: 'model_generation', taskType: 'ai_quota_calibration' },
          });
          return {
            usageComplete: result.usageStatus === 'reported',
            actualTokens: Number(result.usage?.totalTokens || 0),
            promptTokens: Number(result.usage?.promptTokens || 0),
            completionTokens: Number(result.usage?.completionTokens || 0),
            outputChars: String(result.content || '').length,
            outputCapHit: result.finishReason === 'length',
            provider: result.provider,
            model: result.model,
          };
        },
      );
      report.rows.push({
        ...fixture,
        ...numeric,
        baselineOriginalReservedTokens: baseline.totalTokens,
        baselineReservedTokens: comparableBaselineReservation(baseline, candidate),
        comparison: 'same_output_budget',
        candidateReservedTokens: candidate.totalTokens,
        completed: true,
      });
      report.summary = compareCalibrationUsage(report.rows);
      await fs.writeFile(reportFile + '.tmp', JSON.stringify(report, null, 2), { mode: 0o600 });
      await fs.rename(reportFile + '.tmp', reportFile);
      console.log(
        '[ai-calibration] completed %s/%s sample=%s tokens=%s',
        report.rows.length,
        limit,
        fixture.id,
        numeric.actualTokens,
      );
    }
    console.log(
      JSON.stringify({ manifestHash: report.manifestHash, ...compareCalibrationUsage(report.rows) }, null, 2),
    );
  }
} catch (error) {
  const code = error?.code || error?.message;
  console.error('[ai-calibration] failed code=%s', /^[A-Z0-9_]+$/.test(code || '') ? code : 'AI_CALIBRATION_FAILED');
  process.exitCode = 1;
} finally {
  await pool?.end();
  if (pool) {
    const redis = (await import('../util/redisClient.js')).default;
    if (redis.isOpen) redis.destroy();
  }
}
