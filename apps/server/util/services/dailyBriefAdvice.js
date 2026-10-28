import { createHash } from 'node:crypto';

export const ADVICE_POLICY_VERSION = 9;
export const MIN_SAFE_ADVICE_POLICY_VERSION = 9;
export const DAILY_BRIEF_OUTPUT_ERROR_CODES = Object.freeze(
  Object.fromEntries(
    [
      'INSIGHTS_SHAPE',
      'ADVICE_DECISION_MISSING',
      'ADVICE_SHAPE',
      'ADVICE_SOURCE_UNKNOWN',
      'ADVICE_ACTION_LENGTH',
      'ADVICE_NUMBER_UNSUPPORTED',
    ].map((reason) => [reason, `AI_SKILL_DAILY_BRIEF_OUTPUT_${reason}`]),
  ),
);
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
const numberTokens = (value) =>
  (
    String(value ?? '')
      .normalize('NFKC')
      .match(/\d+(?:[.,:/-]\d+)*/gu) || []
  ).map((token) => (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/u.test(token) ? token.replaceAll(',', '') : token));
const signalNumbers = (signal) => [
  ...new Set([signal.count, signal.pendingCount, signal.at, signal.dueDate].flatMap(numberTokens)),
];
export const adviceNumbersByFact = (signals) =>
  Object.fromEntries(signals.map((signal) => [signal.id, signalNumbers(signal)]));

function withoutSourceTitles(action, signals) {
  return signals.reduce((text, signal) => {
    const title = String(signal.title || '').normalize('NFKC');
    if (!/\d/u.test(title)) return text;
    const quoted = ['「」', '“”', '《》', '""', "''", '‘’'].reduce(
      (value, pair) => value.replaceAll(`${pair[0]}${title}${pair[1]}`, ' '),
      text,
    );
    // Unquoted labels must contain words, not just a quantity or duration.
    if (
      !/\p{L}/u.test(title) ||
      /^\d[\d\s.,:/-]*(?:分钟|小时|年|月|日|周|天|时|点|个|项|页|分|秒|minutes?|hours?|days?|items?|pages?)$/iu.test(
        title,
      )
    )
      return quoted;
    return quoted.replaceAll(title, (match, offset, value) => {
      const before = value.slice(0, offset);
      const after = value.slice(offset + match.length);
      if (
        (/[a-z\d_]$/iu.test(before) && /^[a-z\d_]/iu.test(match)) ||
        (/[a-z\d_]$/iu.test(match) && /^[a-z\d_]/iu.test(after)) ||
        (/\d$/u.test(match) && /^[.,:/-]\d/u.test(after))
      )
        return match;
      return ' ';
    });
  }, action.normalize('NFKC'));
}

function withoutSourceDatesAndTimes(action, signals) {
  const dates = new Set();
  const days = new Set();
  const times = new Set();
  for (const signal of signals) {
    for (const value of [signal.at, signal.dueDate]) {
      const date = /^(\d{4})-(\d{2})-(\d{2})/u.exec(String(value || ''));
      if (date) {
        dates.add(`${Number(date[1])}-${Number(date[2])}-${Number(date[3])}`);
        days.add(`${Number(date[2])}-${Number(date[3])}`);
      }
    }
    const time = /[T ](\d{2}):(\d{2})/u.exec(signal.at || '');
    if (time) times.add(`${Number(time[1])}:${Number(time[2])}`);
  }
  const check = (allowed, key) => {
    if (!allowed.has(key)) throw new Error('ADVICE_NUMBER_UNSUPPORTED');
    return ' ';
  };
  return action
    .replace(/(?<![\d/-])(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?![\d/-])/gu, (_match, year, month, day) =>
      check(dates, `${Number(year)}-${Number(month)}-${Number(day)}`),
    )
    .replace(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日?/gu, (_match, year, month, day) =>
      check(year ? dates : days, `${year ? `${Number(year)}-` : ''}${Number(month)}-${Number(day)}`),
    )
    .replace(/(?<![\d/-])(\d{2})[-/](\d{2})(?![\d/-])/gu, (_match, month, day) =>
      check(days, `${Number(month)}-${Number(day)}`),
    )
    .replace(
      /(?<![\d:])(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(?:([ap])\.?m\.?)?(?![\d:])/giu,
      (_match, hour, minute, second, period) => {
        const value = Number(hour);
        if ((second && Number(second) !== 0) || (period && (value < 1 || value > 12)))
          throw new Error('ADVICE_NUMBER_UNSUPPORTED');
        return check(
          times,
          `${period ? (value % 12) + (period.toLowerCase() === 'p' ? 12 : 0) : value}:${Number(minute)}`,
        );
      },
    )
    .replace(/(?<!\d)(\d{1,2})(?:点|时)(?:(\d{1,2})分?|半|整)?(?![\d半刻分秒])/gu, (match, hour, minute) =>
      check(times, `${Number(hour)}:${minute === undefined ? (match.includes('半') ? 30 : 0) : Number(minute)}`),
    );
}

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
  const supported = new Set(selected.flatMap((signal) => [signal.count, signal.pendingCount].flatMap(numberTokens)));
  const numericAction = withoutSourceDatesAndTimes(withoutSourceTitles(action, selected), selected);
  if (numberTokens(numericAction).some((number) => !supported.has(number)))
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
