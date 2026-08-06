import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canInsertAndroidCalendarEvent,
  insertAndroidCalendarEvent,
  resetAndroidCalendarForTest,
} from './androidCalendar';

/*
 * 这条通道是「新网页 + 旧 App」的典型现场：正式版 1.0.0 收到 calendar.insert 会当未知类型
 * 直接忽略、什么都不回。所以「等不到回复必须收口成 unsupported」是这里最要紧的一条 ——
 * 不收口的话按钮会一直转，用户既加不上日历也回不到导出文件那条路。
 */
describe('insertAndroidCalendarEvent', () => {
  const event = {
    title: '交周报',
    description: '别忘了附上数据',
    beginTime: new Date(2026, 6, 28, 9, 0, 0).getTime(),
    endTime: new Date(2026, 6, 28, 9, 30, 0).getTime(),
  };
  let posted: string[];

  beforeEach(() => {
    vi.useFakeTimers();
    posted = [];
    window.LightNoteAndroid = { postMessage: (raw: string) => posted.push(raw) };
  });

  afterEach(() => {
    resetAndroidCalendarForTest();
    delete window.LightNoteAndroid;
    vi.useRealTimers();
  });

  const replyFromNative = (payload: Record<string, unknown>) => {
    window.__lightNoteAndroidCalendarResult?.(payload);
  };

  it('浏览器里没有桥:直接 unsupported,一条消息都不发', async () => {
    delete window.LightNoteAndroid;
    expect(canInsertAndroidCalendarEvent()).toBe(false);

    await expect(insertAndroidCalendarEvent(event)).resolves.toEqual({ ok: false, reason: 'unsupported' });
    expect(posted).toHaveLength(0);
  });

  it('交给原生的消息带齐字段,时间是毫秒时间戳', async () => {
    const pending = insertAndroidCalendarEvent(event);
    expect(posted).toHaveLength(1);
    const payload = JSON.parse(posted[0]);
    expect(payload.type).toBe('calendar.insert');
    expect(payload.title).toBe('交周报');
    expect(payload.description).toBe('别忘了附上数据');
    expect(payload.beginTime).toBe(event.beginTime);
    expect(payload.endTime).toBe(event.endTime);
    expect(typeof payload.token).toBe('string');
    expect(payload.token.length).toBeGreaterThan(0);

    replyFromNative({ token: payload.token, ok: true });
    await expect(pending).resolves.toEqual({ ok: true, reason: undefined });
  });

  it('原生说打不开(没有日历应用)时如实回 failed', async () => {
    const pending = insertAndroidCalendarEvent(event);
    const { token } = JSON.parse(posted[0]);

    replyFromNative({ token, ok: false, reason: 'failed' });
    await expect(pending).resolves.toEqual({ ok: false, reason: 'failed' });
  });

  it('旧版 App 不回复:超时收口成 unsupported,不能一直挂着', async () => {
    const pending = insertAndroidCalendarEvent(event);
    expect(posted).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(2500);
    await expect(pending).resolves.toEqual({ ok: false, reason: 'unsupported' });
  });

  /*
   * 存量 1.0.0 有桥但没有 calendar.insert 分支。不记住这件事的话，每次打开弹窗都会摆一个
   * 点了必然干等再失败的「加入日历」按钮。
   */
  it('超时一次后本会话不再显示入口，升级前不用反复踩', async () => {
    expect(canInsertAndroidCalendarEvent()).toBe(true);

    const pending = insertAndroidCalendarEvent(event);
    await vi.advanceTimersByTimeAsync(2500);
    await pending;

    expect(canInsertAndroidCalendarEvent()).toBe(false);
  });

  it('原生明确回 failed 不算「没有这条通道」：入口要留着，换台设备/装了日历应用就能用', async () => {
    const pending = insertAndroidCalendarEvent(event);
    const { token } = JSON.parse(posted[0]);

    replyFromNative({ token, ok: false, reason: 'failed' });
    await pending;

    expect(canInsertAndroidCalendarEvent()).toBe(true);
  });

  it('对不上 token 的回复一律忽略:别让上一次的结果落到这一次上', async () => {
    const pending = insertAndroidCalendarEvent(event);
    const { token } = JSON.parse(posted[0]);

    replyFromNative({ token: `${token}-stale`, ok: true });
    await vi.advanceTimersByTimeAsync(8000);
    await expect(pending).resolves.toEqual({ ok: false, reason: 'unsupported' });
  });

  it('开始时间非法时不发消息:原生那边也会拒,不如就地收口', async () => {
    await expect(insertAndroidCalendarEvent({ ...event, beginTime: 0 })).resolves.toEqual({
      ok: false,
      reason: 'unsupported',
    });
    await expect(insertAndroidCalendarEvent({ ...event, beginTime: Number.NaN })).resolves.toEqual({
      ok: false,
      reason: 'unsupported',
    });
    expect(posted).toHaveLength(0);
  });

  it('桥抛异常时也要收口,不能把 promise 悬着', async () => {
    window.LightNoteAndroid = {
      postMessage: () => {
        throw new Error('bridge exploded');
      },
    };

    await expect(insertAndroidCalendarEvent(event)).resolves.toEqual({ ok: false, reason: 'unsupported' });
  });
});
