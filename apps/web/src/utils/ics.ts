/**
 * 待办 → 系统日历（.ics）导出。
 *
 * 时区决策（docs/plan/todo-web-push-calendar-plan.md §6.2）：
 * `dueAt` 从服务端到前端始终是裸墙上时间字符串（"2026-07-28 09:00:00"），产品语义是
 * “同一串数字在任何时区显示一致”。因此事件时间使用 RFC 5545 浮动时间（不带 Z、不带 TZID），
 * 直接抄写字符串数字生成，+提前量/时长用纯组件进位算术，全程不经过 Date 的时区换算；
 * 只有 DTSTAMP 按 RFC 要求使用 UTC。
 *
 * 文件名清洗与「分享/下载」交付链路是所有前端生成文件的共用能力，统一在 `utils/fileDelivery.ts`。
 */

import { buildExportFileName, deliverGeneratedFile, type FileDeliveryResult } from '@/utils/fileDelivery';

export interface TodoIcsInput {
  id: string;
  title: string;
  description?: string | null;
  /** 服务端裸墙上时间字符串："YYYY-MM-DD HH:mm:ss"（秒可缺省） */
  dueAt: string;
  /** 用于派生 SEQUENCE，缺省时为 0 */
  updatedAt?: string | null;
}

export interface TodoIcsOptions {
  /** null = 不生成 VALARM；0 = 准时提醒；其余为提前分钟数 */
  alarmMinutesBefore: number | null;
  /** VALARM 描述文案（已本地化），由调用方传入以保持本模块纯净可测 */
  alarmDescription: string;
  /** 深链 origin，如 window.location.origin */
  origin: string;
  /** 导出时刻，默认当前时间；测试时注入固定值 */
  now?: Date;
}

interface WallClock {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number;
  minute: number;
  second: number;
}

const ICS_LINE_MAX_OCTETS = 75;
/** SEQUENCE 基准（墙上时间当作 UTC 求差，只取单调性）：2020-01-01 00:00:00 */
const SEQUENCE_EPOCH_MS = Date.UTC(2020, 0, 1);

/** 解析服务端裸墙上时间字符串；非法输入返回 null，绝不猜测。 */
export function parseWallClock(value: string | null | undefined): WallClock | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(value).trim());
  if (!match) return null;
  const wall: WallClock = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] ?? '0'),
  };
  if (wall.year < 1) return null;
  if (wall.month < 1 || wall.month > 12) return null;
  if (wall.day < 1 || wall.day > daysInMonth(wall.year, wall.month)) return null;
  if (wall.hour > 23 || wall.minute > 59 || wall.second > 59) return null;
  return wall;
}

function daysInMonth(year: number, month: number): number {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** 纯组件进位算术加分钟（可为负），不经过 Date，与运行环境时区无关。 */
export function addMinutesToWallClock(wall: WallClock, minutes: number): WallClock {
  let totalMinutes = wall.hour * 60 + wall.minute + minutes;
  let { year, month, day } = wall;
  while (totalMinutes < 0) {
    day -= 1;
    if (day < 1) {
      month -= 1;
      if (month < 1) {
        month = 12;
        year -= 1;
      }
      day = daysInMonth(year, month);
    }
    totalMinutes += 24 * 60;
  }
  while (totalMinutes >= 24 * 60) {
    totalMinutes -= 24 * 60;
    day += 1;
    if (day > daysInMonth(year, month)) {
      day = 1;
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
  }
  return { year, month, day, hour: Math.floor(totalMinutes / 60), minute: totalMinutes % 60, second: wall.second };
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

/** 浮动时间格式：YYYYMMDDTHHMMSS（无 Z、无 TZID） */
export function formatFloating(wall: WallClock): string {
  return `${pad(wall.year, 4)}${pad(wall.month)}${pad(wall.day)}T${pad(wall.hour)}${pad(wall.minute)}${pad(wall.second)}`;
}

/** DTSTAMP 专用：RFC 5545 要求 UTC（YYYYMMDDTHHMMSSZ）。 */
export function formatUtcStamp(date: Date): string {
  return (
    `${pad(date.getUTCFullYear(), 4)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/** RFC 5545 §3.3.11 文本转义：反斜杠最先，换行归一为字面 \n。 */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

/**
 * RFC 5545 §3.1 长行折叠：每行 ≤75 字节（UTF-8 计），续行以单个空格开头。
 * 必须按字符边界折叠 —— 中文 3 字节/字符，多字节字符不可被拆开。
 */
export function foldIcsLine(line: string): string[] {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= ICS_LINE_MAX_OCTETS) return [line];
  const out: string[] = [];
  let current = '';
  let currentBytes = 0;
  for (const char of line) {
    const charBytes = encoder.encode(char).length;
    if (currentBytes + charBytes > ICS_LINE_MAX_OCTETS) {
      out.push(current);
      current = ' ';
      currentBytes = 1;
    }
    current += char;
    currentBytes += charBytes;
  }
  if (current !== ' ' || out.length === 0) out.push(current);
  return out;
}

/** SEQUENCE：从 updatedAt 墙上时间派生的单调秒数（当作 UTC 求差，仅取单调性）。 */
export function deriveSequence(updatedAt: string | null | undefined): number {
  const wall = parseWallClock(updatedAt);
  if (!wall) return 0;
  const ms = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  return Math.max(0, Math.floor((ms - SEQUENCE_EPOCH_MS) / 1000));
}

/** 事件时长。待办只有截止时间、没有时长，给 30 分钟让它在日历里占一个可见的块。 */
const EVENT_DURATION_MINUTES = 30;

function buildTodoDeepLink(todoId: string, origin: string): string {
  return `${origin}/inbox?tab=todo&todoId=${encodeURIComponent(todoId)}`;
}

/** 正文 + 深链。两条进日历的路（.ics 与「加入日历」）共用，避免同一个事件长得不一样。 */
function buildEventDescription(todo: TodoIcsInput, origin: string): string {
  return [String(todo.description ?? '').trim(), buildTodoDeepLink(todo.id, origin)]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * 待办 → 「加入日历」（原生 ACTION_INSERT）所需的绝对时间戳与文案。
 *
 * 和 .ics 有一处刻意的不同：.ics 用 RFC 5545 浮动时间（同一串数字在任何时区都照原样显示），
 * 而 intent 只收毫秒时间戳，必须落到一个确定的瞬间。这里按**设备本地时区**换算 ——
 * 也就是用户此刻在轻笺界面上看到的那个时间；之后换设备时区会偏移，这是 intent 的固有限制，
 * 要严格保持浮动语义就得走 .ics。时长与描述沿用 .ics 的口径，两条路进日历后长得一样。
 *
 * dueAt 非法时返回 null，由调用方提示，绝不猜测。
 */
export function buildTodoCalendarEvent(
  todo: TodoIcsInput,
  origin: string,
): { title: string; description: string; beginTime: number; endTime: number } | null {
  const due = parseWallClock(todo.dueAt);
  if (!due) return null;
  const end = addMinutesToWallClock(due, EVENT_DURATION_MINUTES);
  // 按组件构造本地时间，不经字符串解析：`new Date('2026-07-28 09:00')` 各浏览器口径不一
  const toLocalMs = (wall: ReturnType<typeof parseWallClock>) =>
    new Date(wall!.year, wall!.month - 1, wall!.day, wall!.hour, wall!.minute, wall!.second).getTime();
  return {
    title: String(todo.title ?? '').trim(),
    description: buildEventDescription(todo, origin),
    beginTime: toLocalMs(due),
    endTime: toLocalMs(end),
  };
}

/** 清理文件名：去控制字符，非法字符换空格，折叠空白并限长；空结果用兜底名。 */
export function buildIcsFileName(title: string, fallback: string): string {
  return buildExportFileName(title, fallback, 'ics');
}

/**
 * 生成单个待办的 VEVENT 日历文件内容（CRLF 行尾）。
 * dueAt 非法时返回 null，由调用方提示，不产出错误文件。
 */
export function buildTodoIcs(todo: TodoIcsInput, options: TodoIcsOptions): string | null {
  const due = parseWallClock(todo.dueAt);
  if (!due) return null;
  const end = addMinutesToWallClock(due, EVENT_DURATION_MINUTES);
  const description = buildEventDescription(todo, options.origin);
  const link = buildTodoDeepLink(todo.id, options.origin);

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Light Note//Todo Calendar//ZH-CN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeIcsText(todo.id)}@boluo66.top`,
    `SEQUENCE:${deriveSequence(todo.updatedAt)}`,
    `DTSTAMP:${formatUtcStamp(options.now ?? new Date())}`,
    `DTSTART:${formatFloating(due)}`,
    `DTEND:${formatFloating(end)}`,
    `SUMMARY:${escapeIcsText(todo.title)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `URL:${link}`,
  ];
  if (options.alarmMinutesBefore !== null) {
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `TRIGGER:-PT${Math.max(0, Math.round(options.alarmMinutesBefore))}M`,
      `DESCRIPTION:${escapeIcsText(options.alarmDescription)}`,
      'END:VALARM',
    );
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.flatMap(foldIcsLine).join('\r\n') + '\r\n';
}

export type IcsDeliveryResult = FileDeliveryResult;

/**
 * 把日历内容交给系统：移动端优先 Web Share（文件分享），失败或不支持时降级下载。
 * 用户主动取消分享返回 'cancelled'，调用方不得记成功埋点、也不强行下载打扰用户。
 * App 内两条路都走不通时返回 'unavailable'，调用方必须给出路而不是报成功。
 */
export async function deliverIcsFile(
  content: string,
  fileName: string,
  preferShare: boolean,
): Promise<IcsDeliveryResult> {
  return deliverGeneratedFile({ content, fileName, mimeType: 'text/calendar', preferShare });
}
