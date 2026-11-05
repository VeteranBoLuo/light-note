import { describe, expect, it } from 'vitest';
import { isAllTimeExpression, parseTimeRange } from './timeRange.js';

describe('parseTimeRange', () => {
  const now = new Date('2026-08-19T16:06:30Z');

  it('在跨零点场景中把今天解析为当前自然日，并可核验地展示日期', () => {
    const range = parseTimeRange('今天', { now });

    expect(range).toMatchObject({
      start: '2026-08-20 00:00:00',
      end: '2026-08-20 00:06:30',
      endExclusive: '2026-08-20 00:06:31',
      timeZone: 'Asia/Shanghai',
      storageTimeZone: 'Asia/Shanghai',
    });
  });

  it('最近24小时使用精确滚动窗口，不退化成自然日或最近7天', () => {
    const range = parseTimeRange('最近24小时', { now });

    expect(range).toMatchObject({
      start: '2026-08-19 00:06:30',
      end: '2026-08-20 00:06:30',
      endExclusive: '2026-08-20 00:06:31',
    });
  });

  it('最近 7 天包含今天且恰好覆盖 7 个自然日', () => {
    expect(parseTimeRange('最近7天', { now })).toMatchObject({
      start: '2026-08-14 00:00:00',
      end: '2026-08-20 00:06:30',
      endExclusive: '2026-08-20 00:06:31',
    });
  });

  it('支持未来相对日期和绝对自然日，供权威时间绑定复用', () => {
    expect(parseTimeRange('明天', { now })).toMatchObject({
      start: '2026-08-21 00:00:00',
      end: '2026-08-21 23:59:59',
      endExclusive: '2026-08-22 00:00:00',
    });
    expect(parseTimeRange('2026-08-03', { now })).toMatchObject({
      start: '2026-08-03 00:00:00',
      end: '2026-08-03 23:59:59',
      endExclusive: '2026-08-04 00:00:00',
    });
  });

  it('按 IANA 时区跨 DST 生成半开区间，不依赖 Node 进程时区', () => {
    expect(
      parseTimeRange('2026-03-08', {
        now: new Date('2026-03-08T16:00:00Z'),
        timeZone: 'America/New_York',
        storageTimeZone: 'UTC',
      }),
    ).toMatchObject({
      start: '2026-03-08 05:00:00',
      endExclusive: '2026-03-09 04:00:00',
      localStart: '2026-03-08 00:00:00',
      localEndExclusive: '2026-03-09 00:00:00',
      timeZone: 'America/New_York',
      storageTimeZone: 'UTC',
    });
  });
});

// 平台级统计与平台级清单共用这里的口径。口径一旦漂移，同一个问题的「共 N 条」
// 和逐条明细会互相矛盾，所以两个工具的入口在这里集中约束。

describe('isAllTimeExpression', () => {
  it('覆盖中英文的全量说法且忽略大小写与空白', () => {
    for (const value of ['全部', '所有', '累计', '截至目前', 'all', 'ALL', ' Overall ']) {
      expect(isAllTimeExpression(value)).toBe(true);
    }
  });

  it('具体时间点不算全量', () => {
    for (const value of ['今天', '昨天', '最近7天', '', null, undefined]) {
      expect(isAllTimeExpression(value)).toBe(false);
    }
  });
});
