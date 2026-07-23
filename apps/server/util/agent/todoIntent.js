/**
 * 只识别可以安全补齐为“待确认操作”的极窄待办语句。
 *
 * Planner 仍是 Agent 的默认入口；此解析器只兜底模型漏调工具的高置信情形：
 * 用户明确给出一条带引号的待办标题，并明确要求完成或重新打开。即使命中，
 * 后续仍会经过 prepareTodoStatusChange 的归属、唯一性和版本校验，绝不直接写入。
 */
const QUOTED_TODO_TARGET_PATTERNS = [
  /(?:把|将)?\s*(?:待办|任务)\s*(?:叫(?:做)?|名称为)?\s*[「“"《]([^」”"》\n]{1,100})[」”"》]/u,
  /(?:完成|重新打开|恢复)\s*(?:这|该)?(?:条)?\s*(?:待办|任务)\s*[「“"《]([^」”"》\n]{1,100})[」”"》]/u,
];

const PENDING_STATUS_PATTERN =
  /(?:重新打开|重新开启|恢复(?:为)?(?:待处理|未完成)?|(?:标记|设置|设定|改|修改|变更)(?:为)?(?:待处理|未完成))/u;
const COMPLETED_STATUS_PATTERN =
  /(?:(?:标记|设置|设定|改|修改|变更)(?:为)?(?:已)?完成|完成(?:这|该)?(?:条)?(?:待办|任务)?)/u;
const HOW_TO_PATTERN = /(?:怎么|如何|怎样).{0,16}(?:待办|任务).{0,40}(?:完成|未完成|待处理)/u;

function inferTargetStatus(text) {
  // “未完成”包含“完成”，因此必须优先判断待处理语义。
  if (PENDING_STATUS_PATTERN.test(text)) return 'pending';
  if (COMPLETED_STATUS_PATTERN.test(text)) return 'completed';
  return null;
}

function extractQuotedTarget(text) {
  for (const pattern of QUOTED_TODO_TARGET_PATTERNS) {
    const value = pattern.exec(text)?.[1];
    const target = String(value || '')
      .replace(/\s+/gu, ' ')
      .trim();
    if (target) return target;
  }
  return '';
}

/**
 * 为模型漏调工具提供一个安全的、受限的补偿调用参数。
 * 没有可验证的单条目标、属于“怎么操作”的问法，或状态不明确时一律返回 null。
 */
export function parseExplicitTodoStatusAction(message) {
  const text = String(message || '')
    .replace(/\s+/gu, ' ')
    .trim();
  if (!text || text.length > 400 || HOW_TO_PATTERN.test(text)) return null;
  const status = inferTargetStatus(text);
  const keyword = extractQuotedTarget(text);
  return status && keyword ? { keyword, status } : null;
}
