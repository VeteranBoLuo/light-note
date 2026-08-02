import { requestAi, requestAiStream } from './aiGateway.js';
import { looksLikeLeakedToolCall } from './deepseekClient.js';

const DEFAULT_FALLBACK = '抱歉，无法处理该请求。';
const LEAK_RETRY_INSTRUCTION =
  '刚才的回答格式无效。现在只能基于已经提供的对话与工具结果直接给出最终答复，禁止输出、描述或尝试任何工具调用、XML、DSML、函数名和内部协议标记。';
const QUALITY_RETRY_INSTRUCTION =
  '刚才的回答因截断、重复或语义退化未通过质量检查。请重新回答用户原始问题：只依据已经提供的事实资料，完整保留解决问题所需的内容，使用连贯、完整的句子；不要自问自答、重复结论、无意义续写、添加结束标记或编造数据。若没有查到数据，请如实说明。';
const QUALITY_FALLBACK = '抱歉，本次回答生成异常，请重新生成。';
const INVALID_FINISH_REASONS = new Set(['length', 'max_tokens', 'content_filter']);
const MAX_UNBROKEN_SEGMENT_LENGTH = 480;
const MAX_CJK_UNBROKEN_SEGMENT_LENGTH = 260;
const MAX_ABSOLUTE_CONTENT_LENGTH = 12_000;
const MIN_RUNAWAY_INSPECTION_LENGTH = 420;
const MIN_REPETITION_INSPECTION_LENGTH = 500;
const STREAM_QUALITY_CHECK_STEP = 32;
const STREAM_QUALITY_HOLDBACK_LENGTH = 320;
const EXPLICIT_CREATIVE_PATTERN =
  /写(?:一首|首|一篇|篇|一个|个)?[^。！？\n]{0,16}(?:诗|歌词|故事|小说|文案|剧本|段子)|创作|续写|改写|润色|脑洞|角色扮演|仿写|creative\s+writing|write\s+(?:a\s+)?(?:poem|story|script|copy)/iu;

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
  // 代码、长哈希和机器生成文本允许结构性重复；质量门禁只判断用户可读正文。
  const normalized = normalizedForRepetition(proseOutsideCodeFences(content));
  if (normalized.length < MIN_REPETITION_INSPECTION_LENGTH) return false;
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

function proseOutsideCodeFences(content) {
  return String(content || '')
    .split(/```/u)
    .filter((_, index) => index % 2 === 0)
    .join('\n')
    .replace(/`[^`\n]+`/gu, '')
    .replace(/https?:\/\/[^\s)\]}]+/giu, '');
}

function hasUnbrokenRunaway(content) {
  if (String(content || '').length < MIN_RUNAWAY_INSPECTION_LENGTH) return false;
  return proseOutsideCodeFences(content)
    .split(/[。！？!?；;\n]/u)
    .some((segment) => {
      const compact = segment.replace(/\s+/gu, '');
      if (compact.length > MAX_UNBROKEN_SEGMENT_LENGTH) return true;
      if (compact.length <= MAX_CJK_UNBROKEN_SEGMENT_LENGTH) return false;
      const cjkLength = (compact.match(/\p{Script=Han}/gu) || []).length;
      return cjkLength / compact.length >= 0.55;
    });
}

function hasFragmentedHanTail(content) {
  const prose = proseOutsideCodeFences(content).trim();
  if (prose.length < MIN_RUNAWAY_INSPECTION_LENGTH) return false;
  const tailSegments = prose
    .split(/[。！？!?；;\n]/u)
    .filter(Boolean)
    .slice(-2);
  return tailSegments.some((segment) => {
    const compact = segment.replace(/[\s\p{P}\p{S}]/gu, '');
    const han = compact.match(/\p{Script=Han}/gu) || [];
    if (han.length < 48 || han.length > 110 || han.length / Math.max(compact.length, 1) < 0.9) return false;
    const uniqueRatio = new Set(han).size / han.length;
    const connectiveCount = (han.join('').match(/[的了是在有和与及为把被而也就都不这那可会到从对将让]/gu) || []).length;
    return uniqueRatio >= 0.72 && connectiveCount / han.length <= 0.08;
  });
}

/**
 * 回答长度交给问题本身决定；这里只控制生成随机性。
 * 事实、建议、比较与翻译使用稳定温度，只有明确创作请求才保留用户选择的发散度。
 */
export function resolveFinalReplyTemperature(message, styleTemperature, { grounded = false, translation = false } = {}) {
  const configured = Number.isFinite(styleTemperature) ? styleTemperature : null;
  if (translation) return Math.min(configured ?? 0.3, 0.3);
  if (grounded) return Math.min(configured ?? 0.3, 0.6);
  if (EXPLICIT_CREATIVE_PATTERN.test(String(message || ''))) return configured ?? undefined;
  return Math.min(configured ?? 0.7, 0.7);
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
  if (hasUnbrokenRunaway(text)) issues.push('unbroken_runaway');
  if (hasFragmentedHanTail(text)) issues.push('fragmented_han_tail');
  if (hasExcessiveRepeatedShingles(text)) issues.push('repetitive');
  if (looksLikeLeakedToolCall(text)) issues.push('tool_protocol_leak');
  return { valid: issues.length === 0, issues };
}

/** 流尚未结束时可判定的质量问题；截断只能等 Provider 给出 finish reason 后判断。 */
export function inspectFinalReplyProgress(content) {
  const quality = inspectFinalReplyQuality(content, null);
  const issues = quality.issues.filter((issue) => issue !== 'empty' && issue !== 'truncated');
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
  let progressiveQualityIssues = [];

  const retryInvalidReply = async (reasonInstruction) => {
    qualityRetried = true;
    const retryResponse = await requestAi([...messages, { role: 'user', content: reasonInstruction }], {
      toolChoice: 'none',
      signal,
      maxTokens,
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

  let lastStreamQualityCheckAt = 0;
  let publishedLength = 0;
  const publishVerifiedStreamContent = (flushAll = false) => {
    const publishUntil = flushAll
      ? content.length
      : Math.max(0, content.length - STREAM_QUALITY_HOLDBACK_LENGTH);
    if (publishUntil <= publishedLength) return;
    const verifiedChunk = content.slice(publishedLength, publishUntil);
    publishedLength = publishUntil;
    if (verifiedChunk) onDelta(verifiedChunk);
  };
  const streamResult = await requestAiStream(messages, {
    temperature,
    maxTokens,
    signal,
    trace: { ...trace, stage: 'final_stream' },
    shouldStop: ({ content: candidateContent }) => {
      if (candidateContent.length < MIN_RUNAWAY_INSPECTION_LENGTH) return false;
      if (candidateContent.length - lastStreamQualityCheckAt < STREAM_QUALITY_CHECK_STEP) return false;
      lastStreamQualityCheckAt = candidateContent.length;
      const quality = inspectFinalReplyProgress(candidateContent);
      if (quality.valid) return false;
      progressiveQualityIssues = quality.issues;
      return quality.issues[0] || 'quality_guard';
    },
    onDelta: (chunk) => {
      if (!chunk) return;
      content += chunk;
      // 不立即公开最新尾段：先给滚动质量门禁一个观察窗口。
      // 正常回答结束时完整冲刷；异常时尾部乱码不会进入用户可见正文。
      publishVerifiedStreamContent();
    },
  });
  apiCalls += 1;
  addUsage(usage, streamResult.usage);
  finishReason = streamResult.finishReason || null;
  usageStatus = streamResult.usageStatus === 'reported' ? 'reported' : 'missing';

  const streamQuality = inspectFinalReplyQuality(content, streamResult.finishReason);
  qualityIssues = [...new Set([...progressiveQualityIssues, ...streamQuality.issues])];
  if (streamResult.leakedToolCall || streamResult.consumerStopped || !streamQuality.valid) {
    const hadVisibleStreamContent = publishedLength > 0;
    const retryContent = await retryInvalidReply(
      streamResult.leakedToolCall || streamQuality.issues.includes('tool_protocol_leak')
        ? LEAK_RETRY_INSTRUCTION
        : QUALITY_RETRY_INSTRUCTION,
    );
    // 已推送的前缀只是泄漏协议前的临时流内容，不能与恢复回答拼接。
    // SSE 完成事件会以这里的权威正文整体替换客户端的临时聚合结果。
    content = retryContent;
    // 已经公开过异常前缀时不再把恢复正文追加在其后；终态快照会整体替换。
    if (!hadVisibleStreamContent) onDelta(retryContent);
  } else {
    publishVerifiedStreamContent(true);
  }

  if (!content) {
    content = fallback;
    onDelta(content);
  }

  return { content, usage, apiCalls, finishReason, usageStatus, qualityRetried, qualityIssues };
}
