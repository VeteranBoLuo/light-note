import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../db/index.js', () => ({ default: {} }));
import { startAccountEmailHealthScheduler } from './accountEmailHealthService.js';
afterEach(() => vi.useRealTimers());
describe('月度邮箱检查隔离', () => {
  it.each(['local', 'test', undefined])('%s 环境不扫描、不领取进度、不创建定时器', (runtime) => {
    vi.useFakeTimers();
    const db = { query: vi.fn(), getConnection: vi.fn() };
    startAccountEmailHealthScheduler({
      db,
      env: { LIGHTNOTE_RUNTIME_ENV: runtime, ALLOW_REMOTE_DATABASE_WRITES: 'true' },
    });
    expect(vi.getTimerCount()).toBe(0);
    expect(db.query).not.toHaveBeenCalled();
    expect(db.getConnection).not.toHaveBeenCalled();
  });
  it('生产环境新表尚未安装时只做只读检查，不影响其他业务', async () => {
    vi.useFakeTimers();
    const db = { query: vi.fn().mockResolvedValue([[{ total: 0 }]]), getConnection: vi.fn() };
    const stop = startAccountEmailHealthScheduler({ db, env: { LIGHTNOTE_RUNTIME_ENV: 'production' } });
    await Promise.resolve();
    await Promise.resolve();
    expect(db.query).toHaveBeenCalledOnce();
    expect(db.getConnection).not.toHaveBeenCalled();
    stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
