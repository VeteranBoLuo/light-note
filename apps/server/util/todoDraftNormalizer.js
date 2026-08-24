export const TODO_DRAFT_MAX_TITLE_CHARS = 200;
export const TODO_DRAFT_MAX_DESCRIPTION_CHARS = 2_000;
const MAX_FUTURE_YEARS = 10;
const MAX_PAST_YEARS = 1;

function firstValue(args, keys) {
  for (const key of keys) {
    const value = args?.[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return '';
}

function pad(part) {
  return String(part).padStart(2, '0');
}

/** 保持项目 DATETIME 的本地时间字面值，不经 UTC 转换。 */
export function normalizeTodoDueAt(value, { now = new Date() } = {}) {
  const raw = String(value || '').trim();
  if (!raw) return { dueAt: null, overdue: false };
  const date = new Date(raw.includes('T') || raw.includes('-') ? raw : raw.replace(/\//gu, '-'));
  if (!Number.isFinite(date.getTime())) {
    return { error: '截止时间格式无法识别，请用具体日期时间（例如 2026-08-04 21:00:00）。' };
  }
  const current = now instanceof Date ? now : new Date(now);
  const currentTime = Number.isFinite(current.getTime()) ? current.getTime() : Date.now();
  const diffYears = (date.getTime() - currentTime) / (365 * 24 * 3600 * 1000);
  if (diffYears > MAX_FUTURE_YEARS) {
    return { error: '截止时间距今超过 10 年，可能是年份写错了，请确认后重试。' };
  }
  if (diffYears < -MAX_PAST_YEARS) {
    return { error: '截止时间早于一年前，可能是年份写错了，请确认后重试。' };
  }
  return {
    dueAt: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
      date.getMinutes(),
    )}:${pad(date.getSeconds())}`,
    overdue: date.getTime() < currentTime,
  };
}

export function normalizeTodoDraft(input = {}, { now } = {}) {
  const priorityRaw = firstValue(input, ['priority', 'priorityLevel', 'priority_level', 'importance']);
  const priority = priorityRaw === '' ? 1 : Number(priorityRaw);
  const due = normalizeTodoDueAt(
    firstValue(input, ['dueAt', 'due_at', 'dueDate', 'due_date', 'deadline', 'remindAt', 'remind_at', 'time']),
    { now },
  );
  const checklist = (Array.isArray(input.checklist) ? input.checklist : [])
    .map((item) => String(typeof item === 'string' ? item : item?.text || item?.title || '').trim().slice(0, 200))
    .filter(Boolean)
    .slice(0, 50);
  return Object.freeze({
    title: firstValue(input, ['title', 'todoTitle', 'todo_title', 'taskTitle', 'task_title', 'name', 'content']).slice(
      0,
      TODO_DRAFT_MAX_TITLE_CHARS,
    ),
    description: firstValue(input, ['description', 'detail', 'details', 'note', 'remark', 'desc']).slice(
      0,
      TODO_DRAFT_MAX_DESCRIPTION_CHARS,
    ),
    dueAt: due.dueAt || '',
    dueAtError: due.error || '',
    overdue: due.overdue === true,
    priority: [0, 1, 2].includes(priority) ? priority : 1,
    checklist: Object.freeze(checklist),
  });
}

export function normalizeCreateTodoArgs(input = {}) {
  const draft = normalizeTodoDraft(input);
  return {
    title: draft.title,
    description: draft.description,
    dueAt: firstValue(input, ['dueAt', 'due_at', 'dueDate', 'due_date', 'deadline', 'remindAt', 'remind_at', 'time']),
    priority: draft.priority,
  };
}

export const todoDraftNormalizerInternals = Object.freeze({
  firstValue,
  MAX_TITLE_CHARS: TODO_DRAFT_MAX_TITLE_CHARS,
  MAX_DESCRIPTION_CHARS: TODO_DRAFT_MAX_DESCRIPTION_CHARS,
  MAX_FUTURE_YEARS,
  MAX_PAST_YEARS,
});
