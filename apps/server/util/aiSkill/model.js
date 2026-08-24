import { requestAi } from '../agent/aiGateway.js';
import { validateGroundedMarkdownOutput } from './outputValidator.js';

const REPAIRABLE_OUTPUT_ERRORS = new Set([
  'AI_SKILL_OUTPUT_SOURCE_REQUIRED',
  'AI_SKILL_OUTPUT_SOURCE_INVALID',
  'AI_SKILL_OUTPUT_COVERAGE_OVERCLAIM',
  'AI_SKILL_OUTPUT_TOO_SHORT',
]);

export async function callGroundedSkillModel({ messages, sources, coverage, modelPolicy, outputPolicy = {}, trace }) {
  const requestOptions = {
    toolChoice: 'none',
    maxTokens: modelPolicy.maxTokens,
    temperature: modelPolicy.temperature,
    trace,
  };
  const response = await requestAi(messages, requestOptions);
  try {
    return validateGroundedMarkdownOutput({
      content: response.content,
      sources,
      coverage,
      minimumChars: outputPolicy.minimumChars,
    });
  } catch (error) {
    if (!REPAIRABLE_OUTPUT_ERRORS.has(error?.code)) throw error;
    const repaired = await requestAi(
      [
        ...messages,
        { role: 'assistant', content: String(response.content || '') },
        {
          role: 'user',
          content: [
            '修复上一版输出：每个事实使用现有 [数字] 来源；不得引用不存在的编号；覆盖不完整时禁止声称全部、唯一或只有。',
            outputPolicy.minimumChars
              ? `正文必须至少 ${outputPolicy.minimumChars} 个中文字符；只能通过更充分的解释、结构化整理、分析和建议扩展，禁止编造材料中不存在的事实。`
              : '',
            '直接输出修复后的完整正文。',
          ]
            .filter(Boolean)
            .join('\n'),
        },
      ],
      { ...requestOptions, temperature: 0, trace: { ...trace, stage: `${trace.stage}_repair` } },
    );
    return validateGroundedMarkdownOutput({
      content: repaired.content,
      sources,
      coverage,
      minimumChars: outputPolicy.minimumChars,
    });
  }
}
