function parseWallClockDate(value) {
  if (value instanceof Date) return new Date(value);
  return new Date(typeof value === "string" ? value.replace(" ", "T") : value);
}

function localDateTime(value) {
  const pad = (part) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(
    value.getHours(),
  )}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

function dateOnly(value) {
  if (!value) return "";
  const raw = value instanceof Date ? "" : String(value).trim();
  const leadingDate = raw.match(/^(\d{4}-\d{2}-\d{2})/u);
  if (leadingDate) return leadingDate[1];
  const date = value instanceof Date ? value : parseWallClockDate(value);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function reminderOffsetAt(value, offsetMinutes) {
  if (!value) return "";
  const date = parseWallClockDate(value);
  if (!Number.isFinite(date.getTime())) return "";
  return localDateTime(
    new Date(date.getTime() - Number(offsetMinutes || 0) * 60_000),
  );
}

/**
 * 返回仍待投递的下一次提醒。暂停提醒不会参与待办的下一步时间。
 * 该函数只读取安全的调度字段，不读取提醒邮箱或投递 Provider 数据。
 */
export function resolveTodoNextReminderAt(item = {}) {
  const reminder = item?.reminder;
  if (reminder?.paused) return "";
  return reminder?.nextAt || reminder?.startAt || item?.reminderAt || "";
}

/**
 * 从持久化提醒规则还原当前待办实例原定的提醒时刻。
 *
 * Worker 投递完成后 nextAt 会消失；页面和 Agent 必须继续基于同一份规则投影，
 * 才能回答“今天 16:00 提醒的是哪条待办”，同时不把提醒时间冒充截止时间。
 */
export function resolveTodoConfiguredReminderAt(item = {}) {
  const reminder = item?.reminder;
  if (!reminder || reminder.paused) return "";

  if (reminder.version != null && reminder.mode === "once" && reminder.once) {
    const once = reminder.once;
    if (once.type === "fixed_at") return once.fixedAt || "";
    if (once.type === "at_start") return item.startAt || "";
    if (once.type === "at_due") return item.dueAt || "";
    if (once.type === "before_due")
      return reminderOffsetAt(item.dueAt, once.offsetMinutes);
  }

  if (
    reminder.trigger &&
    ["once_per_instance", "nudge"].includes(reminder.mode)
  ) {
    const trigger = reminder.trigger;
    if (trigger.type === "at_start") return item.startAt || "";
    if (trigger.type === "before_due")
      return reminderOffsetAt(item.dueAt, trigger.offsetMinutes);
    if (trigger.type === "fixed_time") {
      const occurrenceDate = dateOnly(item.occurrenceDate);
      const fixedTime = String(trigger.fixedTime || "").trim();
      return occurrenceDate && /^\d{2}:\d{2}(?::\d{2})?$/u.test(fixedTime)
        ? `${occurrenceDate}T${fixedTime.length === 5 ? `${fixedTime}:00` : fixedTime}`
        : "";
    }
  }

  return item.reminderAt || reminder.startAt || "";
}

/** 当前有效提醒：优先下一次实际投递时间，其次回落到规则配置时间。 */
export function resolveTodoReminderAt(item = {}) {
  return (
    resolveTodoNextReminderAt(item) || resolveTodoConfiguredReminderAt(item)
  );
}
