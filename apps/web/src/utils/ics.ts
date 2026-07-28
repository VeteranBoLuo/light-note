/**
 * 待办 → 系统日历（.ics）导出。
 *
 * 时区决策（docs/plan/todo-web-push-calendar-plan.md §6.2）：
 * `dueAt` 从服务端到前端始终是裸墙上时间字符串（"2026-07-28 09:00:00"），产品语义是
 * “同一串数字在任何时区显示一致”。因此事件时间使用 RFC 5545 浮动时间（不带 Z、不带 TZID），
 * 直接抄写字符串数字生成，+提前量/时长用纯组件进位算术，全程不经过 Date 的时区换算；
 * 只有 DTSTAMP 按 RFC 要求使用 UTC。
 */

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

/** 清理文件名：去控制字符，非法字符换空格，折叠空白并限长；空结果用兜底名。 */
export function buildIcsFileName(title: string, fallback: string): string {
  const withoutControls = Array.from(title)
    .filter((char) => char.charCodeAt(0) >= 32)
    .join('');
  const cleaned = withoutControls
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const limited = Array.from(cleaned).slice(0, 40).join('').trim();
  return `${limited || fallback}.ics`;
}

/**
 * 生成单个待办的 VEVENT 日历文件内容（CRLF 行尾）。
 * dueAt 非法时返回 null，由调用方提示，不产出错误文件。
 */
export function buildTodoIcs(todo: TodoIcsInput, options: TodoIcsOptions): string | null {
  const due = parseWallClock(todo.dueAt);
  if (!due) return null;
  const end = addMinutesToWallClock(due, 30);
  const link = `${options.origin}/inbox?tab=todo&todoId=${encodeURIComponent(todo.id)}`;
  const description = [String(todo.description ?? '').trim(), link].filter(Boolean).join('\n\n');

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

export type IcsDeliveryResult = 'shared' | 'downloaded' | 'cancelled';

/**
 * 把日历内容交给系统：移动端优先 Web Share（文件分享），失败或不支持时降级下载。
 * 用户主动取消分享返回 'cancelled'，调用方不得记成功埋点、也不强行下载打扰用户。
 */
export async function deliverIcsFile(
  content: string,
  fileName: string,
  preferShare: boolean,
): Promise<IcsDeliveryResult> {
  if (
    preferShare &&
    typeof navigator !== 'undefined' &&
    typeof File !== 'undefined' &&
    typeof navigator.share === 'function'
  ) {
    try {
      const file = new File([content], fileName, { type: 'text/calendar' });
      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: fileName });
        return 'shared';
      }
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') return 'cancelled';
      // canShare/File/share 在部分 WebView 中会抛异常；除用户取消外统一降级下载
    }
  }
  if (
    typeof document === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function' ||
    typeof URL.revokeObjectURL !== 'function'
  ) {
    throw new Error('ICS download is unavailable in the current environment');
  }
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  try {
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    return 'downloaded';
  } finally {
    anchor.remove();
    // Safari/WebView 可能在 click 返回后才读取 blob，延迟释放可避免偶发空文件
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
