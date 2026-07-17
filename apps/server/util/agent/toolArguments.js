const WRITE_INTENT_PATTERN = /创建|新建|生成|写(?:一|个|篇)?|保存|记录|整理成|存为|create|generate|write|save/i;

/**
 * 解析模型返回的 function arguments。
 * 空参数对无参工具是合法的；非空但无法解析时必须显式失败，禁止静默降级为 {}。
 */
export function parseToolCallArguments(toolCall) {
  const raw = toolCall?.function?.arguments;
  if (raw == null || raw === '') return { ok: true, args: {} };
  if (typeof raw === 'object' && !Array.isArray(raw)) return { ok: true, args: raw };
  if (typeof raw !== 'string') {
    return {
      ok: false,
      args: {},
      error: 'TOOL_ARGUMENTS_INVALID',
      message: 'AI 生成的操作参数格式无效，请重新发起操作。',
    };
  }
  try {
    const args = JSON.parse(raw);
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw new TypeError('arguments must be an object');
    return { ok: true, args };
  } catch {
    return {
      ok: false,
      args: {},
      error: 'TOOL_ARGUMENTS_INVALID',
      message: 'AI 生成的操作参数不完整，请重新发起操作。',
    };
  }
}

/** 工具可按供应商常见别名归一参数；归一后的参数才进入确认令牌。 */
export function normalizeToolArguments(tool, args) {
  if (typeof tool?.normalizeArgs !== 'function') return args;
  const normalized = tool.normalizeArgs(args);
  if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) {
    throw new Error('TOOL_ARGUMENTS_INVALID: AI 生成的操作参数格式无效，请重新发起操作。');
  }
  return normalized;
}

/**
 * 归一化并补齐工具参数。
 *
 * prepareArgs 用于需要根据当前账号数据解析参数的工具，例如把自然语言中的
 * 云空间文件夹名称解析为权威 folderId。它只允许做校验/解析，不能产生写入副作用；
 * 返回值会作为后续预览、确认令牌和最终执行的唯一参数来源。
 */
export async function prepareToolArguments(tool, args, ctx = {}) {
  const normalized = normalizeToolArguments(tool, args);
  if (typeof tool?.prepareArgs !== 'function') return normalized;
  let prepared;
  try {
    prepared = await tool.prepareArgs(normalized, ctx);
  } catch (error) {
    if (error && (typeof error === 'object' || typeof error === 'function')) {
      Object.defineProperty(error, 'normalizedToolArgs', {
        value: normalized,
        configurable: true,
      });
    }
    throw error;
  }
  if (!prepared || typeof prepared !== 'object' || Array.isArray(prepared)) {
    throw new Error('TOOL_ARGUMENTS_INVALID: AI 生成的操作参数格式无效，请重新发起操作。');
  }
  return prepared;
}

/**
 * 创建长正文时，1200 token 容易把 function arguments 截断。
 * 仅对明确的笔记写入意图扩大 Planner 输出预算，普通查询仍保持原预算。
 */
export function getPlannerMaxTokens({ message, attachmentCount = 0, selectedToolNames } = {}) {
  const canCreateNote = selectedToolNames instanceof Set && selectedToolNames.has('create_note');
  const explicitWrite = WRITE_INTENT_PATTERN.test(String(message || ''));
  return canCreateNote && (explicitWrite || Number(attachmentCount) > 0) ? 4096 : 1200;
}
