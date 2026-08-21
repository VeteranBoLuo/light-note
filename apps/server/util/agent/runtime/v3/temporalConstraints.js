import { isAllTimeExpression, parseTimeRange } from '../../timeRange.js';

export const TEMPORAL_CONSTRAINT_KINDS_V3 = Object.freeze(['range', 'date', 'datetime']);

const VALID_KINDS = new Set(TEMPORAL_CONSTRAINT_KINDS_V3);
const MAX_EXPRESSION_LENGTH = 80;
const MAX_CONSTRAINTS = 12;

const TEMPORAL_PATTERNS = Object.freeze([
  /\b\d{4}[-/]\d{1,2}[-/]\d{1,2}[ T]\d{1,2}(?::\d{1,2})?\b/gu,
  /\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*[日号](?:\s*(?:凌晨|早上|上午|中午|下午|傍晚|晚上)?\s*\d{1,2}(?:\s*[点时：:]\s*\d{1,2}\s*分?|\s*[点时]))?/gu,
  /(?:今天|今日|明天|后天|昨天|昨日|前天)(?:\s*(?:凌晨|早上|上午|中午|下午|傍晚|晚上)?\s*\d{1,2}(?:\s*[点时：:]\s*\d{1,2}\s*分?|\s*[点时]))/gu,
  /(?:最近|近)\s*\d+\s*个?\s*(?:小时|天|周|月)/gu,
  /(?:今天|今日|明天|后天|昨天|昨日|前天|本周|这周|上周|下周|本月|这个月|上个月|上月|下个月|今年|本年|去年|明年)/gu,
  /\d{4}\s*年(?:\s*\d{1,2}\s*月(?:\s*\d{1,2}\s*[日号])?)?/gu,
  /\d{1,2}\s*月(?:份|\s*\d{1,2}\s*[日号])?/gu,
  /\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/gu,
  /(?:截至目前|截至现在|所有时间|全部时间|全量历史|历史全部|累计至今|累计|(?:当前|目前)(?=.{0,12}(?:总量|存量|数量|总数|排行)))/gu,
]);

function pad(value) {
  return String(value).padStart(2, '0');
}

function normalizeSpaces(value) {
  return String(value || '')
    .trim()
    .replace(/[：]/gu, ':')
    .replace(/\s+/gu, '');
}

export function normalizeTemporalExpressionV3(value) {
  let expression = normalizeSpaces(value);
  if (!expression || expression.length > MAX_EXPRESSION_LENGTH) return '';
  expression = expression.replace(/\//gu, '-');
  const aliases = new Map([
    ['今日', '今天'],
    ['昨日', '昨天'],
    ['这周', '本周'],
    ['这个月', '本月'],
    ['上月', '上个月'],
    ['本年', '今年'],
    ['截至现在', '截至目前'],
    ['全部时间', '全部'],
    ['所有时间', '全部'],
    ['全量', '全部'],
    ['历史全部', '全部'],
  ]);
  return aliases.get(expression) || expression;
}

function expressionPrecision(expression) {
  if (isAllTimeExpression(expression)) return 'all';
  if (/\d{1,2}(?:点|时|:\d{1,2})/u.test(expression) && !/(?:最近|近)\d+个?小时/u.test(expression)) {
    return 'datetime';
  }
  if (
    /^(?:今天|明天|后天|昨天|前天)$/u.test(expression) ||
    /^\d{4}-\d{1,2}-\d{1,2}$/u.test(expression) ||
    /^(?:\d{4}年)?\d{1,2}月\d{1,2}[日号]$/u.test(expression)
  ) {
    return 'date';
  }
  return 'range';
}

/**
 * 从最新一条用户消息提取时间字面量。只负责通用时间语法，不判断业务工具或能力。
 * 重叠时保留最长片段，因此“今天 16 点”不会再额外产出一个“今天”。
 */
export function extractTemporalMentionsV3(message) {
  const input = String(message || '').slice(0, 4_000);
  const matches = [];
  for (const pattern of TEMPORAL_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of input.matchAll(pattern)) {
      const raw = String(match[0] || '').trim();
      const expression = normalizeTemporalExpressionV3(raw);
      if (!expression) continue;
      matches.push({ raw, expression, start: match.index || 0, end: (match.index || 0) + raw.length });
    }
  }
  matches.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const selected = [];
  for (const candidate of matches) {
    if (selected.some((item) => candidate.start < item.end && candidate.end > item.start)) continue;
    selected.push(candidate);
  }
  selected.sort((a, b) => a.start - b.start);
  return Object.freeze(
    selected.slice(0, MAX_CONSTRAINTS).map((item) =>
      Object.freeze({
        expression: item.expression,
        precision: expressionPrecision(item.expression),
        sourceText: item.raw,
      }),
    ),
  );
}

function parseCurrentDate(temporalContext = {}) {
  const match = String(temporalContext.currentDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/u);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function shiftDate(parts, days) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  date.setUTCDate(date.getUTCDate() + days);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function calendarDate(parts) {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function parseCalendarDate(expression, temporalContext) {
  const current = parseCurrentDate(temporalContext);
  if (!current) return null;
  const relativeDays = new Map([
    ['前天', -2],
    ['昨天', -1],
    ['今天', 0],
    ['明天', 1],
    ['后天', 2],
  ]);
  for (const [prefix, offset] of relativeDays) {
    if (expression.startsWith(prefix)) return shiftDate(current, offset);
  }
  let match = expression.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/u);
  if (match) return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  match = expression.match(/^(?:(\d{4})年)?(\d{1,2})月(\d{1,2})[日号]/u);
  if (match) {
    return { year: Number(match[1] || current.year), month: Number(match[2]), day: Number(match[3]) };
  }
  return null;
}

function parseClock(expression) {
  const match = expression.match(/(凌晨|早上|上午|中午|下午|傍晚|晚上)?(\d{1,2})(?:(?:点|时|:)(\d{1,2})?分?|:(\d{1,2}))/u);
  if (!match) return null;
  const period = String(match[1] || '');
  let hour = Number(match[2]);
  const minute = Number(match[3] || match[4] || 0);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  if (['下午', '傍晚', '晚上'].includes(period) && hour < 12) hour += 12;
  if (period === '中午' && hour < 11) hour += 12;
  if (period === '凌晨' && hour === 12) hour = 0;
  if (hour < 0 || hour > 23) return null;
  return { hour, minute };
}

function rangeNow(temporalContext) {
  const value = String(temporalContext?.currentDateTime || '').trim();
  const date = new Date(value.replace(' ', 'T'));
  return Number.isFinite(date.getTime()) ? date : new Date();
}

function supportsPrecision(kind, precision) {
  if (kind === 'range') return ['range', 'date', 'all'].includes(precision);
  if (kind === 'date') return ['date', 'datetime'].includes(precision);
  return kind === 'datetime' && precision === 'datetime';
}

export function resolveTemporalExpressionV3(expressionInput, slot = {}, temporalContext = {}) {
  const expression = normalizeTemporalExpressionV3(expressionInput);
  const kind = String(slot.kind || 'range');
  if (!expression || !VALID_KINDS.has(kind)) return null;
  const precision = expressionPrecision(expression);
  if (!supportsPrecision(kind, precision)) return null;
  if (precision === 'all') {
    if (slot.allowAll !== true) return null;
    return Object.freeze({ expression, precision, argumentValue: '全部', resolved: null });
  }
  if (kind === 'range') {
    const resolved = parseTimeRange(expression, { now: rangeNow(temporalContext) });
    if (!resolved) return null;
    return Object.freeze({ expression, precision, argumentValue: expression, resolved: Object.freeze(resolved) });
  }
  const date = parseCalendarDate(expression, temporalContext);
  if (!date) return null;
  if (kind === 'date') {
    return Object.freeze({ expression, precision, argumentValue: calendarDate(date), resolved: null });
  }
  const clock = parseClock(expression);
  if (!clock) return null;
  return Object.freeze({
    expression,
    precision,
    argumentValue: `${calendarDate(date)} ${pad(clock.hour)}:${pad(clock.minute)}`,
    resolved: null,
  });
}

function normalizeRawConstraint(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const goalId = String(value.goalId || '').trim().slice(0, 64);
  const slot = String(value.slot || '').trim().slice(0, 64);
  const expression = normalizeTemporalExpressionV3(value.expression);
  return goalId && slot && expression ? { goalId, slot, expression } : null;
}

function capabilityForGoal(goal, catalogById) {
  return catalogById.get(String(goal?.capabilityId || '')) || null;
}

function slotByName(capability, name) {
  return (Array.isArray(capability?.temporalSlots) ? capability.temporalSlots : []).find((slot) => slot.name === name) || null;
}

function constraintKey(goalId, slot) {
  return `${goalId}:${slot}`;
}

function constraintRecord({ goalId, slot, resolved, implicit = false }) {
  return Object.freeze({
    goalId,
    slot: slot.name,
    kind: slot.kind,
    expression: resolved.expression,
    precision: resolved.precision,
    argumentValue: resolved.argumentValue,
    resolved: resolved.resolved,
    implicit,
  });
}

/**
 * 把模型只负责“表达式属于哪个目标/槽位”的输出，收敛为服务端权威参数。
 * - 表达式必须真实出现在最新消息；历史时间值无法混入。
 * - 单一时间表达式按 manifest.autoBind 确定性绑定，常见请求不依赖模型复制。
 * - 多时间表达式必须由 Compiler 显式分配，分配不全则整份 TurnSpec 失败关闭并修复。
 */
export function compileTemporalConstraintsV3(
  rawConstraints,
  { goals = [], catalog = [], latestMessage = '', temporalContext = {} } = {},
) {
  if (!Array.isArray(rawConstraints) || rawConstraints.length > MAX_CONSTRAINTS) return null;
  const mentions = extractTemporalMentionsV3(latestMessage);
  const mentionExpressions = new Set(mentions.map((mention) => mention.expression));
  const goalsById = new Map((Array.isArray(goals) ? goals : []).map((goal) => [goal.id, goal]));
  const catalogById = new Map((Array.isArray(catalog) ? catalog : []).map((entry) => [entry.id, entry]));
  const output = new Map();

  for (const raw of rawConstraints) {
    const normalized = normalizeRawConstraint(raw);
    const goal = normalized ? goalsById.get(normalized.goalId) : null;
    const capability = goal ? capabilityForGoal(goal, catalogById) : null;
    const slot = normalized ? slotByName(capability, normalized.slot) : null;
    if (!normalized || !goal || !slot || !mentionExpressions.has(normalized.expression)) return null;
    const resolved = resolveTemporalExpressionV3(normalized.expression, slot, temporalContext);
    if (!resolved) return null;
    const key = constraintKey(goal.id, slot.name);
    const existing = output.get(key);
    if (existing && existing.expression !== resolved.expression) return null;
    output.set(key, constraintRecord({ goalId: goal.id, slot, resolved }));
  }

  if (mentions.length === 1) {
    const [mention] = mentions;
    for (const goal of goalsById.values()) {
      const capability = capabilityForGoal(goal, catalogById);
      const slots = (capability?.temporalSlots || []).filter(
        (slot) => slot.autoBind === true && supportsPrecision(slot.kind, mention.precision),
      );
      for (const slot of slots) {
        const key = constraintKey(goal.id, slot.name);
        if (output.has(key)) continue;
        const resolved = resolveTemporalExpressionV3(mention.expression, slot, temporalContext);
        if (resolved) output.set(key, constraintRecord({ goalId: goal.id, slot, resolved, implicit: true }));
      }
    }
  }

  for (const constraint of [...output.values()]) {
    const goal = goalsById.get(constraint.goalId);
    const capability = capabilityForGoal(goal, catalogById);
    const sourceSlot = slotByName(capability, constraint.slot);
    for (const targetName of sourceSlot?.coBind || []) {
      const targetSlot = slotByName(capability, targetName);
      const key = constraintKey(goal.id, targetName);
      if (!targetSlot || output.has(key)) continue;
      const resolved = resolveTemporalExpressionV3(constraint.expression, targetSlot, temporalContext);
      if (resolved) output.set(key, constraintRecord({ goalId: goal.id, slot: targetSlot, resolved, implicit: true }));
    }
  }

  // 必填时间槽只能按 Manifest 的显式策略补值。只有 defaultPolicy=all 才能注入
  // “全部”；clarify 留给 TurnSpec 归一化层生成确定性缺失槽，禁止 Planner 猜默认值。
  for (const goal of goalsById.values()) {
    const capability = capabilityForGoal(goal, catalogById);
    for (const slot of capability?.temporalSlots || []) {
      const key = constraintKey(goal.id, slot.name);
      if (slot.required !== true || output.has(key) || slot.defaultPolicy !== 'all') continue;
      const resolved = resolveTemporalExpressionV3('全部', slot, temporalContext);
      if (!resolved) return null;
      output.set(key, constraintRecord({ goalId: goal.id, slot, resolved, implicit: true }));
    }
  }

  if (mentions.length > 1) {
    const usedExpressions = new Set([...output.values()].map((item) => item.expression));
    const hasTemporalGoal = [...goalsById.values()].some(
      (goal) => (capabilityForGoal(goal, catalogById)?.temporalSlots || []).length > 0,
    );
    if (hasTemporalGoal && mentions.some((mention) => !usedExpressions.has(mention.expression))) return null;
  }

  return Object.freeze([...output.values()].slice(0, MAX_CONSTRAINTS));
}

export function collectMissingTemporalSlotsV3({ goals = [], catalog = [], constraints = [] } = {}) {
  const catalogById = new Map((Array.isArray(catalog) ? catalog : []).map((entry) => [entry.id, entry]));
  const bound = new Set(
    (Array.isArray(constraints) ? constraints : []).map((constraint) =>
      constraintKey(String(constraint?.goalId || ''), String(constraint?.slot || '')),
    ),
  );
  const missing = [];
  for (const goal of Array.isArray(goals) ? goals : []) {
    const capability = capabilityForGoal(goal, catalogById);
    for (const slot of capability?.temporalSlots || []) {
      if (
        slot.required !== true ||
        slot.defaultPolicy !== 'clarify' ||
        bound.has(constraintKey(goal.id, slot.name))
      ) {
        continue;
      }
      const label = String(slot.label || slot.name || '时间范围');
      missing.push(
        Object.freeze({
          name: `${goal.id}.${slot.name}`.slice(0, 80),
          reason: 'manifest_temporal_scope_required',
          question: `请补充${label}。`.slice(0, 240),
          label,
        }),
      );
    }
  }
  return Object.freeze(missing.slice(0, 8));
}

export function authoritativeTemporalArgumentsForGoal(turnSpec, goalId) {
  const args = {};
  for (const constraint of Array.isArray(turnSpec?.temporalConstraints) ? turnSpec.temporalConstraints : []) {
    if (constraint.goalId !== goalId || !constraint.slot) continue;
    args[constraint.slot] = constraint.argumentValue;
  }
  return Object.freeze(args);
}

export function bindAuthoritativeTemporalArguments({ turnSpec, goalId, args } = {}) {
  return { ...(args || {}), ...authoritativeTemporalArgumentsForGoal(turnSpec, goalId) };
}

export const __testing = Object.freeze({ expressionPrecision, parseCalendarDate, parseClock, supportsPrecision });
