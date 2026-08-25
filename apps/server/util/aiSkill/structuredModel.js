import { requestAi } from '../agent/aiGateway.js';
import { aiSkillError } from './errors.js';

function parseToolArguments(response, toolName) {
  const calls = Array.isArray(response?.toolCalls) ? response.toolCalls : [];
  const matching = calls.filter((call) => String(call?.function?.name || '') === toolName);
  if (matching.length !== 1 || calls.length !== 1) {
    throw aiSkillError('AI_SKILL_STRUCTURED_OUTPUT_MISSING', 'AI 没有返回唯一的结构化草稿', 502);
  }
  try {
    const parsed = JSON.parse(String(matching[0].function?.arguments || '{}'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not object');
    return parsed;
  } catch {
    throw aiSkillError('AI_SKILL_STRUCTURED_OUTPUT_INVALID', 'AI 返回的结构化草稿格式无效', 502);
  }
}

export async function callStructuredSkillModel({
  messages,
  structuredTool,
  validateArguments,
  modelPolicy,
  trace,
  signal,
  repairableErrorCodes = ['AI_SKILL_STRUCTURED_OUTPUT_MISSING', 'AI_SKILL_STRUCTURED_OUTPUT_INVALID'],
  buildRepairInstruction,
}) {
  const options = {
    tools: [{ type: 'function', function: structuredTool }],
    toolChoice: { type: 'function', function: { name: structuredTool.name } },
    maxTokens: modelPolicy.maxTokens,
    temperature: modelPolicy.temperature,
    trace,
    signal,
  };
  let response = await requestAi(messages, options);
  try {
    return validateArguments(parseToolArguments(response, structuredTool.name));
  } catch (error) {
    const repairable = new Set(repairableErrorCodes);
    if (!repairable.has(error?.code)) throw error;
    const repairInstruction =
      typeof buildRepairInstruction === 'function'
        ? buildRepairInstruction({ error, toolName: structuredTool.name })
        : `上一版没有按协议返回。必须且只能调用 ${structuredTool.name} 一次，不要输出解释文本。`;
    response = await requestAi(
      [
        ...messages,
        { role: 'assistant', content: String(response?.content || '') },
        {
          role: 'user',
          content: repairInstruction,
        },
      ],
      {
        ...options,
        temperature: 0,
        billingScope: 'platform',
        repairReasonCode: error.code,
        trace: { ...trace, stage: `${trace?.stage || 'structured_output'}_repair` },
      },
    );
    return validateArguments(parseToolArguments(response, structuredTool.name));
  }
}

export const aiSkillStructuredModelInternals = Object.freeze({ parseToolArguments });
