/**
 * Agent 聊天处理器
 *
 * 核心流程（两段式 Agent）：
 *   用户消息 → sync DeepSeek (带 tools) → 有 tool_calls?
 *     ├─ 是 → 执行工具 → stream DeepSeek (Final Reply) → 逐 chunk 推 SSE
 *     └─ 否 → sync DeepSeek content 直接作为回答 → 单块 SSE
 *
 * 参考 ai-assistant 的 ReAct 模式，适配轻笺 Express 后端。
 */

import pool from '../db/index.js';
import { resultData, generateUUID } from '../util/common.js';
import {
  requestDeepSeek,
  requestDeepSeekStream,
  getActiveProviderPricing,
  looksLikeLeakedToolCall,
  parseLeakedToolCalls,
} from '../util/agent/deepseekClient.js';
import { parseTimeRange } from '../util/agent/timeRange.js';
import { getOrCreateSession, recordTurn, getSessionId } from '../util/agent/sessionStore.js';
import { buildPlannerPrompt } from '../util/agent/prompt.js';
import toolDefsArray from '../util/agent/tools/index.js';
import * as aiQuota from '../util/aiQuota.js';

// ============================================================
// 工具注册中心（Map-based，扩展只需 registerTool）
// ============================================================

/** @type {Map<string, AgentTool>} */
const toolRegistry = new Map();

/**
 * 注册工具
 * @param {AgentTool} tool
 */
function registerTool(tool) {
  toolRegistry.set(tool.name, tool);
}

// 注册所有工具
toolDefsArray.forEach(t => registerTool(t));

/**
 * 获取 OpenAI function-calling 格式的工具定义列表
 * @returns {Array<{ type: 'function', function: { name: string, description: string, parameters: object } }>}
 */
function getToolDefinitions() {
  const defs = [];
  for (const tool of toolRegistry.values()) {
    defs.push({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    });
  }
  return defs;
}

/**
 * 执行工具
 * @param {string} name
 * @param {Record<string, unknown>} args - LLM 传入的参数
 * @param {{ userId: string, userRole: string, userAlias: string }} ctx
 * @returns {Promise<{ status: 'success'|'error', summary: string, error?: string, dataSummary?: string, params?: Record<string, unknown> }>}
 */
async function executeTool(name, args, ctx) {
  const tool = toolRegistry.get(name);
  if (!tool) {
    return { status: 'error', summary: `未知工具: ${name}`, error: 'TOOL_NOT_FOUND' };
  }

  // 权限检查：需要 root 的工具
  if (tool.requireRoot && ctx.userRole !== 'root') {
    return { status: 'error', summary: '权限不足：仅管理员可查询此数据', error: 'FORBIDDEN' };
  }

  // 游客只读预览：写工具对游客（或无身份）拒绝，引导注册；只读工具照常放行
  if (tool.isWrite && (ctx.userRole === 'visitor' || !ctx.userId || ctx.userId === 'visitor')) {
    return {
      status: 'error',
      summary: '预览模式仅支持浏览查看，新建、编辑、恢复等操作需要注册；注册后即可拥有你自己的轻笺。',
      error: 'GUEST_FORBIDDEN',
    };
  }

  // 如果有 user 参数，解析目标用户（仅 root 可用）
  if (args.user && String(args.user).trim()) {
    if (ctx.userRole !== 'root') {
      return { status: 'error', summary: '无权限查看他人数据，仅管理员可指定用户', error: 'FORBIDDEN' };
    }
    const resolved = await resolveUser(args.user);
    if (!resolved) {
      return { status: 'error', summary: `未找到用户"${args.user}"`, error: 'USER_NOT_FOUND' };
    }
    // 替换 ctx 中的 userId 为目标用户
    ctx = { ...ctx, userId: resolved.id, userAlias: resolved.alias };
  }

  try {
    const raw = await tool.execute(args, ctx);
    const summary = tool.transform(raw, args);
    // dataSummary 比 transform 更精简，给 lastTool 用
    const dataSummary = typeof tool.summarize === 'function'
      ? tool.summarize(raw, args)
      : summary.slice(0, 200);
    return {
      status: 'success',
      summary,
      dataSummary,
      params: args,
    };
  } catch (err) {
    console.error(`[Agent] 工具 ${name} 执行失败:`, err.message);
    return {
      status: 'error',
      summary: `查询失败：${err.message}`,
      error: err.message,
      params: args,
    };
  }
}

// ============================================================
// 用户解析（root 查他人数据时用）
// ============================================================

/**
 * 根据昵称/邮箱/ID 查找用户
 * @param {string} keyword
 * @returns {Promise<{ id: string, alias: string } | null>}
 */
async function resolveUser(keyword) {
  const kw = String(keyword).trim();
  if (!kw) return null;
  const [rows] = await pool.query(
    `SELECT id, alias FROM user WHERE (alias = ? OR email = ? OR id = ?) AND del_flag = '0' LIMIT 1`,
    [kw, kw, kw],
  );
  return rows[0] || null;
}


// ============================================================
// Agent 请求日志
// ============================================================

/**
 * 写入 agent_logs 表
 * 成本按当前生效的 AGENT_LLM_PROVIDER 计价(见 deepseekClient.js 的 PROVIDERS 单价表),
 * 不同供应商单价不同,切换后新请求会自动按新供应商计费。
 */
async function logAgentRequest({ userId, userAlias, question, toolsUsed, iterations, totalUsage, durationMs, status, errorMsg }) {
  const { price } = getActiveProviderPricing();
  const cost = (
    (totalUsage.promptTokens / 1_000_000) * price.input +
    (totalUsage.completionTokens / 1_000_000) * price.output
  );
  const toolsStr = toolsUsed.map(t => t.name).join(',') || null;
  try {
    const data = {
      id: generateUUID(),
      user_id: userId || '',
      user_alias: userAlias || '',
      question: String(question || '').slice(0, 1000),
      tools_used: toolsStr,
      iterations,
      prompt_tokens: totalUsage.promptTokens,
      completion_tokens: totalUsage.completionTokens,
      total_tokens: totalUsage.totalTokens,
      cost: Number(cost.toFixed(6)),
      status: status || 'success',
      error_msg: errorMsg || null,
      duration_ms: durationMs,
    };
    await pool.query(
      `INSERT INTO agent_logs (id,user_id,user_alias,question,tools_used,iterations,prompt_tokens,completion_tokens,total_tokens,cost,status,error_msg,duration_ms) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [data.id, data.user_id, data.user_alias, data.question, data.tools_used, data.iterations, data.prompt_tokens, data.completion_tokens, data.total_tokens, data.cost, data.status, data.error_msg, data.duration_ms],
    );
  } catch (err) {
    console.error('[Agent] 写入日志失败:', err.message);
  }
}

// ============================================================
// 主 Handler
// ============================================================

/**
 * POST /api/chat/agent
 */
export async function agentChat(req, res) {
  req.setTimeout(0);

  let stream = false;
  // 下面两个声明放在 try 外:catch 块要 removeListener(onClientClose),而 catch 是 try 的
  // 兄弟作用域,访问不到 try 内声明的 const —— 否则一进 catch 就二次抛 ReferenceError
  const agentAbortController = new AbortController();
  const onClientClose = () => {
    if (!agentAbortController.signal.aborted) {
      agentAbortController.abort();
    }
  };

  // AI token 限流:handle 与 token 累计放 try 外,finally 里统一回写(正常/异常/abort 都执行)
  let quotaHandle = null;
  const totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  try {
    const {
      message,
      sessionId = '',
      enableTranslation = false,
      translationConfig = {},
      aiStyle = '',
      history = [],
    } = req.body;
    stream = req.body.stream ?? false;
    // 回答风格 → temperature(仅作用最终回答);未识别则不设、走默认
    const STYLE_TEMP = { strict: 0.3, balanced: 1.0, creative: 1.5 };
    const styleTemperature = STYLE_TEMP[aiStyle];

    if (!message?.trim()) {
      return res.status(400).send(resultData(null, 400, '消息不能为空'));
    }

    // 用户身份
    const userId = req.user?.id || 'visitor';
    const userRole = req.user?.role || 'visitor';
    const userAlias = req.user?.alias || '访客';

    // ---- AI token 前置 gate ----
    // P0-A 灰度:dry-run 只记录用量、永不拦截(AI_GATE_ENFORCE=true 时才拦,P1 开启)。
    // 此处早于 req.on('close') 挂载、响应也未开始,blocked 时可安全直接 return。
    quotaHandle = await aiQuota.reserve(req, { userId, userRole });
    if (quotaHandle.blocked) {
      // 额度用完的提示按身份区分:登录用户引导「升级涨额度」,游客引导「注册得更多」
      const tip =
        quotaHandle.type === 'user'
          ? '今日 AI 额度已用完啦～ 明天 0 点自动重置。想要更多?提升等级即可解锁更高额度,段位越高额度越多(满级 200 万 token/日)。'
          : '访客今日 AI 额度已用完啦～ 明天 0 点重置。登录注册后额度立涨,还能随等级成长持续提升,一路解锁到满级 200 万 token/日 😉';
      if (stream) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        });
        res.write(`data: ${JSON.stringify({ output: { text: tip }, preview: userRole === 'visitor', quotaExceeded: true })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      } else {
        res.send(resultData({ preview: userRole === 'visitor', quotaExceeded: true }, 429, tip));
      }
      return;
    }

    // 会话
    const session = await getOrCreateSession(sessionId);

    // 构建 system prompt（动态：根据角色决定工具提示详略）
    const prompt = buildPlannerPrompt(toolRegistry, userRole);
    // 只把「最近一次成功工具调用」放 system,帮助理解省略式追问(如「那第二个呢」);
    // 对话历史不再塞进 system 的 JSON 块,而是作为真实多轮消息注入(见下方 messages),模型才真有记忆。
    const systemContent = session.lastTool
      ? `${prompt}\n\n---\n\n最近一次成功的工具调用（供理解省略式追问）：${JSON.stringify(session.lastTool)}`
      : prompt;

    // 处理翻译模式
    let userMessage = message;
    if (enableTranslation) {
      const { source = 'auto', target = 'zh' } = translationConfig || {};
      const langNames = { auto: '自动识别', zh: '中文', en: '英文', ja: '日文', ko: '韩文' };
      const targetName = langNames[target] || target;
      const sourceHint = source === 'auto' ? '' : `（源语言: ${langNames[source] || source}）`;
      userMessage = `请将以下内容翻译成${targetName}${sourceHint}：\n\n${message}`;
    }

    // 构建 messages 数组:历史拼成真正的多轮 user/assistant 消息(而非塞进 system 的 JSON 块),模型才真有记忆。
    // 优先用前端带来的完整对话(显示=发送,一致);按字符预算截「最近」部分兜底防超长/超上下文窗口;
    // 没带 history(老客户端 / 笔记助手等)则回退服务端 session.turns。
    const HISTORY_CHAR_BUDGET = 16000; // ≈ 8K token(中文),远低于 DeepSeek 64K,给系统提示/工具/生成留足空间
    /** @type {import('../util/agent/deepseekClient.js').DeepSeekMessage[]} */
    let historyMessages;
    if (Array.isArray(history) && history.length) {
      const valid = history.filter(
        (m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content,
      );
      const kept = [];
      let chars = 0;
      for (let i = valid.length - 1; i >= 0; i--) {
        chars += valid[i].content.length;
        if (chars > HISTORY_CHAR_BUDGET && kept.length) break; // 超预算就丢最老的,始终保留最近
        kept.unshift({ role: valid[i].role, content: valid[i].content });
      }
      historyMessages = kept;
    } else {
      historyMessages = (session.turns || [])
        .flatMap((t) => [
          { role: 'user', content: t.user },
          { role: 'assistant', content: t.assistant },
        ])
        .filter((m) => m.content);
    }
    const messages = [
      { role: 'system', content: systemContent },
      ...historyMessages,
      { role: 'user', content: userMessage },
    ];

    // 流式模式：提前设置 SSE headers + 客户端断开时 abort DeepSeek 流
    // (agentAbortController / onClientClose 已在 try 外声明,便于 catch 中 removeListener)
    req.on('close', onClientClose);

    if (stream) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
    }

    // 工具定义
    const toolDefs = getToolDefinitions();

    /** @type {Array<{ name: string, status: string, params?: object, error?: string, dataSummary?: string }>} */
    const usedTools = [];
    let finalContent = '';
    const startTime = Date.now();
    let apiCalls = 0;
    // 累计所有 DeepSeek 调用的 token 用量(totalUsage 已在 try 外声明,供 finally 回写额度)

    // ---- 第1步：Planner（带工具定义，让 LLM 决定是否调工具） ----
    let plannerResponse = await requestDeepSeek(messages, { tools: toolDefs });
    apiCalls++;
    totalUsage.promptTokens += plannerResponse.usage.promptTokens;
    totalUsage.completionTokens += plannerResponse.usage.completionTokens;
    totalUsage.totalTokens += plannerResponse.usage.totalTokens;

    // 兜底:DeepSeek 偶发把工具调用以特殊 token 文本吐进 content(而非标准 tool_calls 字段),
    // 导致 toolCalls 为空、content 是一段调用标记原文。检测到就重试一次 Planner(大概率恢复正常);
    // 若重试后仍是泄漏的调用标记,下面的 finalContent 判断会换成友好提示,不会原样透出给用户。
    if (!plannerResponse.toolCalls?.length && looksLikeLeakedToolCall(plannerResponse.content)) {
      // 优先直接解析泄漏的调用(模型选对了工具、参数,只是走错通道)——比重试更稳、省一次调用
      const leaked = parseLeakedToolCalls(plannerResponse.content);
      if (leaked.length) {
        console.warn('[Agent] 工具调用泄漏进 content，已解析为标准调用直接执行');
        plannerResponse = { ...plannerResponse, toolCalls: leaked, content: '' };
      } else {
        // 解析不出来,重试一次 Planner(大概率恢复正常)
        console.warn('[Agent] 检测到工具调用泄漏进 content，重试一次 Planner');
        plannerResponse = await requestDeepSeek(messages, { tools: toolDefs });
        apiCalls++;
        totalUsage.promptTokens += plannerResponse.usage.promptTokens;
        totalUsage.completionTokens += plannerResponse.usage.completionTokens;
        totalUsage.totalTokens += plannerResponse.usage.totalTokens;
        // 重试后仍泄漏,再尝试解析一次
        if (!plannerResponse.toolCalls?.length && looksLikeLeakedToolCall(plannerResponse.content)) {
          const leaked2 = parseLeakedToolCalls(plannerResponse.content);
          if (leaked2.length) {
            console.warn('[Agent] 重试后仍泄漏，解析为标准调用执行');
            plannerResponse = { ...plannerResponse, toolCalls: leaked2, content: '' };
          }
        }
      }
    }

    if (!plannerResponse.toolCalls?.length) {
      // 无工具调用 → 直接当作回答，跳过 Final Reply。
      // 若重试后仍是泄漏的调用标记,不把原文暴露给用户,改回友好提示。
      finalContent = looksLikeLeakedToolCall(plannerResponse.content)
        ? '抱歉，我刚才没能正确处理这个请求，请换个说法或稍后再试一次。'
        : plannerResponse.content || '';
    } else {
      // 兜底:只取前 MAX_PARALLEL_TOOLS 个 tool_calls,防 LLM 极端情况一次吐一堆
      // (含重复查询)并发打满 DB 连接池。assistant 消息与实际执行必须用同一批——
      // OpenAI 协议要求每个 tool_call 都有对应的 tool 结果,否则下一轮请求会报错。
      const MAX_PARALLEL_TOOLS = 8;
      const toolCalls = plannerResponse.toolCalls.slice(0, MAX_PARALLEL_TOOLS);

      // 追加 assistant 消息（含 tool_calls）
      messages.push({
        role: 'assistant',
        content: null,
        tool_calls: toolCalls,
      });

      // 并行执行所有工具
      const results = await Promise.all(
        toolCalls.map(async (tc) => {
          let args = {};
          try {
            args = JSON.parse(tc.function.arguments || '{}');
          } catch {
            args = {};
          }
          const result = await executeTool(tc.function.name, args, { userId, userRole, userAlias });
          usedTools.push({
            name: tc.function.name,
            status: result.status,
            params: args,
            error: result.error,
            dataSummary: result.dataSummary,
          });
          return { toolCallId: tc.id, result };
        }),
      );

      // 追加 tool 结果消息
      for (const r of results) {
        messages.push({
          role: 'tool',
          tool_call_id: r.toolCallId,
          content: r.result.summary,
        });
      }

      // ---- 第2步：Final Reply ----
      messages.push({
        role: 'user',
        content: '请基于上述工具结果给出简洁的总结。',
      });

      if (stream) {
        // 流式：首批 buffer 掩盖 DeepSeek token 间隔 gap
        let bufferStart = 0;
        let bufferText = '';
        let isBuffering = true;
        const BUFFER_MS = 150;
        const BUFFER_CHARS = 12;

        await requestDeepSeekStream(messages, {
          temperature: styleTemperature,
          onDelta: (chunk) => {
            if (isBuffering && bufferStart === 0) {
              bufferStart = Date.now();
              bufferText = chunk;
              return;
            }

            if (isBuffering) {
              bufferText += chunk;
              const elapsed = Date.now() - bufferStart;
              if (elapsed >= BUFFER_MS || bufferText.length >= BUFFER_CHARS) {
                finalContent += bufferText;
                res.write(`data: ${JSON.stringify({ output: { text: bufferText, session_id: getSessionId(session) } })}\n\n`);
                isBuffering = false;
              }
              return;
            }

            finalContent += chunk;
            res.write(`data: ${JSON.stringify({ output: { text: chunk, session_id: getSessionId(session) } })}\n\n`);
          },
          signal: agentAbortController.signal,
        });

        if (isBuffering && bufferText) {
          finalContent += bufferText;
          res.write(`data: ${JSON.stringify({ output: { text: bufferText, session_id: getSessionId(session) } })}\n\n`);
        }

        apiCalls++;
        if (!finalContent) finalContent = '抱歉，无法处理该请求。';
      } else {
        const finalResponse = await requestDeepSeek(messages, { toolChoice: 'none' });
        apiCalls++;
        totalUsage.promptTokens += finalResponse.usage.promptTokens;
        totalUsage.completionTokens += finalResponse.usage.completionTokens;
        totalUsage.totalTokens += finalResponse.usage.totalTokens;
        finalContent = finalResponse.content || '抱歉，无法处理该请求。';
      }
    }

    // ---- 输出 ----
    if (stream) {
      // 客户端已断开则响应流已结束,继续 write 会对已关闭 socket 抛 EPIPE
      if (!res.writableEnded) {
        if (!usedTools.length) {
          res.write(`data: ${JSON.stringify({ output: { text: finalContent, session_id: getSessionId(session) } })}\n\n`);
        }
        res.write('data: [DONE]\n\n');
        res.end();
      }
      res.removeListener('close', onClientClose);
    } else {
      res.send(resultData({ response: finalContent, sessionId: getSessionId(session) }));
      res.removeListener('close', onClientClose);
    }

    // 记录本轮对话(客户端中途断开时 finalContent 只是半截,不写入会话记忆,避免污染后续上下文)
    if (!agentAbortController.signal.aborted) {
      recordTurn(session, message, finalContent, usedTools);
    }

    // 异步写日志（不阻塞响应）

    logAgentRequest({
      userId, userAlias,
      question: message,
      toolsUsed: usedTools,
      iterations: apiCalls,
      totalUsage,
      durationMs: Date.now() - startTime,
      status: 'success',
    });
  } catch (error) {
    console.error('[Agent] 请求错误:', error.message);
    // 客户端主动断开(abort)或响应已结束时不要再写——对已关闭的 socket 写入会抛 EPIPE;
    // 断开导致的 abort 本就不是"服务异常",无需向已离开的用户回错误帧
    if (stream) {
      if (!agentAbortController.signal.aborted && !res.writableEnded) {
        try {
          res.write(`data: ${JSON.stringify({ error: '服务异常', message: error.message })}\n\n`);
          res.end();
        } catch (_) { /* ignore */ }
      }
    } else if (!res.headersSent) {
      res.status(500).send(resultData(null, 500, 'AI 服务异常: ' + error.message));
    }
    res.removeListener('close', onClientClose);
  } finally {
    // AI token 额度回写:正常/异常/abort 都执行。abort 按已消耗结算、不退还占位(见 aiQuota.reconcile)。
    try {
      await aiQuota.reconcile(quotaHandle, totalUsage.totalTokens, {
        aborted: agentAbortController.signal.aborted,
      });
    } catch (e) {
      console.warn('[Agent] AI 额度回写异常(忽略):', e.message);
    }
  }
}
