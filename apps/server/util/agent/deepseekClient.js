/**
 * Agent LLM 客户端（OpenAI 兼容接口，支持 DeepSeek / 千问双供应商）
 *
 * 两个核心函数：
 * - requestDeepSeek：同步请求，用于 ReAct 循环中获取 tool_calls
 * - requestDeepSeekStream：流式请求，用于最终回答的逐字输出
 *
 * 供应商由 AGENT_LLM_PROVIDER 环境变量选择(默认 deepseek),用于 DeepSeek 出问题
 * (如 2026-07-02 那次账户余额不足导致的大面积响应变慢)时手动切到备用供应商:
 * 改 .env 里的 AGENT_LLM_PROVIDER + `pm2 restart app --update-env` 即可切换,
 * 无需改代码/重新部署。两家均已实测支持本项目 Agent 的工具调用(含并行多工具调用)
 * 与流式回复,详见 [[lightnote-agent-source-cards]] 记忆的验证记录。
 *
 * 参考 ai-assistant 项目 deepseek.ts，适配轻笺 Express 后端。
 */

// ---- 类型（JSDoc，运行时即普通对象）----

/**
 * @typedef {Object} DeepSeekMessage
 * @property {'system'|'user'|'assistant'|'tool'} role
 * @property {string|null} content
 * @property {string} [name]
 * @property {string} [tool_call_id]
 * @property {DeepSeekToolCall[]} [tool_calls]
 */

/**
 * @typedef {Object} DeepSeekToolCall
 * @property {string} id
 * @property {'function'} type
 * @property {{ name: string, arguments: string }} function
 */

/**
 * @typedef {Object} DeepSeekResult
 * @property {string} content - 文本回复
 * @property {DeepSeekToolCall[]} toolCalls - 工具调用列表
 */

// 供应商配置表:baseUrl/密钥与模型的环境变量名/默认模型/单价(元/百万 tokens，非 Batch 标准价)
const PROVIDERS = {
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1/chat/completions',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    modelEnv: 'DEEPSEEK_MODEL',
    defaultModel: 'deepseek-v4-flash',
    price: { input: 1, output: 2 },
    // 笔记改写、翻译等场景的结果通常接近原文长度，默认给足 8K 输出空间；可用环境变量下调。
    noteAssistMaxTokens: 8192,
    // DeepSeek V4 默认开启思考模式，但 thinking 模式不接受 tool_choice。
    // 当前 Agent 的 Planner 必须用 tool_choice=required 提交结构化意图，
    // Final Reply 也暂不启用思考，以保证工具协议稳定、首字延迟和成本可控。
    // 后续若增加复杂任务自适应思考，应通过独立的阶段参数开启，不能修改这个安全默认值。
    extraBody: { thinking: { type: 'disabled' } },
  },
  qwen: {
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    apiKeyEnv: 'DASHSCOPE_API_KEY', // 千问备用供应商密钥；所有业务入口统一经 AI Gateway 调用
    modelEnv: 'QWEN_MODEL',
    defaultModel: 'qwen3.5-flash',
    price: { input: 0.2, output: 2 },
    noteAssistMaxTokens: 8192,
    // qwen3.5-flash 默认开深度思考:实测一句简单问答就产生 1223/1255 的思考 token(占 97%),
    // 又慢又贵。它是应急备用模型,回复速度优先,强制关闭思考模式。
    extraBody: { enable_thinking: false },
  },
};

function getProviderConfig() {
  const name = process.env.AGENT_LLM_PROVIDER || 'deepseek';
  const cfg = PROVIDERS[name];
  if (!cfg) throw new Error(`未知的 AGENT_LLM_PROVIDER: ${name}（可选 ${Object.keys(PROVIDERS).join('/')}）`);
  return { name, ...cfg };
}

function getApiKey(cfg) {
  const key = process.env[cfg.apiKeyEnv];
  if (!key) throw new Error(`未配置 ${cfg.apiKeyEnv}，请检查 .env 文件`);
  return key;
}

function getProviderFetch() {
  const fetchImpl = globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('当前运行时不支持 fetch');
  if (process.env.NODE_ENV === 'test' && fetchImpl._isMockFunction !== true) {
    const error = new Error('TEST_PROVIDER_NETWORK_DISABLED: 测试必须 mock Provider fetch，禁止真实模型请求');
    error.code = 'TEST_PROVIDER_NETWORK_DISABLED';
    throw error;
  }
  return fetchImpl;
}

function getModel(cfg) {
  return process.env[cfg.modelEnv] || cfg.defaultModel;
}

const NOTE_ASSIST_MIN_TOKENS = 1024;

/**
 * 笔记助手的输出预算按当前供应商配置，并允许用环境变量在不改代码的情况下收紧：
 * - {PROVIDER}_NOTE_ASSIST_MAX_TOKENS（例如 DEEPSEEK_NOTE_ASSIST_MAX_TOKENS）优先
 * - NOTE_ASSIST_MAX_TOKENS 作为通用兜底
 *
 * 上限始终不超过供应商配置，避免误配导致请求被模型拒绝。
 */
export function getNoteAssistMaxTokens(cfg = getProviderConfig()) {
  const envKey = `${cfg.name.toUpperCase()}_NOTE_ASSIST_MAX_TOKENS`;
  const configured = process.env[envKey] ?? process.env.NOTE_ASSIST_MAX_TOKENS ?? cfg.noteAssistMaxTokens;
  const requested = Number.parseInt(String(configured), 10);
  const fallback = cfg.noteAssistMaxTokens;
  if (!Number.isFinite(requested)) return fallback;
  return Math.min(Math.max(requested, NOTE_ASSIST_MIN_TOKENS), fallback);
}

// 供 agentHandle.js 的用量日志按当前生效供应商计费(不同供应商单价不同)
export function getActiveProviderPricing() {
  const cfg = getProviderConfig();
  return { provider: cfg.name, price: cfg.price };
}

export function getActiveProviderInfo() {
  const cfg = getProviderConfig();
  return {
    provider: cfg.name,
    model: getModel(cfg),
    price: cfg.price,
    noteAssistMaxTokens: getNoteAssistMaxTokens(cfg),
  };
}

// ---- 超时控制 ----
// Planner(同步)用整体超时;流式用"空闲超时"(见 requestDeepSeekStream),
// 避免正常的长回答被绝对超时误杀,只拦截"连上却不吐字"的挂死。
const PLANNER_TIMEOUT_MS = 90_000;
const STREAM_IDLE_MS = 60_000;

function createStreamTimeoutError(hasReceivedProviderChunk) {
  const isFirstTokenTimeout = !hasReceivedProviderChunk;
  const error = new Error(isFirstTokenTimeout ? 'AI 首次响应超时' : '流式响应空闲超时');
  error.name = 'TimeoutError';
  error.code = isFirstTokenTimeout ? 'AI_FIRST_TOKEN_TIMEOUT' : 'AI_STREAM_IDLE_TIMEOUT';
  return error;
}

/**
 * 合并多个 AbortSignal:任一 abort,结果即 abort。
 * 手写而非用 AbortSignal.any——后者需 Node 20.3+,本项目 engines 仅要求 >=18,手写兼容更稳。
 * @param {(AbortSignal|undefined|null)[]} signals
 * @returns {AbortSignal}
 */
function combineSignals(signals) {
  const controller = new AbortController();
  for (const s of signals) {
    if (!s) continue;
    if (s.aborted) {
      controller.abort(s.reason);
      break;
    }
    s.addEventListener('abort', () => controller.abort(s.reason), { once: true });
  }
  return controller.signal;
}

// ---- 同步请求 ----

/**
 * 同步请求 DeepSeek（stream: false）。
 * 用于 Planner 阶段：需要拿到完整的 tool_calls 结果后再执行工具。
 *
 * @param {DeepSeekMessage[]} messages
 * @param {Object} options
 * @param {unknown[]} [options.tools] - OpenAI function-calling 格式的工具定义
 * @param {'auto'|'none'|'required'|{type:'function',function:{name:string}}} [options.toolChoice='auto']
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<DeepSeekResult>}
 */
export async function requestDeepSeek(messages, options = {}) {
  const cfg = getProviderConfig();
  const apiKey = getApiKey(cfg);
  const providerFetch = getProviderFetch();
  const body = {
    model: getModel(cfg),
    messages,
    stream: false,
    ...cfg.extraBody,
    ...(Number.isFinite(options.maxTokens) ? { max_tokens: options.maxTokens } : {}),
    ...(Number.isFinite(options.temperature) ? { temperature: options.temperature } : {}),
  };

  if (options.tools?.length) {
    body.tools = options.tools;
    body.tool_choice = options.toolChoice ?? 'auto';
  }

  const res = await providerFetch(cfg.baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    // 客户端断开(options.signal)与 90s 整体超时,任一触发即中止
    signal: combineSignals([options.signal, AbortSignal.timeout(PLANNER_TIMEOUT_MS)]),
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error?.message || `${cfg.name} 请求失败：${res.status}`);
  }

  const msg = data.choices?.[0]?.message;
  const usage = data.usage || {};
  const usageStatus = Number(usage.total_tokens || 0) > 0 ? 'reported' : 'missing';
  return {
    content: msg?.content || '',
    toolCalls: msg?.tool_calls || [],
    usage: {
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
      totalTokens: usage.total_tokens || 0,
    },
    usageStatus,
    provider: cfg.name,
    model: body.model,
    finishReason: data.choices?.[0]?.finish_reason || null,
  };
}

// ---- 流式请求 ----

/**
 * 流式请求 DeepSeek（stream: true）。
 * 用于 Final Reply 阶段：将 AI 回复逐字推送给前端。
 *
 * DeepSeek SSE 格式：每行 "data: <json>"，以 [DONE] 结束。
 *
 * @param {DeepSeekMessage[]} messages
 * @param {Object} options
 * @param {(chunk: string) => void} options.onDelta - 每个文本增量回调
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ content: string, leakedToolCall: boolean }>}
 */
export async function requestDeepSeekStream(messages, options = {}) {
  const cfg = getProviderConfig();
  const apiKey = getApiKey(cfg);
  const providerFetch = getProviderFetch();

  // 空闲超时:每收到一段数据就重置计时,连续 STREAM_IDLE_MS 无新数据视为挂死。
  // 只拦"连上却不吐字",正常持续输出的长回答不受影响(绝对超时会误杀长回答)。
  const idleController = new AbortController();
  let hasReceivedProviderChunk = false;
  const abortIdle = () => idleController.abort(createStreamTimeoutError(hasReceivedProviderChunk));
  let idleTimer = setTimeout(abortIdle, STREAM_IDLE_MS);
  const resetIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(abortIdle, STREAM_IDLE_MS);
  };
  try {
    const res = await providerFetch(cfg.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      // 客户端断开(options.signal)与空闲超时,任一触发即中止
      signal: combineSignals([options.signal, idleController.signal]),
      body: JSON.stringify({
        model: getModel(cfg),
        messages,
        stream: true,
        stream_options: { include_usage: true },
        ...(Number.isFinite(options.maxTokens) ? { max_tokens: options.maxTokens } : {}),
        // 回答风格:调用方(agentHandle)按用户偏好传入并已 clamp;仅作用于最终回答,Planner 不设(保证工具选择稳定)
        ...(Number.isFinite(options.temperature) ? { temperature: options.temperature } : {}),
        ...cfg.extraBody,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error?.message || `${cfg.name} 流式请求失败：${res.status}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error(`${cfg.name} 流式响应为空`);
    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';
    let pendingContent = '';
    let leakedToolCall = false;
    const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    let finishReason = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;
      hasReceivedProviderChunk = true;
      resetIdle(); // 收到新数据,重置空闲计时

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith('data:')) continue;
        const dataStr = line.slice(5).trim();
        if (!dataStr || dataStr === '[DONE]') continue;

        let chunk;
        try {
          chunk = JSON.parse(dataStr);
        } catch {
          continue; // 忽略无法解析的行
        }

        if (chunk.error?.message) {
          throw new Error(chunk.error.message);
        }

        if (chunk.usage) {
          usage.promptTokens = Number(chunk.usage.prompt_tokens || 0);
          usage.completionTokens = Number(chunk.usage.completion_tokens || 0);
          usage.totalTokens = Number(chunk.usage.total_tokens || 0);
        }

        if (chunk.choices?.[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason;

        const delta = chunk.choices?.[0]?.delta?.content || '';
        if (!delta) continue;
        if (leakedToolCall) continue;

        pendingContent += delta;
        const leakedAt = findLeakedToolCallStart(pendingContent);
        if (leakedAt >= 0) {
          const safePrefix = pendingContent.slice(0, leakedAt);
          if (safePrefix) {
            fullContent += safePrefix;
            options.onDelta(safePrefix);
          }
          pendingContent = '';
          leakedToolCall = true;
          continue;
        }

        // 保留短尾巴以识别被 SSE 分片拆开的 <｜｜DSML... / invoke name= 标记。
        // 只增加很小的首字延迟，避免任何内部协议片段先被推送到浏览器后再发现。
        const LEAK_GUARD_TAIL = 32;
        if (pendingContent.length > LEAK_GUARD_TAIL) {
          const safeContent = pendingContent.slice(0, -LEAK_GUARD_TAIL);
          pendingContent = pendingContent.slice(-LEAK_GUARD_TAIL);
          fullContent += safeContent;
          options.onDelta(safeContent);
        }
      }
    }
    if (!leakedToolCall && pendingContent) {
      fullContent += pendingContent;
      options.onDelta(pendingContent);
    }

    return {
      content: fullContent,
      leakedToolCall,
      usage,
      usageStatus: usage.totalTokens > 0 ? 'reported' : 'missing',
      provider: cfg.name,
      model: getModel(cfg),
      finishReason,
    };
  } finally {
    // fetch 建连阶段抛错同样必须清理；旧实现只覆盖 reader 循环，会留下一个多余计时器。
    clearTimeout(idleTimer);
  }
}

/**
 * 检测 content 是否是"泄漏的工具调用标记"。
 * DeepSeek 偶发不把工具调用放进标准 tool_calls 字段,而是把内部特殊 token 以文本吐进 content,
 * 例如: <｜｜DSML｜｜tool_calls> ... <｜｜DSML｜｜invoke name="query_users"> ...,
 * 或标准的 <｜tool▁calls▁begin｜> 系列。这类内容绝不能当作回答返回给用户。
 * @param {string|null|undefined} content
 * @returns {boolean}
 */
export function looksLikeLeakedToolCall(content) {
  return findLeakedToolCallStart(content) >= 0;
}

function findLeakedToolCallStart(content) {
  if (!content || typeof content !== 'string') return -1;
  const patterns = [
    /<[｜|]{1,2}DSML[｜|]{1,2}/i,
    /<｜tool/i,
    /tool▁call/i,
    /<[^>\n]{0,80}tool_calls?>/i,
    /tool_calls?>/i,
    /<[^>\n]{0,80}invoke\s+name\s*=/i,
    /invoke\s+name\s*=/i,
  ];
  return patterns.reduce((result, pattern) => {
    const index = content.search(pattern);
    return index < 0 ? result : result < 0 ? index : Math.min(result, index);
  }, -1);
}

/**
 * 从"泄漏成文本的工具调用"里把真实调用解析出来。
 * DeepSeek 偶发把调用以 <｜｜DSML｜｜invoke name="X"><｜｜DSML｜｜parameter name="k">v</...> 文本吐进 content
 * (工具名和参数其实都对),直接解析出来当标准 tool_calls 执行,比重试更稳、更省一次调用。
 * @param {string|null|undefined} content
 * @returns {Array<{id:string,type:'function',function:{name:string,arguments:string}}>}
 */
export function parseLeakedToolCalls(content) {
  if (!content || typeof content !== 'string') return [];
  const calls = [];
  const invokeRe = /invoke\s+name\s*=\s*["']([^"']+)["']([\s\S]*?)<\/[^>]*?invoke\s*>/gi;
  let m;
  while ((m = invokeRe.exec(content)) !== null) {
    const name = m[1].trim();
    if (!name) continue;
    const body = m[2] || '';
    const args = {};
    const paramRe = /parameter\s+name\s*=\s*["']([^"']+)["'][^>]*?>([\s\S]*?)<\/[^>]*?parameter\s*>/gi;
    let p;
    while ((p = paramRe.exec(body)) !== null) {
      args[p[1].trim()] = (p[2] || '').trim();
    }
    calls.push({
      id: `leaked_${calls.length}`,
      type: 'function',
      function: { name, arguments: JSON.stringify(args) },
    });
  }
  return calls;
}
