import { requestAi, requestAiStream } from '../agent/aiGateway.js';
import {
  createGroundedAnswerTool,
  GROUNDED_OUTPUT_PROTOCOL_INSTRUCTION,
  validateGroundedAnswerArguments,
} from './groundedOutput.js';
import { validateGroundedMarkdownOutput } from './outputValidator.js';
import { callStructuredSkillModel } from './structuredModel.js';

const FREE_TEXT_REPAIRABLE_OUTPUT_ERRORS = new Set(['AI_SKILL_OUTPUT_EMPTY', 'AI_SKILL_OUTPUT_TOO_SHORT']);
const GROUNDED_REPAIRABLE_OUTPUT_ERRORS = Object.freeze([
  'AI_SKILL_STRUCTURED_OUTPUT_MISSING',
  'AI_SKILL_STRUCTURED_OUTPUT_INVALID',
  'AI_SKILL_OUTPUT_SOURCE_REQUIRED',
  'AI_SKILL_OUTPUT_SOURCE_INVALID',
  'AI_SKILL_OUTPUT_EMPTY',
  'AI_SKILL_OUTPUT_TOO_LONG',
]);

function withGroundedProtocol(messages) {
  const normalized = Array.isArray(messages) ? [...messages] : [];
  if (normalized[0]?.role === 'system') {
    normalized[0] = {
      ...normalized[0],
      content: `${String(normalized[0].content || '')}\n${GROUNDED_OUTPUT_PROTOCOL_INSTRUCTION}`,
    };
    return normalized;
  }
  return [{ role: 'system', content: GROUNDED_OUTPUT_PROTOCOL_INSTRUCTION }, ...normalized];
}

function freeTextRepairInstruction(outputPolicy = {}) {
  return [
    '修复上一版输出，直接返回完整正文，不要解释过程。',
    outputPolicy.minimumChars
      ? `正文必须至少 ${outputPolicy.minimumChars} 个字符；只能通过充分表达输入已有信息扩展，禁止编造。`
      : '正文不能为空。',
  ].join('\n');
}

export async function callGroundedSkillModel({
  messages,
  sources = [],
  coverage,
  modelPolicy,
  outputPolicy = {},
  trace,
  signal,
}) {
  if (sources.length) {
    const structuredTool = createGroundedAnswerTool(sources.length);
    return callStructuredSkillModel({
      messages: withGroundedProtocol(messages),
      structuredTool,
      validateArguments: (args) => validateGroundedAnswerArguments(args, sources, coverage),
      modelPolicy,
      trace,
      signal,
      repairableErrorCodes: GROUNDED_REPAIRABLE_OUTPUT_ERRORS,
      buildRepairInstruction: ({ error, toolName }) =>
        [
          `上一版未通过引用协议（${error.code}）。`,
          `必须且只能调用 ${toolName} 一次；每个 block 都要填写本轮真实 sourceIndexes；markdown 内不要手写 [数字] 引用；不要输出解释文本。`,
        ].join('\n'),
    });
  }

  const requestOptions = {
    toolChoice: 'none',
    maxTokens: modelPolicy.maxTokens,
    temperature: modelPolicy.temperature,
    trace,
    signal,
  };
  let response = await requestAi(messages, requestOptions);
  try {
    return validateGroundedMarkdownOutput({
      content: response.content,
      sources,
      coverage,
      minimumChars: outputPolicy.minimumChars,
    });
  } catch (error) {
    if (!FREE_TEXT_REPAIRABLE_OUTPUT_ERRORS.has(error?.code)) throw error;
    response = await requestAi(
      [
        ...messages,
        { role: 'assistant', content: String(response.content || '') },
        { role: 'user', content: freeTextRepairInstruction(outputPolicy) },
      ],
      {
        ...requestOptions,
        temperature: 0,
        billingScope: 'platform',
        repairReasonCode: error.code,
        trace: { ...trace, stage: `${trace?.stage || 'skill_output'}_repair` },
      },
    );
    return validateGroundedMarkdownOutput({
      content: response.content,
      sources,
      coverage,
      minimumChars: outputPolicy.minimumChars,
    });
  }
}

/**
 * 流式接口只服务无来源的纯文本变换。需要来源的 Skill 必须先完成结构化协议校验，
 * 再一次性返回由服务端渲染的引用，不能把未经校验的中间正文透传给客户端。
 */
export async function callGroundedSkillModelStream({
  messages,
  sources = [],
  coverage,
  modelPolicy,
  outputPolicy = {},
  trace,
  signal,
  onDelta,
  onReset,
}) {
  if (sources.length) {
    const error = new Error('带来源的 AI Skill 必须使用结构化非流式输出');
    error.code = 'AI_SKILL_STREAM_STRUCTURED_REQUIRED';
    error.status = 500;
    throw error;
  }
  const requestOptions = {
    toolChoice: 'none',
    maxTokens: modelPolicy.maxTokens,
    temperature: modelPolicy.temperature,
    trace,
    signal,
    onDelta,
  };
  let response = await requestAiStream(messages, requestOptions);
  try {
    return validateGroundedMarkdownOutput({
      content: response.content,
      sources,
      coverage,
      minimumChars: outputPolicy.minimumChars,
    });
  } catch (error) {
    if (!FREE_TEXT_REPAIRABLE_OUTPUT_ERRORS.has(error?.code)) throw error;
    onReset?.();
    response = await requestAiStream(
      [
        ...messages,
        { role: 'assistant', content: String(response.content || '') },
        { role: 'user', content: freeTextRepairInstruction(outputPolicy) },
      ],
      {
        ...requestOptions,
        temperature: 0,
        billingScope: 'platform',
        repairReasonCode: error.code,
        trace: { ...trace, stage: `${trace?.stage || 'skill_output'}_repair` },
      },
    );
    return validateGroundedMarkdownOutput({
      content: response.content,
      sources,
      coverage,
      minimumChars: outputPolicy.minimumChars,
    });
  }
}

export const aiSkillModelInternals = Object.freeze({
  FREE_TEXT_REPAIRABLE_OUTPUT_ERRORS,
  GROUNDED_REPAIRABLE_OUTPUT_ERRORS,
  freeTextRepairInstruction,
  withGroundedProtocol,
});
