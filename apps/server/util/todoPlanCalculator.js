import crypto from 'crypto';
import { Temporal } from '@js-temporal/polyfill';

export const TODO_PLAN_MAX_FINITE_OCCURRENCES = 366;
export const TODO_PLAN_MAX_NUDGES_PER_INSTANCE = 20;
export const TODO_PLAN_MAX_REMINDER_JOBS = 5_000;
export const TODO_PLAN_MAX_ROLLING_BATCH = 200;
export const TODO_PLAN_ROLLING_DAYS = 60;
export const TODO_PLAN_ROLLING_MIN_OCCURRENCES = 8;

const PLAN_TYPES = new Set(['once', 'scheduled', 'after_completion']);
const FREQUENCIES = new Set(['daily', 'weekly', 'monthly']);
const END_MODES = new Set(['never', 'until', 'count']);
const PAST_POLICIES = new Set(['keep_overdue', 'restart_today_keep_count', 'skip_missed']);
const SHORT_MONTH_POLICIES = new Set(['last_day', 'skip']);
const REMINDER_MODES = new Set(['none', 'once_per_instance', 'nudge']);
const REMINDER_TRIGGERS = new Set(['at_start', 'fixed_time', 'before_due']);
const REMINDER_CHANNELS = new Set(['in_app', 'email']);
const QUIET_POLICIES = new Set(['defer_once', 'skip']);

function planError(code, message, data) {
  const error = new Error(message);
  error.code = code;
  error.status = 400;
  if (data !== undefined) error.data = data;
  return error;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function normalizeTimezone(value) {
  const timezone = String(value || 'Asia/Shanghai')
    .trim()
    .slice(0, 64);
  try {
    Temporal.Now.zonedDateTimeISO(timezone);
  } catch {
    throw planError('TODO_PLAN_TIMEZONE_INVALID', '任务计划时区无效');
  }
  return timezone;
}

function parsePlainDate(value, label) {
  try {
    return Temporal.PlainDate.from(String(value || '').trim());
  } catch {
    throw planError('TODO_PLAN_DATE_INVALID', `${label}格式无效`);
  }
}

function parsePlainTime(value, label, { optional = false } = {}) {
  if ((value === null || value === undefined || value === '') && optional) return null;
  try {
    const time = Temporal.PlainTime.from(String(value || '').trim());
    return new Temporal.PlainTime(time.hour, time.minute, 0);
  } catch {
    throw planError('TODO_PLAN_TIME_INVALID', `${label}格式无效`);
  }
}

function instantFrom(value) {
  if (value instanceof Temporal.Instant) return value;
  if (value instanceof Date) return Temporal.Instant.from(value.toISOString());
  if (typeof value === 'number') return Temporal.Instant.fromEpochMilliseconds(value);
  if (value) {
    try {
      return Temporal.Instant.from(String(value));
    } catch {
      const parsed = new Date(value);
      if (Number.isFinite(parsed.getTime())) return Temporal.Instant.from(parsed.toISOString());
    }
  }
  return Temporal.Now.instant();
}

function sqlLocal(zoned) {
  return `${zoned.year}-${pad(zoned.month)}-${pad(zoned.day)} ${pad(zoned.hour)}:${pad(zoned.minute)}:00`;
}

function sqlUtc(instant) {
  const utc = instant.toZonedDateTimeISO('UTC');
  return `${utc.year}-${pad(utc.month)}-${pad(utc.day)} ${pad(utc.hour)}:${pad(utc.minute)}:00`;
}

function dateString(date) {
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
}

function timeString(time) {
  if (!time) return null;
  return `${pad(time.hour)}:${pad(time.minute)}`;
}

function zonedFrom(date, time, timezone, warnings) {
  const requested = date.toPlainDateTime(time);
  const zoned = requested.toZonedDateTime(timezone, { disambiguation: 'compatible' });
  if (!zoned.toPlainDateTime().equals(requested)) {
    warnings.push({
      code: 'DST_TIME_ADJUSTED',
      occurrenceDate: dateString(date),
      requestedTime: timeString(time),
      resolvedAt: sqlLocal(zoned),
    });
  }
  return zoned;
}

function normalizeEnd(value, type) {
  const raw = value && typeof value === 'object' ? value : {};
  const defaultMode = type === 'once' ? 'count' : 'never';
  const mode = String(raw.mode || defaultMode);
  if (!END_MODES.has(mode)) throw planError('TODO_PLAN_END_INVALID', '任务计划结束方式无效');
  if (mode === 'count') {
    const count = Number(raw.count ?? (type === 'once' ? 1 : NaN));
    if (!Number.isInteger(count) || count < 1 || count > TODO_PLAN_MAX_FINITE_OCCURRENCES) {
      throw planError('TODO_PLAN_COUNT_INVALID', `任务计划次数必须是 1 到 ${TODO_PLAN_MAX_FINITE_OCCURRENCES} 的整数`);
    }
    return { mode, count };
  }
  if (mode === 'until') return { mode, untilDate: dateString(parsePlainDate(raw.untilDate, '计划结束日期')) };
  return { mode };
}

function normalizeTiming(input, timezone, { allowUndated = false } = {}) {
  const timing = input && typeof input === 'object' ? input : {};
  const startTime = parsePlainTime(timing.startTime, '开始时间', { optional: true });
  const dueTime = parsePlainTime(timing.dueTime, '截止时间', { optional: true });
  const dueDayOffset = Number(timing.dueDayOffset || 0);
  if (!Number.isInteger(dueDayOffset) || dueDayOffset < 0 || dueDayOffset > 30) {
    throw planError('TODO_PLAN_DUE_OFFSET_INVALID', '截止日期偏移必须是 0 到 30 天的整数');
  }
  const anchorValue = String(timing.anchorDate || '').trim();
  if (!anchorValue) {
    if (startTime || dueTime) throw planError('TODO_PLAN_DATE_REQUIRED', '设置任务时间时必须选择具体日期');
    if (!allowUndated) throw planError('TODO_PLAN_TIMING_REQUIRED', '重复任务必须设置首项日期和时间');
    return {
      timezone,
      anchorDate: null,
      startTime: null,
      dueTime: null,
      dueDayOffset: 0,
    };
  }
  const anchorDate = parsePlainDate(anchorValue, '首项日期');
  if (!startTime && !dueTime) throw planError('TODO_PLAN_TIMING_REQUIRED', '请至少设置开始时间或截止时间');
  if (startTime && dueTime && dueDayOffset === 0 && Temporal.PlainTime.compare(dueTime, startTime) < 0) {
    throw planError('TODO_PLAN_DUE_BEFORE_START', '截止时间早于开始时间，请明确选择次日截止');
  }
  return {
    timezone,
    anchorDate: dateString(anchorDate),
    startTime: timeString(startTime),
    dueTime: timeString(dueTime),
    dueDayOffset,
  };
}

function normalizePlan(input, timing, today) {
  const raw = input && typeof input === 'object' ? input : {};
  const type = String(raw.type || 'once');
  if (!PLAN_TYPES.has(type)) throw planError('TODO_PLAN_TYPE_INVALID', '任务计划类型无效');
  const pastPolicyValue = raw.pastPolicy ? String(raw.pastPolicy) : null;
  if (pastPolicyValue && !PAST_POLICIES.has(pastPolicyValue)) {
    throw planError('TODO_PLAN_PAST_POLICY_INVALID', '过去日期处理方式无效');
  }
  if (type === 'once') {
    return {
      type,
      end: { mode: 'count', count: 1 },
      pastPolicy: pastPolicyValue,
    };
  }
  if (type === 'after_completion') {
    const interval = Number(raw.interval || 1);
    const unit = String(raw.unit || 'day');
    if (!Number.isInteger(interval) || interval < 1 || interval > 365 || !['day', 'week', 'month'].includes(unit)) {
      throw planError('TODO_PLAN_INTERVAL_INVALID', '完成后再次安排的间隔无效');
    }
    const end = normalizeEnd(raw.end, type);
    if (end.mode === 'until') throw planError('TODO_PLAN_END_INVALID', '完成后再次安排暂不支持按日期结束');
    return { type, interval, unit, end, pastPolicy: pastPolicyValue };
  }
  const frequency = String(raw.frequency || 'daily');
  const interval = Number(raw.interval || 1);
  if (!FREQUENCIES.has(frequency) || !Number.isInteger(interval) || interval < 1 || interval > 365) {
    throw planError('TODO_PLAN_INTERVAL_INVALID', '固定日程频率或间隔无效');
  }
  const end = normalizeEnd(raw.end, type);
  const shortMonthPolicy = String(raw.shortMonthPolicy || 'last_day');
  if (!SHORT_MONTH_POLICIES.has(shortMonthPolicy)) {
    throw planError('TODO_PLAN_MONTH_POLICY_INVALID', '短月处理方式无效');
  }
  const anchor = parsePlainDate(timing.anchorDate, '首项日期');
  const monthDay = Number(raw.monthDay || anchor.day);
  if (!Number.isInteger(monthDay) || monthDay < 1 || monthDay > 31) {
    throw planError('TODO_PLAN_MONTH_DAY_INVALID', '每月日期必须是 1 到 31');
  }
  const weekdays = [...new Set((Array.isArray(raw.weekdays) ? raw.weekdays : []).map(Number))].sort((a, b) => a - b);
  if (weekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) {
    throw planError('TODO_PLAN_WEEKDAYS_INVALID', '每周日期必须是星期一到星期日');
  }
  if (end.mode === 'until' && Temporal.PlainDate.compare(parsePlainDate(end.untilDate, '计划结束日期'), anchor) < 0) {
    throw planError('TODO_PLAN_END_BEFORE_START', '计划结束日期不能早于首项日期');
  }
  return {
    type,
    frequency,
    interval,
    ...(frequency === 'weekly' ? { weekdays: weekdays.length ? weekdays : [anchor.dayOfWeek] } : {}),
    ...(frequency === 'monthly' ? { monthDay, shortMonthPolicy } : {}),
    end,
    pastPolicy: pastPolicyValue,
  };
}

function normalizeReminder(input, timing) {
  const raw = input && typeof input === 'object' ? input : {};
  const mode = String(raw.mode || 'none');
  if (!REMINDER_MODES.has(mode)) throw planError('TODO_REMINDER_MODE_INVALID', '每项提醒方式无效');
  if (mode === 'none') return { mode, channels: [], quietPolicy: 'defer_once' };
  if (!timing.anchorDate) throw planError('TODO_REMINDER_DATE_REQUIRED', '开启提醒前请设置具体日期和时间');
  const channels = [...new Set((Array.isArray(raw.channels) ? raw.channels : []).map(String))];
  if (!channels.length || channels.some((channel) => !REMINDER_CHANNELS.has(channel))) {
    throw planError('TODO_REMINDER_CHANNEL_INVALID', '请至少选择一种有效提醒渠道');
  }
  const targetEmail = channels.includes('email')
    ? String(raw.targetEmail || raw.email || '')
        .trim()
        .slice(0, 254)
    : null;
  if (channels.includes('email') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
    throw planError('TODO_REMINDER_EMAIL_INVALID', '提醒邮箱格式无效');
  }
  const triggerRaw = raw.trigger && typeof raw.trigger === 'object' ? raw.trigger : {};
  const defaultTrigger = timing.startTime ? 'at_start' : 'before_due';
  const triggerType = String(triggerRaw.type || defaultTrigger);
  if (!REMINDER_TRIGGERS.has(triggerType)) throw planError('TODO_REMINDER_TRIGGER_INVALID', '提醒时机无效');
  if (triggerType === 'at_start' && !timing.startTime) {
    throw planError('TODO_REMINDER_START_REQUIRED', '任务开始时提醒需要设置开始时间');
  }
  if (triggerType === 'before_due' && !timing.dueTime) {
    throw planError('TODO_REMINDER_DUE_REQUIRED', '截止前提醒需要设置截止时间');
  }
  const trigger = { type: triggerType };
  if (triggerType === 'fixed_time') trigger.fixedTime = timeString(parsePlainTime(triggerRaw.fixedTime, '提醒时刻'));
  if (triggerType === 'before_due') {
    const offsetMinutes = Number(triggerRaw.offsetMinutes ?? 30);
    if (!Number.isInteger(offsetMinutes) || offsetMinutes < 0 || offsetMinutes > 43200) {
      throw planError('TODO_REMINDER_OFFSET_INVALID', '截止前提醒偏移无效');
    }
    trigger.offsetMinutes = offsetMinutes;
  }
  const quietPolicy = String(raw.quietPolicy || 'defer_once');
  if (!QUIET_POLICIES.has(quietPolicy)) throw planError('TODO_REMINDER_QUIET_POLICY_INVALID', '免打扰处理方式无效');
  let nudge = null;
  if (mode === 'nudge') {
    const nudgeRaw = raw.nudge && typeof raw.nudge === 'object' ? raw.nudge : {};
    const intervalMinutes = Number(nudgeRaw.intervalMinutes || 60);
    const maxCount = Number(nudgeRaw.maxCount || TODO_PLAN_MAX_NUDGES_PER_INSTANCE);
    const stop = String(nudgeRaw.stop || 'completion_or_due');
    if (!Number.isInteger(intervalMinutes) || intervalMinutes < 5 || intervalMinutes > 43200) {
      throw planError('TODO_REMINDER_INTERVAL_INVALID', '催办间隔必须在 5 分钟到 30 天之间');
    }
    if (!Number.isInteger(maxCount) || maxCount < 1 || maxCount > TODO_PLAN_MAX_NUDGES_PER_INSTANCE) {
      throw planError('TODO_REMINDER_MAX_COUNT_INVALID', `每项最多催办 ${TODO_PLAN_MAX_NUDGES_PER_INSTANCE} 次`);
    }
    if (!['completion_or_due', 'max_count'].includes(stop)) {
      throw planError('TODO_REMINDER_STOP_INVALID', '催办停止方式无效');
    }
    nudge = { intervalMinutes, maxCount, stop };
  }
  return { mode, trigger, channels, targetEmail, quietPolicy, ...(nudge ? { nudge } : {}) };
}

function startOfIsoWeek(date) {
  return date.subtract({ days: date.dayOfWeek - 1 });
}

function matchesScheduledDate(date, anchor, plan) {
  if (Temporal.PlainDate.compare(date, anchor) < 0) return false;
  if (plan.frequency === 'daily') {
    return anchor.until(date, { largestUnit: 'days' }).days % plan.interval === 0;
  }
  if (plan.frequency === 'weekly') {
    const weekOffset = Math.floor(startOfIsoWeek(anchor).until(date, { largestUnit: 'days' }).days / 7);
    return weekOffset % plan.interval === 0 && plan.weekdays.includes(date.dayOfWeek);
  }
  const monthOffset = (date.year - anchor.year) * 12 + date.month - anchor.month;
  if (monthOffset % plan.interval !== 0) return false;
  const daysInMonth = date.daysInMonth;
  if (plan.monthDay <= daysInMonth) return date.day === plan.monthDay;
  return plan.shortMonthPolicy === 'last_day' && date.day === daysInMonth;
}

function effectiveAnchor(timing, plan, today) {
  const anchor = parsePlainDate(timing.anchorDate, '首项日期');
  if (plan.pastPolicy === 'restart_today_keep_count' && Temporal.PlainDate.compare(anchor, today) < 0) return today;
  return anchor;
}

function scheduledDates(timing, plan, today, options = {}) {
  const anchor = effectiveAnchor(timing, plan, today);
  const dates = [];
  const rolling = plan.end.mode === 'never';
  const occurrenceStart = rolling ? Number(options.occurrenceStart || 1) : 1;
  const occurrenceLimit = rolling
    ? Math.min(Number(options.occurrenceLimit || TODO_PLAN_MAX_ROLLING_BATCH), TODO_PLAN_MAX_ROLLING_BATCH)
    : Number.POSITIVE_INFINITY;
  if (!Number.isInteger(occurrenceStart) || occurrenceStart < 1) {
    throw planError('TODO_PLAN_OCCURRENCE_CURSOR_INVALID', '任务计划生成游标无效');
  }
  if (rolling && (!Number.isInteger(occurrenceLimit) || occurrenceLimit < 1)) {
    throw planError('TODO_PLAN_OCCURRENCE_LIMIT_INVALID', '任务计划单批生成上限无效');
  }
  const until = plan.end.mode === 'until' ? parsePlainDate(plan.end.untilDate, '计划结束日期') : null;
  const rollingEnd =
    Temporal.PlainDate.compare(anchor, today) > 0
      ? anchor.add({ days: TODO_PLAN_ROLLING_DAYS })
      : today.add({ days: TODO_PLAN_ROLLING_DAYS });
  let cursor = anchor;
  let guard = 0;
  let matchedCount = 0;
  let futureCount = 0;
  let firstOccurrenceNo = null;
  while (guard < 150_000) {
    guard += 1;
    if (until && Temporal.PlainDate.compare(cursor, until) > 0) break;
    if (matchesScheduledDate(cursor, anchor, plan)) {
      matchedCount += 1;
      if (Temporal.PlainDate.compare(cursor, today) >= 0) futureCount += 1;
      if (!rolling || matchedCount >= occurrenceStart) {
        if (firstOccurrenceNo === null) firstOccurrenceNo = matchedCount;
        dates.push(cursor);
      }
      if (!rolling && matchedCount > TODO_PLAN_MAX_FINITE_OCCURRENCES) {
        throw planError(
          'TODO_PLAN_TOO_MANY_OCCURRENCES',
          `有限任务计划最多包含 ${TODO_PLAN_MAX_FINITE_OCCURRENCES} 项，请缩短日期范围或改为长期运行`,
        );
      }
    }
    if (plan.end.mode === 'count' && matchedCount >= plan.end.count) break;
    if (
      rolling &&
      ((futureCount >= TODO_PLAN_ROLLING_MIN_OCCURRENCES && Temporal.PlainDate.compare(cursor, rollingEnd) >= 0) ||
        dates.length >= occurrenceLimit)
    )
      break;
    cursor = cursor.add({ days: 1 });
  }
  if (!dates.length && !(rolling && options.allowEmptyOccurrences)) {
    throw planError('TODO_PLAN_EMPTY', '当前规则不会产生任何任务实例');
  }
  if (guard >= 150_000) throw planError('TODO_PLAN_RANGE_TOO_LARGE', '任务计划范围过大');
  return { anchor, dates, firstOccurrenceNo: firstOccurrenceNo || occurrenceStart };
}

function buildOccurrence(date, timing, timezone, warnings, occurrenceNo, nowInstant, pastPolicy) {
  if (!date) {
    return {
      occurrenceNo,
      occurrenceDate: null,
      startAt: null,
      startAtUtc: null,
      dueAt: null,
      dueAtUtc: null,
      timezone,
      state: 'normal',
      missed: false,
    };
  }
  const startTime = timing.startTime ? parsePlainTime(timing.startTime, '开始时间') : null;
  const dueTime = timing.dueTime ? parsePlainTime(timing.dueTime, '截止时间') : null;
  const startZoned = startTime ? zonedFrom(date, startTime, timezone, warnings) : null;
  const dueDate = date.add({ days: timing.dueDayOffset || 0 });
  const dueZoned = dueTime ? zonedFrom(dueDate, dueTime, timezone, warnings) : null;
  const comparison = dueZoned?.toInstant() || startZoned?.toInstant();
  const missed = Boolean(comparison && Temporal.Instant.compare(comparison, nowInstant) <= 0);
  return {
    occurrenceNo,
    occurrenceDate: dateString(date),
    startAt: startZoned ? sqlLocal(startZoned) : null,
    startAtUtc: startZoned ? sqlUtc(startZoned.toInstant()) : null,
    dueAt: dueZoned ? sqlLocal(dueZoned) : null,
    dueAtUtc: dueZoned ? sqlUtc(dueZoned.toInstant()) : null,
    timezone,
    state: missed && pastPolicy === 'skip_missed' ? 'skipped' : 'normal',
    missed,
  };
}

function reminderBase(occurrence, reminder, timezone, warnings) {
  if (reminder.mode === 'none' || occurrence.state === 'skipped') return null;
  if (reminder.trigger.type === 'at_start') {
    return occurrence.startAtUtc ? Temporal.Instant.from(`${occurrence.startAtUtc.replace(' ', 'T')}Z`) : null;
  }
  if (reminder.trigger.type === 'before_due') {
    if (!occurrence.dueAtUtc) return null;
    return Temporal.Instant.from(`${occurrence.dueAtUtc.replace(' ', 'T')}Z`).subtract({
      minutes: reminder.trigger.offsetMinutes,
    });
  }
  const date = parsePlainDate(occurrence.occurrenceDate, '实例日期');
  const time = parsePlainTime(reminder.trigger.fixedTime, '提醒时刻');
  return zonedFrom(date, time, timezone, warnings).toInstant();
}

function buildReminderMoments(occurrence, reminder, timezone, warnings, nowInstant) {
  const first = reminderBase(occurrence, reminder, timezone, warnings);
  if (!first) return [];
  const due = occurrence.dueAtUtc ? Temporal.Instant.from(`${occurrence.dueAtUtc.replace(' ', 'T')}Z`) : null;
  const stopsAtDue = reminder.mode !== 'nudge' || reminder.nudge.stop === 'completion_or_due';
  const moments = [];
  const limit = reminder.mode === 'nudge' ? reminder.nudge.maxCount : 1;
  for (let sequenceNo = 1; sequenceNo <= limit; sequenceNo += 1) {
    const instant =
      sequenceNo === 1 ? first : first.add({ minutes: reminder.nudge.intervalMinutes * (sequenceNo - 1) });
    if (stopsAtDue && due && Temporal.Instant.compare(instant, due) > 0) break;
    const local = instant.toZonedDateTimeISO(timezone);
    moments.push({
      sequenceNo,
      scheduledAtUtc: sqlUtc(instant),
      scheduledAtLocal: sqlLocal(local),
      deliverable: Temporal.Instant.compare(instant, nowInstant) > 0,
      skippedReason: Temporal.Instant.compare(instant, nowInstant) <= 0 ? 'past' : null,
    });
    if (reminder.mode !== 'nudge') break;
  }
  return moments;
}

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value)
    .sort()
    .reduce((result, key) => {
      const child = value[key];
      if (child !== undefined) result[key] = stableObject(child);
      return result;
    }, {});
}

export function calculateTodoPlan(input = {}, options = {}) {
  const timezone = normalizeTimezone(input?.timing?.timezone || input?.timezone);
  const nowInstant = instantFrom(options.now || input.now);
  const today = nowInstant.toZonedDateTimeISO(timezone).toPlainDate();
  const requestedPlanType = String(input?.plan?.type || 'once');
  const timing = normalizeTiming(input.timing, timezone, { allowUndated: requestedPlanType === 'once' });
  const plan = normalizePlan(input.plan, timing, today);
  const reminder = normalizeReminder(input.reminder, timing);
  const warnings = [];
  const originalAnchor = timing.anchorDate ? parsePlainDate(timing.anchorDate, '首项日期') : null;
  const restartFromToday =
    originalAnchor &&
    plan.pastPolicy === 'restart_today_keep_count' &&
    Temporal.PlainDate.compare(originalAnchor, today) < 0;
  const normalizedTiming = restartFromToday ? { ...timing, anchorDate: dateString(today) } : timing;
  const normalizedSchedulePlan = restartFromToday
    ? { ...plan, pastPolicy: 'keep_overdue', pastResolution: 'restart_today_keep_count' }
    : plan;
  if (restartFromToday) {
    warnings.push({
      code: 'PAST_SCHEDULE_RESTARTED',
      originalAnchorDate: timing.anchorDate,
      resolvedAnchorDate: normalizedTiming.anchorDate,
    });
  }
  let occurrenceEntries;
  if (normalizedSchedulePlan.type === 'scheduled') {
    const generated = scheduledDates(normalizedTiming, normalizedSchedulePlan, today, options);
    occurrenceEntries = generated.dates.map((date, index) => ({
      date,
      occurrenceNo: generated.firstOccurrenceNo + index,
    }));
  } else if (!normalizedTiming.anchorDate) {
    occurrenceEntries = [{ date: null, occurrenceNo: 1 }];
  } else {
    occurrenceEntries = [{ date: effectiveAnchor(normalizedTiming, normalizedSchedulePlan, today), occurrenceNo: 1 }];
  }
  const effectivePastPolicy = normalizedSchedulePlan.pastPolicy || 'keep_overdue';
  const occurrences = occurrenceEntries.map(({ date, occurrenceNo }) =>
    buildOccurrence(date, normalizedTiming, timezone, warnings, occurrenceNo, nowInstant, effectivePastPolicy),
  );
  const hasPastOccurrence = occurrences.some((occurrence) => occurrence.missed);
  if (hasPastOccurrence) {
    warnings.push({
      code: 'PAST_OCCURRENCE',
      count: occurrences.filter((occurrence) => occurrence.missed).length,
      policy: normalizedSchedulePlan.pastPolicy,
    });
  }
  const requiredChoices = hasPastOccurrence && !normalizedSchedulePlan.pastPolicy ? ['pastPolicy'] : [];
  const knownOccurrenceCount =
    normalizedSchedulePlan.type === 'after_completion' && normalizedSchedulePlan.end.mode === 'count'
      ? normalizedSchedulePlan.end.count
      : normalizedSchedulePlan.type === 'scheduled' && normalizedSchedulePlan.end.mode !== 'never'
        ? occurrences.length
        : normalizedSchedulePlan.type === 'once'
          ? 1
          : null;
  const remindersPerOccurrence =
    reminder.mode === 'none' ? 0 : reminder.mode === 'nudge' ? reminder.nudge.maxCount : 1;
  const theoreticalReminderJobCount =
    (knownOccurrenceCount ?? occurrences.length) * remindersPerOccurrence * reminder.channels.length;
  if (theoreticalReminderJobCount > TODO_PLAN_MAX_REMINDER_JOBS && options.enforceReminderJobLimit !== false) {
    throw planError(
      'TODO_REMINDER_JOB_LIMIT_EXCEEDED',
      `当前计划最多可能产生 ${theoreticalReminderJobCount} 个提醒任务，超过 ${TODO_PLAN_MAX_REMINDER_JOBS} 个上限；请减少次数、催办次数或提醒渠道`,
      { theoreticalReminderJobCount, maxReminderJobs: TODO_PLAN_MAX_REMINDER_JOBS },
    );
  }
  const reminderMoments = occurrences.map((occurrence) => ({
    occurrenceNo: occurrence.occurrenceNo,
    moments: buildReminderMoments(occurrence, reminder, timezone, warnings, nowInstant),
  }));
  const momentCount = reminderMoments.reduce((sum, entry) => sum + entry.moments.length, 0);
  const deliverableMoments = reminderMoments.flatMap((entry) =>
    entry.moments
      .filter((moment) => moment.deliverable)
      .map((moment) => ({ ...moment, occurrenceNo: entry.occurrenceNo })),
  );
  deliverableMoments.sort((a, b) => a.scheduledAtUtc.localeCompare(b.scheduledAtUtc));
  const normalizedPlan = {
    title: String(input.title || '')
      .trim()
      .slice(0, 200),
    description: String(input.description || '')
      .trim()
      .slice(0, 2000),
    priority: Number(input.priority ?? 1),
    timing: normalizedTiming,
    plan: normalizedSchedulePlan,
    reminder,
  };
  const previewHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(stableObject(normalizedPlan)))
    .digest('hex');
  return {
    normalizedPlan,
    previewHash,
    occurrenceCount: knownOccurrenceCount,
    generatedNowCount: occurrences.length,
    actionableCount: occurrences.filter((occurrence) => occurrence.state !== 'skipped').length,
    skippedCount: occurrences.filter((occurrence) => occurrence.state === 'skipped').length,
    firstOccurrence: occurrences[0] || null,
    lastOccurrence: normalizedSchedulePlan.type === 'after_completion' ? null : occurrences.at(-1) || null,
    occurrences,
    reminderMoments,
    reminderMomentCount: momentCount,
    reminderJobCount: momentCount * reminder.channels.length,
    theoreticalReminderJobCount,
    nextReminderAt: deliverableMoments[0]?.scheduledAtLocal || null,
    warnings: warnings.filter(
      (warning, index, all) =>
        all.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(warning)) === index,
    ),
    requiredChoices,
    summary: {
      planType: normalizedSchedulePlan.type,
      frequency: normalizedSchedulePlan.frequency || null,
      interval: normalizedSchedulePlan.interval || null,
      firstDate: occurrences[0]?.occurrenceDate || null,
      lastDate: normalizedSchedulePlan.type === 'after_completion' ? null : occurrences.at(-1)?.occurrenceDate || null,
      occurrenceCount: knownOccurrenceCount,
      startTime: normalizedTiming.startTime,
      dueTime: normalizedTiming.dueTime,
      dueDayOffset: normalizedTiming.dueDayOffset,
      reminderMode: reminder.mode,
      reminderTrigger: reminder.trigger || null,
      reminderChannels: reminder.channels,
      timezone,
    },
  };
}

export function assertTodoPlanReady(preview) {
  if (preview?.requiredChoices?.length) {
    throw planError('TODO_PLAN_CHOICE_REQUIRED', '任务计划仍有需要确认的选项', {
      requiredChoices: preview.requiredChoices,
      warnings: preview.warnings,
    });
  }
  return preview;
}
