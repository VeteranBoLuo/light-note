import { createHash } from 'node:crypto';

export const ADVICE_POLICY_VERSION = 9;
export const MIN_SAFE_ADVICE_POLICY_VERSION = 9;
export const ADVICE_CONTEXT_FACT_IDS = Object.freeze([
  'todo_overdue',
  'todo_due_today',
  'todo_scheduled_today',
  'organize_ai_pending',
  'organize_pending',
  'organize_untagged',
  'bookmark_created_today',
  'note_created_today',
  'file_created_today',
  'workshop_attention',
  'workshop_due',
  'workshop_next_step',
  'workshop_result',
]);
const clean = (value, limit = 120) =>
  String(value || '')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, limit);
const normalize = (value) =>
  clean(value, 2048)
    .toLowerCase()
    .replace(/[\p{P}\p{Z}\s]/gu, '');

// 只编译工作流状态。资源正文、片段、描述、用户指令和结果内容从不进入建议上下文。
export function compileAdviceSignals(facts) {
  return ADVICE_CONTEXT_FACT_IDS.flatMap((id) => {
    const fact = facts.find((item) => item.id === id && Number.isSafeInteger(item.count) && item.count > 0);
    if (!fact) return [];
    const entry = id.startsWith('todo_') ? fact.entries?.[0] : null;
    const source = fact.sources?.[0];
    return [
      {
        id,
        label: clean(fact.label, 80) || id,
        count: fact.count,
        ...(entry ? { title: clean(entry.title), at: clean(entry.at, 32), timeKind: entry.reason } : {}),
        ...(id.startsWith('workshop_') && source ? { title: clean(source.title) } : {}),
        ...(fact.urgency ? { urgency: fact.urgency } : {}),
        ...(fact.dueDate ? { dueDate: fact.dueDate } : {}),
        ...(Number.isSafeInteger(fact.pendingCount) ? { pendingCount: fact.pendingCount } : {}),
        ...(id === 'organize_ai_pending' ? { resourceTypes: fact.resourceTypes || [], kinds: fact.kinds || [] } : {}),
        sources: entry ? [{ type: 'todo', id: entry.id, title: clean(entry.title) }] : fact.sources || [],
      },
    ];
  });
}
export const adviceModelSignals = (signals) => signals.map(({ sources, ...signal }) => signal);
export function adviceContext(facts, locale) {
  const signals = compileAdviceSignals(facts);
  const key = signals.length
    ? createHash('sha256')
        .update(JSON.stringify([ADVICE_POLICY_VERSION, locale, signals]))
        .digest('hex')
    : '';
  return { signals, key };
}

export function validateAdviceSignals(signals) {
  const fields = [
    'id',
    'label',
    'count',
    'title',
    'at',
    'timeKind',
    'urgency',
    'dueDate',
    'pendingCount',
    'resourceTypes',
    'kinds',
  ];
  if (
    !Array.isArray(signals) ||
    !signals.length ||
    signals.length > ADVICE_CONTEXT_FACT_IDS.length ||
    new Set(signals.map((item) => item?.id)).size !== signals.length
  )
    throw new Error('ADVICE_SIGNALS_INVALID');
  for (const signal of signals) {
    if (
      !signal ||
      typeof signal !== 'object' ||
      Array.isArray(signal) ||
      Object.keys(signal).some((key) => !fields.includes(key)) ||
      !ADVICE_CONTEXT_FACT_IDS.includes(signal.id) ||
      !Number.isSafeInteger(signal.count) ||
      signal.count <= 0 ||
      typeof signal.label !== 'string' ||
      !signal.label ||
      signal.label.length > 80 ||
      ['title', 'at', 'dueDate'].some(
        (key) =>
          signal[key] !== undefined &&
          (typeof signal[key] !== 'string' || signal[key].length > (key === 'title' ? 120 : 32)),
      ) ||
      (signal.pendingCount !== undefined && (!Number.isSafeInteger(signal.pendingCount) || signal.pendingCount < 0)) ||
      (signal.timeKind !== undefined && !['due', 'plan', 'start', 'reminder'].includes(signal.timeKind)) ||
      (signal.urgency !== undefined && !['today', 'overdue', 'upcoming'].includes(signal.urgency)) ||
      ['resourceTypes', 'kinds'].some(
        (key) =>
          signal[key] !== undefined &&
          (!Array.isArray(signal[key]) ||
            signal[key].length > 10 ||
            signal[key].some((v) => typeof v !== 'string' || v.length > 32)),
      )
    )
      throw new Error('ADVICE_SIGNALS_INVALID');
  }
  return signals;
}

// 模型只能选择事实编号与一条行动；身份、入口与数字依据仍由服务端绑定。
export function resolveAdvice(proposal, signals, body = []) {
  if (proposal == null) return null;
  if (
    !proposal ||
    typeof proposal !== 'object' ||
    Array.isArray(proposal) ||
    Object.keys(proposal).some((key) => !['factIds', 'action'].includes(key)) ||
    !Array.isArray(proposal.factIds) ||
    proposal.factIds.length < 1 ||
    proposal.factIds.length > 3 ||
    new Set(proposal.factIds).size !== proposal.factIds.length
  )
    throw new Error('ADVICE_SHAPE');
  const selected = proposal.factIds.map((id) => signals.find((signal) => signal.id === id));
  if (selected.some((signal) => !signal || signal.count <= 0)) throw new Error('ADVICE_SOURCE_UNKNOWN');
  const action = proposal.action;
  if (
    typeof action !== 'string' ||
    action.trim().length < 12 ||
    action.length > 180 ||
    /https?:\/\/|\{\{|\}\}/iu.test(action)
  )
    throw new Error('ADVICE_ACTION_LENGTH');
  const supported = new Set(
    selected
      .flatMap((signal) => [signal.count, signal.pendingCount, signal.at, signal.dueDate])
      .filter((value) => value !== undefined)
      .join(' ')
      .match(/\d+(?:[.:/-]\d+)*/gu) || [],
  );
  const numericAction = selected.reduce(
    (text, signal) =>
      !signal.title
        ? text
        : ['「」', '“”', '《》', '""'].reduce(
            (value, pair) => value.replaceAll(`${pair[0]}${signal.title}${pair[1]}`, ''),
            text,
          ),
    action,
  );
  if ((numericAction.match(/\d+(?:[.:/-]\d+)*/gu) || []).some((number) => !supported.has(number)))
    throw new Error('ADVICE_NUMBER_UNSUPPORTED');
  const normalized = normalize(action);
  if (body.some((text) => normalize(text).includes(normalized))) return null;
  return {
    action: action.trim(),
    factIds: proposal.factIds,
    sources: [
      ...new Map(
        selected.flatMap((signal) => signal.sources || []).map((source) => [`${source.type}:${source.id}`, source]),
      ).values(),
    ].slice(0, 3),
  };
}
