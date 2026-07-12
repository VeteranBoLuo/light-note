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
  },
  qwen: {
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    apiKeyEnv: 'DASHSCOPE_API_KEY', // 复用项目里已有的阿里云百炼 key(chatHandle.js 的 App Completion 接口也用它)
    modelEnv: 'QWEN_MODEL',
    defaultModel: 'qwen3.5-flash',
    price: { input: 0.2, output: 2 },
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

function getModel(cfg) {
  return process.env[cfg.modelEnv] || cfg.defaultModel;
}

// 供 agentHandle.js 的用量日志按当前生效供应商计费(不同供应商单价不同)
export function getActiveProviderPricing() {
  const cfg = getProviderConfig();
  return { provider: cfg.name, price: cfg.price };
}

// ---- 超时控制 ----
// Planner(同步)用整体超时;流式用"空闲超时"(见 requestDeepSeekStream),
// 避免正常的长回答被绝对超时误杀,只拦截"连上却不吐字"的挂死。
const PLANNER_TIMEOUT_MS = 90_000;
const STREAM_IDLE_MS = 60_000;

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
 * @param {'auto'|'none'} [options.toolChoice='auto']
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<DeepSeekResult>}
 */
export async function requestDeepSeek(messages, options = {}) {
  const cfg = getProviderConfig();
  const body = {
    model: getModel(cfg),
    messages,
    stream: false,
    ...cfg.extraBody,
  };

  if (options.tools?.length) {
    body.tools = options.tools;
    body.tool_choice = options.toolChoice ?? 'auto';
  }

  const res = await fetch(cfg.baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getApiKey(cfg)}`,
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
  return {
    content: msg?.content || '',
    toolCalls: msg?.tool_calls || [],
    usage: {
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
      totalTokens: usage.total_tokens || 0,
    },
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
 * @returns {Promise<{ content: string }>}
 */
export async function requestDeepSeekStream(messages, options) {
  const cfg = getProviderConfig();

  // 空闲超时:每收到一段数据就重置计时,连续 STREAM_IDLE_MS 无新数据视为挂死。
  // 只拦"连上却不吐字",正常持续输出的长回答不受影响(绝对超时会误杀长回答)。
  const idleController = new AbortController();
  const abortIdle = () => idleController.abort(new DOMException('流式响应空闲超时', 'TimeoutError'));
  let idleTimer = setTimeout(abortIdle, STREAM_IDLE_MS);
  const resetIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(abortIdle, STREAM_IDLE_MS);
  };

  const res = await fetch(cfg.baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getApiKey(cfg)}`,
    },
    // 客户端断开(options.signal)与空闲超时,任一触发即中止
    signal: combineSignals([options.signal, idleController.signal]),
    body: JSON.stringify({
      model: getModel(cfg),
      messages,
      stream: true,
      // 回答风格:调用方(agentHandle)按用户偏好传入并已 clamp;仅作用于最终回答,Planner 不设(保证工具选择稳定)
      ...(Number.isFinite(options.temperature) ? { temperature: options.temperature } : {}),
      ...cfg.extraBody,
    }),
  });

  if (!res.ok) {
    clearTimeout(idleTimer);
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error?.message || `${cfg.name} 流式请求失败：${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
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

        const delta = chunk.choices?.[0]?.delta?.content || '';
        if (!delta) continue;
        fullContent += delta;
        options.onDelta(delta);
      }
    }
  } finally {
    clearTimeout(idleTimer); // 正常结束/异常/abort 都清掉计时器,防泄漏
  }

  return { content: fullContent };
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
  if (!content || typeof content !== 'string') return false;
  return /｜DSML｜|<｜tool|tool▁call|tool_calls?>|invoke name\s*=/i.test(content);
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
