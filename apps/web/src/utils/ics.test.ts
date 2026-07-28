import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addMinutesToWallClock,
  buildIcsFileName,
  buildTodoIcs,
  deliverIcsFile,
  deriveSequence,
  escapeIcsText,
  foldIcsLine,
  parseWallClock,
} from './ics';

const BASE_TODO = {
  id: 'todo-123',
  title: '提交周报',
  description: '整理本周进展',
  dueAt: '2026-07-28 09:00:00',
  updatedAt: '2026-07-28 08:00:00',
};

const BASE_OPTIONS = {
  alarmMinutesBefore: 15 as number | null,
  alarmDescription: '轻笺待办提醒',
  origin: 'https://boluo66.top',
  now: new Date(Date.UTC(2026, 6, 28, 1, 30, 0)),
};

describe('parseWallClock', () => {
  it('解析服务端裸墙上时间（含缺秒）', () => {
    expect(parseWallClock('2026-07-28 09:05:07')).toEqual({
      year: 2026,
      month: 7,
      day: 28,
      hour: 9,
      minute: 5,
      second: 7,
    });
    expect(parseWallClock('2026-07-28 09:05')?.second).toBe(0);
    expect(parseWallClock('2026-07-28T09:05:00')?.hour).toBe(9);
  });

  it('拒绝非法输入而不猜测', () => {
    expect(parseWallClock('')).toBeNull();
    expect(parseWallClock(null)).toBeNull();
    expect(parseWallClock('2026-13-01 09:00:00')).toBeNull();
    expect(parseWallClock('2026-02-30 09:00:00')).toBeNull();
    expect(parseWallClock('2026-07-28 24:00:00')).toBeNull();
    expect(parseWallClock('0000-07-28 09:00:00')).toBeNull();
    expect(parseWallClock('2026-07-28 09:00:00 trailing')).toBeNull();
    expect(parseWallClock('not-a-date')).toBeNull();
  });
});

describe('addMinutesToWallClock 纯组件进位', () => {
  const wall = (value: string) => parseWallClock(value)!;

  it('跨日：23:45 + 30 分钟 = 次日 00:15', () => {
    expect(addMinutesToWallClock(wall('2026-07-28 23:45:00'), 30)).toMatchObject({ day: 29, hour: 0, minute: 15 });
  });

  it('月末与跨年进位', () => {
    expect(addMinutesToWallClock(wall('2026-07-31 23:50:00'), 30)).toMatchObject({
      month: 8,
      day: 1,
      hour: 0,
      minute: 20,
    });
    expect(addMinutesToWallClock(wall('2026-12-31 23:50:00'), 30)).toMatchObject({ year: 2027, month: 1, day: 1 });
  });

  it('闰年 2 月：2028-02-28 23:50 + 30 分钟落在 2 月 29 日', () => {
    expect(addMinutesToWallClock(wall('2028-02-28 23:50:00'), 30)).toMatchObject({
      month: 2,
      day: 29,
      hour: 0,
      minute: 20,
    });
  });

  it('平年 2 月：2026-02-28 23:50 + 30 分钟落在 3 月 1 日', () => {
    expect(addMinutesToWallClock(wall('2026-02-28 23:50:00'), 30)).toMatchObject({ month: 3, day: 1 });
  });

  it('负方向借位（提前量语义）', () => {
    expect(addMinutesToWallClock(wall('2026-08-01 00:10:00'), -30)).toMatchObject({
      month: 7,
      day: 31,
      hour: 23,
      minute: 40,
    });
  });
});

describe('escapeIcsText', () => {
  it('按 RFC 5545 转义反斜杠、分号、逗号与换行', () => {
    expect(escapeIcsText('a\\b;c,d\ne\r\nf')).toBe('a\\\\b\\;c\\,d\\ne\\nf');
  });
});

describe('foldIcsLine', () => {
  it('短行原样返回', () => {
    expect(foldIcsLine('SUMMARY:hello')).toEqual(['SUMMARY:hello']);
  });

  it('按 UTF-8 字节折叠且不拆多字节字符，续行以单个空格开头', () => {
    const line = `SUMMARY:${'轻'.repeat(60)}`; // 8 + 180 字节
    const folded = foldIcsLine(line);
    expect(folded.length).toBeGreaterThan(1);
    const encoder = new TextEncoder();
    for (const piece of folded) {
      expect(encoder.encode(piece).length).toBeLessThanOrEqual(75);
    }
    for (const piece of folded.slice(1)) {
      expect(piece.startsWith(' ')).toBe(true);
    }
    // 展开（去掉续行首空格）后与原文一致 —— 折叠可无损还原
    expect(
      folded[0] +
        folded
          .slice(1)
          .map((piece) => piece.slice(1))
          .join(''),
    ).toBe(line);
  });
});

describe('deriveSequence', () => {
  it('随 updatedAt 单调递增，缺省为 0', () => {
    const earlier = deriveSequence('2026-07-28 08:00:00');
    const later = deriveSequence('2026-07-28 08:00:01');
    expect(later).toBe(earlier + 1);
    expect(deriveSequence(null)).toBe(0);
    expect(deriveSequence('bad')).toBe(0);
  });
});

describe('buildIcsFileName', () => {
  it('清理非法字符、折叠空白并限长', () => {
    expect(buildIcsFileName('周报: 7/28 <重要>', 'todo')).toBe('周报 7 28 重要.ics');
    expect(buildIcsFileName('   ', 'todo')).toBe('todo.ics');
    expect(buildIcsFileName('长'.repeat(80), 'todo')).toBe(`${'长'.repeat(40)}.ics`);
  });
});

describe('buildTodoIcs', () => {
  it('生成浮动时间事件：DTSTART 数字与 dueAt 逐位一致，除 DTSTAMP 外无 Z/TZID', () => {
    const content = buildTodoIcs(BASE_TODO, BASE_OPTIONS)!;
    expect(content).toContain('DTSTART:20260728T090000\r\n');
    expect(content).toContain('DTEND:20260728T093000\r\n');
    expect(content).toContain('DTSTAMP:20260728T013000Z\r\n');
    expect(content).not.toContain('TZID');
    // 除 DTSTAMP 外，任何时间行都不得带 Z 后缀
    const zLines = content.split('\r\n').filter((line) => /^\w+:[0-9T]+Z$/.test(line));
    expect(zLines).toEqual(['DTSTAMP:20260728T013000Z']);
  });

  it('结果与运行环境时区无关（内容为确定性字符串）', () => {
    const first = buildTodoIcs(BASE_TODO, BASE_OPTIONS);
    const second = buildTodoIcs({ ...BASE_TODO }, { ...BASE_OPTIONS });
    expect(first).toBe(second);
  });

  it('包含 UID/SEQUENCE/URL 深链与转义后的正文（先按 RFC 展开折行）', () => {
    const content = buildTodoIcs(
      { ...BASE_TODO, title: '会议;纪要,整理', description: '第一行\n第二行' },
      BASE_OPTIONS,
    )!;
    const unfolded = content.replace(/\r\n /g, '');
    expect(unfolded).toContain('UID:todo-123@boluo66.top');
    expect(unfolded).toContain(`SEQUENCE:${deriveSequence(BASE_TODO.updatedAt)}`);
    expect(unfolded).toContain('SUMMARY:会议\\;纪要\\,整理');
    expect(unfolded).toContain('第一行\\n第二行\\n\\nhttps://boluo66.top/inbox?tab=todo&todoId=todo-123');
    expect(unfolded).toContain('URL:https://boluo66.top/inbox?tab=todo&todoId=todo-123');
  });

  it('提前量档位：15 分钟 / 准时 / 不提醒', () => {
    expect(buildTodoIcs(BASE_TODO, BASE_OPTIONS)).toContain('TRIGGER:-PT15M');
    expect(buildTodoIcs(BASE_TODO, { ...BASE_OPTIONS, alarmMinutesBefore: 0 })).toContain('TRIGGER:-PT0M');
    const noAlarm = buildTodoIcs(BASE_TODO, { ...BASE_OPTIONS, alarmMinutesBefore: null })!;
    expect(noAlarm).not.toContain('VALARM');
  });

  it('CRLF 行尾且整体可按行还原', () => {
    const content = buildTodoIcs(BASE_TODO, BASE_OPTIONS)!;
    expect(content.endsWith('\r\n')).toBe(true);
    expect(content.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(content).toContain('END:VCALENDAR');
    expect(content).not.toMatch(/(?<!\r)\n/); // 不存在孤立 LF
  });

  it('dueAt 非法时返回 null 而不是产出错误文件', () => {
    expect(buildTodoIcs({ ...BASE_TODO, dueAt: '' }, BASE_OPTIONS)).toBeNull();
    expect(buildTodoIcs({ ...BASE_TODO, dueAt: 'invalid' }, BASE_OPTIONS)).toBeNull();
  });
});

describe('deliverIcsFile', () => {
  let originalShare: PropertyDescriptor | undefined;
  let originalCanShare: PropertyDescriptor | undefined;
  let originalCreateObjectUrl: PropertyDescriptor | undefined;
  let originalRevokeObjectUrl: PropertyDescriptor | undefined;
  const createObjectUrl = vi.fn(() => 'blob:https://boluo66.top/todo-calendar');
  const revokeObjectUrl = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    originalShare = Object.getOwnPropertyDescriptor(navigator, 'share');
    originalCanShare = Object.getOwnPropertyDescriptor(navigator, 'canShare');
    originalCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectUrl });
    createObjectUrl.mockClear();
    revokeObjectUrl.mockClear();
  });

  afterEach(() => {
    if (originalShare) Object.defineProperty(navigator, 'share', originalShare);
    else delete (navigator as Navigator & { share?: Navigator['share'] }).share;
    if (originalCanShare) Object.defineProperty(navigator, 'canShare', originalCanShare);
    else delete (navigator as Navigator & { canShare?: Navigator['canShare'] }).canShare;
    if (originalCreateObjectUrl) Object.defineProperty(URL, 'createObjectURL', originalCreateObjectUrl);
    else delete (URL as Partial<typeof URL>).createObjectURL;
    if (originalRevokeObjectUrl) Object.defineProperty(URL, 'revokeObjectURL', originalRevokeObjectUrl);
    else delete (URL as Partial<typeof URL>).revokeObjectURL;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('移动端文件分享成功时不触发下载', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: vi.fn(() => true) });

    await expect(deliverIcsFile('calendar', 'todo.ics', true)).resolves.toBe('shared');
    expect(share).toHaveBeenCalledOnce();
    expect(createObjectUrl).not.toHaveBeenCalled();
  });

  it('用户取消系统分享时不自动下载', async () => {
    const error = new DOMException('cancelled', 'AbortError');
    Object.defineProperty(navigator, 'share', { configurable: true, value: vi.fn().mockRejectedValue(error) });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: vi.fn(() => true) });

    await expect(deliverIcsFile('calendar', 'todo.ics', true)).resolves.toBe('cancelled');
    expect(createObjectUrl).not.toHaveBeenCalled();
  });

  it('canShare 异常时降级下载，并延迟释放 blob URL', async () => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: vi.fn() });
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      value: vi.fn(() => {
        throw new Error('broken webview');
      }),
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    await expect(deliverIcsFile('calendar', 'todo.ics', true)).resolves.toBe('downloaded');
    expect(click).toHaveBeenCalledOnce();
    expect(document.querySelector('a[download="todo.ics"]')).toBeNull();
    expect(revokeObjectUrl).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:https://boluo66.top/todo-calendar');
  });
});
