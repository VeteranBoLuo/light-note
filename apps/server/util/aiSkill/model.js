import { requestAi, requestAiStream } from '../agent/aiGateway.js';
import { validateGroundedMarkdownOutput } from './outputValidator.js';

const REPAIRABLE_OUTPUT_ERRORS = new Set([
  'AI_SKILL_OUTPUT_SOURCE_REQUIRED',
  'AI_SKILL_OUTPUT_SOURCE_INVALID',
  'AI_SKILL_OUTPUT_COVERAGE_OVERCLAIM',
  'AI_SKILL_OUTPUT_TOO_SHORT',
]);

export async function callGroundedSkillModel({
  messages,
  sources,
  coverage,
  modelPolicy,
  outputPolicy = {},
  trace,
  signal,
}) {
  const requestOptions = {
    toolChoice: 'none',
    maxTokens: modelPolicy.maxTokens,
    temperature: modelPolicy.temperature,
    trace,
    signal,
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
      {
        ...requestOptions,
        temperature: 0,
        billingScope: 'platform',
        repairReasonCode: error.code,
        trace: { ...trace, stage: `${trace.stage}_repair` },
      },
    );
    return validateGroundedMarkdownOutput({
      content: repaired.content,
      sources,
      coverage,
      minimumChars: outputPolicy.minimumChars,
    });
  }
}

/**
 * 与同步模型调用共用同一份输出门禁，只把 Provider 的正文增量透传给调用方。
 * 若首版输出需要修复，先通知客户端清空上一版，再流式发送修复后的完整版本，
 * 避免界面把两版内容拼接在一起。
 */
export async function callGroundedSkillModelStream({
  messages,
  sources,
  coverage,
  modelPolicy,
  outputPolicy = {},
  trace,
  signal,
  onDelta,
  onReset,
}) {
  const requestOptions = {
    toolChoice: 'none',
    maxTokens: modelPolicy.maxTokens,
    temperature: modelPolicy.temperature,
    trace,
    signal,
    onDelta,
  };
  const response = await requestAiStream(messages, requestOptions);
  try {
    return validateGroundedMarkdownOutput({
      content: response.content,
      sources,
      coverage,
      minimumChars: outputPolicy.minimumChars,
    });
  } catch (error) {
    if (!REPAIRABLE_OUTPUT_ERRORS.has(error?.code)) throw error;
    onReset?.();
    const repaired = await requestAiStream(
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
      {
        ...requestOptions,
        temperature: 0,
        billingScope: 'platform',
        repairReasonCode: error.code,
        trace: { ...trace, stage: `${trace.stage}_repair` },
      },
    );
    return validateGroundedMarkdownOutput({
      content: repaired.content,
      sources,
      coverage,
      minimumChars: outputPolicy.minimumChars,
    });
  }
}
