import { requestAi, requestAiStream } from './aiGateway.js';
import { looksLikeLeakedToolCall } from './deepseekClient.js';

const DEFAULT_FALLBACK = '抱歉，无法处理该请求。';
const LEAK_RETRY_INSTRUCTION =
  '刚才的回答格式无效。现在只能基于已经提供的对话与工具结果直接给出最终答复，禁止输出、描述或尝试任何工具调用、XML、DSML、函数名和内部协议标记。';
const QUALITY_RETRY_INSTRUCTION =
  '刚才的回答因截断、重复或格式异常未通过质量检查。请重新回答用户原始问题：只依据已经提供的事实资料，结论只说一次，使用简短完整的句子，不要自问自答、反复解释、添加结束标记或编造数据。若没有查到数据，用一句话如实说明。';
const QUALITY_FALLBACK = '抱歉，本次回答生成异常，请重新生成。';
const INVALID_FINISH_REASONS = new Set(['length', 'max_tokens', 'content_filter']);
const MAX_UNBROKEN_SEGMENT_LENGTH = 480;
const MAX_ABSOLUTE_CONTENT_LENGTH = 12_000;

function emptyUsage() {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}

function addUsage(target, source) {
  target.promptTokens += Number(source?.promptTokens || 0);
  target.completionTokens += Number(source?.completionTokens || 0);
  target.totalTokens += Number(source?.totalTokens || 0);
}

function safeContent(content, fallback = DEFAULT_FALLBACK) {
  if (!content || looksLikeLeakedToolCall(content)) return fallback;
  return content;
}

function normalizedForRepetition(content) {
  return String(content || '')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, '');
}

function hasExcessiveRepeatedShingles(content) {
  const normalized = normalizedForRepetition(content);
  if (normalized.length < 800) return false;
  const size = 12;
  const step = 4;
  const counts = new Map();
  let total = 0;
  let repeated = 0;
  for (let index = 0; index + size <= normalized.length; index += step) {
    const shingle = normalized.slice(index, index + size);
    const count = counts.get(shingle) || 0;
    if (count > 0) repeated += 1;
    counts.set(shingle, count + 1);
    total += 1;
  }
  return total > 0 && repeated / total >= 0.18;
}

/**
 * 最终回答的通用质量门禁。
 *
 * 只检查供应商可验证的退化信号，不判断业务内容是否“好看”：
 * - 输出被模型上限/内容过滤截断；
 * - 内部结束标记泄漏；
 * - 超长无断句片段；
 * - 大段内容出现高比例重复。
 */
export function inspectFinalReplyQuality(content, finishReason) {
  const text = String(content || '').trim();
  const issues = [];
  if (!text) issues.push('empty');
  if (INVALID_FINISH_REASONS.has(String(finishReason || '').toLowerCase())) issues.push('truncated');
  if (/\\end\s*\(\s*END\s*\)|<\s*\|{1,2}\s*(?:END|FINAL)\s*\|{1,2}\s*>/iu.test(text)) {
    issues.push('internal_end_marker');
  }
  if (text.length > MAX_ABSOLUTE_CONTENT_LENGTH) issues.push('too_long');
  if (
    text.length >= 800 &&
    text.split(/[。！？!?；;\n]/u).some((segment) => segment.replace(/\s+/g, '').length > MAX_UNBROKEN_SEGMENT_LENGTH)
  ) {
    issues.push('unbroken_runaway');
  }
  if (hasExcessiveRepeatedShingles(text)) issues.push('repetitive');
  if (looksLikeLeakedToolCall(text)) issues.push('tool_protocol_leak');
  return { valid: issues.length === 0, issues };
}

function mergeUsageStatus(current, next) {
  return current === 'reported' && next === 'reported' ? 'reported' : 'missing';
}

/**
 * 生成 Agent 最终回答。
 *
 * Planner 只负责决定是否调用工具；无论本轮有没有工具，都必须经过这里生成最终正文。
 * 流式模式下 onDelta 会收到供应商的真实文本增量，不做二次打字机模拟。
 */
export async function generateFinalReply({
  messages,
  stream,
  onDelta = () => {},
  signal,
  temperature,
  maxTokens = 2200,
  trace,
  fallback = QUALITY_FALLBACK,
}) {
  const usage = emptyUsage();
  let apiCalls = 0;
  let content = '';
  let finishReason = null;
  let usageStatus = 'reported';
  let qualityRetried = false;
  let qualityIssues = [];

  const retryInvalidReply = async (reasonInstruction) => {
    qualityRetried = true;
    const retryResponse = await requestAi([...messages, { role: 'user', content: reasonInstruction }], {
      toolChoice: 'none',
      signal,
      maxTokens: Math.min(maxTokens, 900),
      temperature: Math.min(Number.isFinite(temperature) ? temperature : 0.3, 0.2),
      trace: { ...trace, stage: 'final_quality_retry' },
    });
    apiCalls += 1;
    addUsage(usage, retryResponse.usage);
    usageStatus = mergeUsageStatus(usageStatus, retryResponse.usageStatus);
    finishReason = retryResponse.finishReason || finishReason;
    const retryQuality = inspectFinalReplyQuality(retryResponse.content, retryResponse.finishReason);
    qualityIssues = [...new Set([...qualityIssues, ...retryQuality.issues])];
    return retryQuality.valid ? safeContent(retryResponse.content, fallback) : fallback;
  };

  if (!stream) {
    const response = await requestAi(messages, {
      toolChoice: 'none',
      signal,
      maxTokens,
      temperature,
      trace: { ...trace, stage: 'final' },
    });
    apiCalls += 1;
    addUsage(usage, response.usage);
    finishReason = response.finishReason || null;
    usageStatus = response.usageStatus === 'reported' ? 'reported' : 'missing';
    const quality = inspectFinalReplyQuality(response.content, response.finishReason);
    qualityIssues = quality.issues;
    content = quality.valid
      ? safeContent(response.content, fallback)
      : await retryInvalidReply(
          quality.issues.includes('tool_protocol_leak') ? LEAK_RETRY_INSTRUCTION : QUALITY_RETRY_INSTRUCTION,
        );
    return { content, usage, apiCalls, finishReason, usageStatus, qualityRetried, qualityIssues };
  }

  const streamResult = await requestAiStream(messages, {
    temperature,
    maxTokens,
    signal,
    trace: { ...trace, stage: 'final_stream' },
    onDelta: (chunk) => {
      if (!chunk) return;
      content += chunk;
      onDelta(chunk);
    },
  });
  apiCalls += 1;
  addUsage(usage, streamResult.usage);
  finishReason = streamResult.finishReason || null;
  usageStatus = streamResult.usageStatus === 'reported' ? 'reported' : 'missing';

  const streamQuality = inspectFinalReplyQuality(content, streamResult.finishReason);
  qualityIssues = streamQuality.issues;
  if (streamResult.leakedToolCall || !streamQuality.valid) {
    const retryContent = await retryInvalidReply(
      streamResult.leakedToolCall || streamQuality.issues.includes('tool_protocol_leak')
        ? LEAK_RETRY_INSTRUCTION
        : QUALITY_RETRY_INSTRUCTION,
    );
    // 已推送的前缀只是泄漏协议前的临时流内容，不能与恢复回答拼接。
    // SSE 完成事件会以这里的权威正文整体替换客户端的临时聚合结果。
    content = retryContent;
    onDelta(retryContent);
  }

  if (!content) {
    content = fallback;
    onDelta(content);
  }

  return { content, usage, apiCalls, finishReason, usageStatus, qualityRetried, qualityIssues };
}
