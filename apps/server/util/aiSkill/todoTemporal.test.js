import { describe, expect, it } from 'vitest';
import { resolveTodoTemporalIntent, todoTemporalInternals } from './todoTemporal.js';

const NOW = new Date('2026-08-23T04:30:00.000Z');

describe('todo temporal intent', () => {
  it('只根据用户原话摘录片段并由服务端按时区解析相对时间', () => {
    expect(
      resolveTodoTemporalIntent(
        {
          instruction: '明天下午 4 点交材料',
          temporal: { dateExpression: '明天', timeExpression: '下午 4 点' },
        },
        { now: NOW, timeZone: 'Asia/Shanghai' },
      ),
    ).toEqual({ dueAt: '2026-08-24 16:00:00', overdue: false });
  });

  it('同一瞬间在不同时区得到各自本地日期', () => {
    expect(
      resolveTodoTemporalIntent(
        { instruction: '今天 9:00 提交', temporal: { dateExpression: '今天', timeExpression: '9:00' } },
        { now: new Date('2026-08-23T23:30:00.000Z'), timeZone: 'Asia/Shanghai' },
      ).dueAt,
    ).toBe('2026-08-24 09:00:00');
  });

  it('日期未表达具体时刻时统一落在用户本地日末', () => {
    expect(
      resolveTodoTemporalIntent(
        { instruction: '三天后交材料', temporal: { dateExpression: '三天后', timeExpression: '' } },
        { now: NOW, timeZone: 'Asia/Shanghai' },
      ).dueAt,
    ).toBe('2026-08-26 23:59:00');
  });

  it('只有时间时使用用户时区的当天且如实标记逾期', () => {
    expect(
      resolveTodoTemporalIntent(
        { instruction: '上午 9 点提醒我', temporal: { dateExpression: '', timeExpression: '上午 9 点' } },
        { now: NOW, timeZone: 'Asia/Shanghai' },
      ),
    ).toEqual({ dueAt: '2026-08-23 09:00:00', overdue: true });
  });

  it('支持绝对日期、周表达式与英文表达式的通用语法', () => {
    expect(todoTemporalInternals.parseChineseInteger('一百二十三')).toBe(123);
    expect(
      resolveTodoTemporalIntent(
        { instruction: '下周三 18:30 复盘', temporal: { dateExpression: '下周三', timeExpression: '18:30' } },
        { now: NOW, timeZone: 'Asia/Shanghai' },
      ).dueAt,
    ).toBe('2026-08-26 18:30:00');
    expect(
      resolveTodoTemporalIntent(
        {
          instruction: 'submit next monday at 4 pm',
          temporal: { dateExpression: 'next monday', timeExpression: '4 pm' },
        },
        { now: NOW, timeZone: 'Asia/Shanghai' },
      ).dueAt,
    ).toBe('2026-08-24 16:00:00');
    expect(
      resolveTodoTemporalIntent(
        {
          instruction: 'submit last monday at 4 pm',
          temporal: { dateExpression: 'last monday', timeExpression: '4 pm' },
        },
        { now: NOW, timeZone: 'Asia/Shanghai' },
      ).dueAt,
    ).toBe('2026-08-17 16:00:00');
  });

  it('统一处理上午十二点、晚上十二点跨日和 DST 缺失时刻', () => {
    expect(
      resolveTodoTemporalIntent(
        { instruction: '明天上午12点开始', temporal: { dateExpression: '明天', timeExpression: '上午12点' } },
        { now: NOW, timeZone: 'Asia/Shanghai' },
      ).dueAt,
    ).toBe('2026-08-24 00:00:00');
    expect(
      resolveTodoTemporalIntent(
        { instruction: '明天晚上12点结束', temporal: { dateExpression: '明天', timeExpression: '晚上12点' } },
        { now: NOW, timeZone: 'Asia/Shanghai' },
      ).dueAt,
    ).toBe('2026-08-25 00:00:00');
    expect(
      resolveTodoTemporalIntent(
        {
          instruction: '2026-03-08 2:30 开始',
          temporal: { dateExpression: '2026-03-08', timeExpression: '2:30' },
        },
        { now: NOW, timeZone: 'America/New_York' },
      ).dueAt,
    ).toBe('2026-03-08 03:30:00');
  });

  it('拒绝模型改写或凭空补出的时间片段', () => {
    expect(() =>
      resolveTodoTemporalIntent(
        { instruction: '下午交材料', temporal: { dateExpression: '明天', timeExpression: '16:00' } },
        { now: NOW, timeZone: 'Asia/Shanghai' },
      ),
    ).toThrowError(expect.objectContaining({ code: 'AI_SKILL_STRUCTURED_OUTPUT_INVALID' }));
  });

  it('不认识的表达式失败关闭而不是猜时间', () => {
    expect(() =>
      resolveTodoTemporalIntent(
        { instruction: '晚些时候交材料', temporal: { dateExpression: '', timeExpression: '晚些时候' } },
        { now: NOW, timeZone: 'Asia/Shanghai' },
      ),
    ).toThrowError(expect.objectContaining({ code: 'AI_SKILL_STRUCTURED_OUTPUT_INVALID' }));
  });

  it('用户未表达时间时保持空截止时间', () => {
    expect(
      resolveTodoTemporalIntent(
        { instruction: '整理项目材料', temporal: { dateExpression: '', timeExpression: '' } },
        { now: NOW, timeZone: 'Asia/Shanghai' },
      ),
    ).toEqual({ dueAt: null, overdue: false });
  });
});
