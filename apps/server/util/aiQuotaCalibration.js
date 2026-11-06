import { createHash } from 'node:crypto';

const UNITS = Object.freeze({
  zh: '团队将资料整理为清晰的笔记，保留原有事实与条件。每次复盘应说明背景、依据、取舍和下一步行动。\n',
  en: 'The team organizes research into clear notes. Preserve the original facts, constraints, evidence, and decisions. Explain the next action without adding claims.\n',
  mixed:
    '项目复盘 Project review：记录 evidence、约束 constraints 和下一步行动。解释已有资料，不增加未经确认的事实。\n',
  code: '技术记录：保留代码含义和测试约束。\n```ts\nconst count = items.filter(item => item.ready).length;\nif (count > 0) save(count);\n```\n说明：只保存已经准备好的条目数量。\n',
});
export const CALIBRATION_INSTRUCTION =
  '逐段保留全部独立记录、编号、数字和代码。润色、改写或扩写时不要合并不同记录，不要用总结代替全文；标题和摘要按所选操作正常精简。';
const TOPICS = [
  '资料分类',
  '项目排期',
  '接口验证',
  '阅读复盘',
  '存储整理',
  '检索结果',
  '协作边界',
  '数据核对',
  '版本回退',
  '后续计划',
];
export function calibrationText(language, chars) {
  if (!UNITS[language] || ![3000, 8000, 15000].includes(chars)) throw new Error('AI_CALIBRATION_FIXTURE_INVALID');
  let text = '';
  for (let index = 1; text.length < chars; index++) {
    const topic = TOPICS[(index - 1) % TOPICS.length];
    const label = String(index).padStart(3, '0');
    const count = 5 + ((index * 7) % 37),
      days = 2 + (index % 13);
    const paragraph =
      language === 'en'
        ? `## Record ${label}: ${['classification', 'planning', 'validation', 'review', 'storage', 'search', 'collaboration', 'reconciliation', 'rollback', 'follow-up'][(index - 1) % 10]}\nCase ${label} contains ${count} independent entries. The review window is ${days} days. The team keeps the original identifiers, separates confirmed observations from assumptions, and checks item ${index * 11} before recording a decision. Its next action is documented under reference Q${label}.\n`
        : language === 'mixed'
          ? `## 记录 ${label}：${topic} / case Q${label}\n本组有 ${count} 条独立记录，观察窗口为 ${days} 天。Record Q${label} keeps evidence separate from assumptions. 当前仅核对编号 ${index * 11}，保留各条来源与条件；下一次检查引用 Q${label}，不得把本条与其他样例合并。\n`
          : language === 'code'
            ? `## 记录 ${label}：${topic}\n本段独立验证 ${count} 个条目，预计观察 ${days} 天。\n\`\`\`ts\nconst entries${index} = records.filter(row => row.batch === ${index} && row.ready);\nconst limit${index} = ${count};\nif (entries${index}.length >= limit${index}) saveBatch(${index}, entries${index});\n\`\`\`\n检查点 Q${label}：保存符合本批次条件的记录，保留编号 ${index * 11} 的处理依据。\n`
            : `## 记录 ${label}：${topic}\n本条样例包含 ${count} 项独立资料，核对窗口是 ${days} 天。编号 ${index * 11} 的观察只适用于本条记录，不能推及其他批次。先核实已确认的条件，再记录依据、取舍和下一步行动；后续检查引用 Q${label}，保留本条编号、数字和结论，不与其他记录合并。\n`;
    text += paragraph;
  }
  return text.slice(0, chars);
}
export function calibrationFixtures() {
  const fixtures = [];
  for (const chars of [3000, 8000, 15000])
    for (const operation of ['polish', 'rewrite', 'expand'])
      fixtures.push({ id: `zh-${chars}-${operation}`, language: 'zh', chars, operation, round: 1 });
  for (const language of ['en', 'mixed', 'code'])
    fixtures.push({ id: `${language}-15000-polish`, language, chars: 15000, operation: 'polish', round: 1 });
  for (const operation of ['title', 'summarize'])
    fixtures.push({ id: `zh-15000-${operation}`, language: 'zh', chars: 15000, operation, round: 1 });
  fixtures.push({ id: 'zh-8000-polish-round2', language: 'zh', chars: 8000, operation: 'polish', round: 2 });
  return fixtures;
}
export const calibrationManifestHash = () =>
  createHash('sha256')
    .update(
      JSON.stringify({
        version: 2,
        fixtures: calibrationFixtures(),
        topics: TOPICS,
        instruction: CALIBRATION_INSTRUCTION,
      }),
    )
    .digest('hex');
// 估算比较须保持相同输出上限，不能把新策略允许的更长成果算作旧估算的超额。
export function comparableBaselineReservation(baseline, candidate) {
  return Math.min(
    500000,
    Math.max(
      5000,
      baseline.inputTokens +
        baseline.evidenceTokens +
        baseline.visionTokens +
        baseline.protocolTokens +
        candidate.outputTokens,
    ),
  );
}
export function compareCalibrationUsage(rows) {
  const reported = rows.filter(
    (row) => row.usageComplete === true && Number.isSafeInteger(row.actualTokens) && row.actualTokens > 0,
  );
  const metrics = (key) => {
    const extra = reported.map((row) => Math.max(0, row.actualTokens - row[key]));
    const extraTokens = extra.reduce((sum, value) => sum + value, 0);
    return {
      samples: reported.length,
      exceedances: extra.filter(Boolean).length,
      extraTokens,
      exceedanceRate: reported.length ? extra.filter(Boolean).length / reported.length : null,
      extraTokensPerThousand: reported.length ? (extraTokens * 1000) / reported.length : null,
    };
  };
  return {
    samples: rows.length,
    missingUsage: rows.length - reported.length,
    implausiblyShortFullOutputs: reported.filter(
      (row) => !['title', 'summarize', 'outline'].includes(row.operation) && row.outputChars < row.chars * 0.5,
    ).length,
    baseline: metrics('baselineReservedTokens'),
    candidate: metrics('candidateReservedTokens'),
    outputCapHits: rows.filter((row) => row.outputCapHit).length,
    providerTokens: reported.reduce((sum, row) => sum + row.actualTokens, 0),
    registrationGiftSinglePass: reported
      .filter(
        (row) =>
          row.operation === 'polish' && row.round === 1 && !row.outputCapHit && row.outputChars >= row.chars * 0.5,
      )
      .map((row) => ({
        sampleId: row.id,
        approximateNotes:
          row.candidateReservedTokens > 120000
            ? 0
            : 1 + Math.floor((120000 - row.candidateReservedTokens) / row.actualTokens),
      })),
  };
}
