import { requestAi, requestAiStream } from './aiGateway.js';
import { looksLikeLeakedToolCall } from './deepseekClient.js';

const DEFAULT_FALLBACK = '抱歉，无法处理该请求。';
const LEAK_RETRY_INSTRUCTION =
  '刚才的回答格式无效。现在只能基于已经提供的对话与工具结果直接给出最终答复，禁止输出、描述或尝试任何工具调用、XML、DSML、函数名和内部协议标记。';

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
}) {
  const usage = emptyUsage();
  let apiCalls = 0;
  let content = '';
  let finishReason = null;
  let usageStatus = 'reported';

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
    content = safeContent(response.content);
    return { content, usage, apiCalls, finishReason, usageStatus };
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

  if (streamResult.leakedToolCall) {
    const retryResponse = await requestAi([...messages, { role: 'user', content: LEAK_RETRY_INSTRUCTION }], {
      toolChoice: 'none',
      signal,
      maxTokens,
      temperature,
      trace: { ...trace, stage: 'final_leak_retry' },
    });
    apiCalls += 1;
    addUsage(usage, retryResponse.usage);
    finishReason = retryResponse.finishReason || finishReason;
    usageStatus = usageStatus === 'reported' && retryResponse.usageStatus === 'reported' ? 'reported' : 'missing';
    const retryContent = safeContent(retryResponse.content, '抱歉，本次回答格式异常，请重新生成。');
    // 已推送的前缀只是泄漏协议前的临时流内容，不能与恢复回答拼接。
    // SSE 完成事件会以这里的权威正文整体替换客户端的临时聚合结果。
    content = retryContent;
    onDelta(retryContent);
  }

  if (!content) {
    content = DEFAULT_FALLBACK;
    onDelta(content);
  }

  return { content, usage, apiCalls, finishReason, usageStatus };
}
