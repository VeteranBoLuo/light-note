const CHECKLIST_PROGRESS_REQUEST_PATTERN =
  /(?:清单|子任务|检查项)[^。！？\n]{0,12}(?:进度|完成情况|完成了多少|还剩多少)|(?:进度|完成情况)[^。！？\n]{0,12}(?:清单|子任务|检查项)|checklist\s+(?:progress|status|completion)/iu;
const CHECKLIST_PROGRESS_PATTERN = /清单[：:]\s*(\d{1,6})\s*\/\s*(\d{1,6})/gu;

function uniqueChecklistProgresses(usedTools) {
  const seen = new Set();
  const progresses = [];
  for (const tool of Array.isArray(usedTools) ? usedTools : []) {
    if (tool?.name !== 'query_todos' || tool?.status !== 'success') continue;
    const summary = String(tool.summary || '');
    for (const match of summary.matchAll(CHECKLIST_PROGRESS_PATTERN)) {
      const completed = Number(match[1]);
      const total = Number(match[2]);
      if (!Number.isSafeInteger(completed) || !Number.isSafeInteger(total) || completed > total) continue;
      const key = `${completed}/${total}`;
      if (seen.has(key)) continue;
      seen.add(key);
      progresses.push({ completed, total, key });
    }
  }
  return progresses;
}

function answerContainsProgress(answer, progress) {
  const compact = String(answer || '').replace(/\s+/gu, '');
  if (compact.includes(progress.key)) return true;
  const remaining = progress.total - progress.completed;
  const completedPattern = new RegExp(`(?:已完成|完成了?)${progress.completed}(?:项)?`, 'u');
  const remainingPattern = new RegExp(`(?:还差|剩余|未完成)${remaining}(?:项)?`, 'u');
  return completedPattern.test(compact) && remainingPattern.test(compact);
}

/**
 * 最终回答只能自由组织表达，不能自由丢弃用户明确点名的结构化事实。
 *
 * 这里仅消费已通过工具 transform 脱敏、且已经提供给模型的摘要；不读取 raw 结果，
 * 也不把内部实体 ID 复制到回答。供应商遗漏清单进度时，追加最小确定性事实。
 */
export function ensureRequestedToolFacts({ question, answer, usedTools } = {}) {
  const normalizedAnswer = String(answer || '').trim();
  if (!normalizedAnswer || !CHECKLIST_PROGRESS_REQUEST_PATTERN.test(String(question || ''))) {
    return { answer: normalizedAnswer, applied: false, facts: [] };
  }

  const missing = uniqueChecklistProgresses(usedTools).filter(
    (progress) => !answerContainsProgress(normalizedAnswer, progress),
  );
  if (!missing.length) return { answer: normalizedAnswer, applied: false, facts: [] };

  const chinese = /[\p{Script=Han}]/u.test(String(question || ''));
  let supplement;
  if (missing.length === 1) {
    const [{ completed, total, key }] = missing;
    supplement = chinese
      ? `清单进度：${key}（已完成 ${completed} 项，剩余 ${total - completed} 项）。`
      : `Checklist progress: ${key} (${completed} completed, ${total - completed} remaining).`;
  } else {
    const values = missing.map((progress) => progress.key).join(chinese ? '、' : ', ');
    supplement = chinese
      ? `清单进度（按查询结果顺序）：${values}。`
      : `Checklist progress in result order: ${values}.`;
  }

  return {
    answer: `${normalizedAnswer}\n\n${supplement}`,
    applied: true,
    facts: missing.map((progress) => progress.key),
  };
}
