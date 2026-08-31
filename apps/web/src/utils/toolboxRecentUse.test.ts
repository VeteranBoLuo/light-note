import { describe, expect, it } from 'vitest';
import {
  readToolboxRecentUses,
  recordToolboxRecentUse,
  toolboxRecentUseIdentityKey,
  TOOLBOX_RECENT_USE_TTL_MS,
} from './toolboxRecentUse';

class MemoryStorage {
  values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe('工具箱本地最近使用', () => {
  it('按有效身份隔离记录，管理员代看不会混入本人历史', () => {
    const storage = new MemoryStorage();
    const owner = { id: 'user-1', role: 'user' };
    const subject = {
      id: 'admin-1',
      role: 'admin',
      adminContext: { subjectUserId: 'user-2', mode: 'readonly' },
    };

    recordToolboxRecentUse(owner, 'image_optimizer', { usedAt: 1_000_000, storage });
    recordToolboxRecentUse(subject, 'pdf_organizer', { usedAt: 1_000_100, storage });

    expect(readToolboxRecentUses(owner, { now: 1_000_200, storage })).toEqual([
      { toolId: 'image_optimizer', usedAt: 1_000_000 },
    ]);
    expect(readToolboxRecentUses(subject, { now: 1_000_200, storage })).toEqual([
      { toolId: 'pdf_organizer', usedAt: 1_000_100 },
    ]);
    expect(toolboxRecentUseIdentityKey(owner)).not.toBe(toolboxRecentUseIdentityKey(subject));
  });

  it('同一工具只保留最新时间，并过滤过期或未启用工具', () => {
    const storage = new MemoryStorage();
    const identity = { id: 'user-1', role: 'user' };
    const now = TOOLBOX_RECENT_USE_TTL_MS + 10_000;

    recordToolboxRecentUse(identity, 'expired_tool', { usedAt: 1, storage });
    recordToolboxRecentUse(identity, 'image_optimizer', { usedAt: now - 200, storage });
    recordToolboxRecentUse(identity, 'image_optimizer', { usedAt: now - 100, storage });
    recordToolboxRecentUse(identity, 'disabled_tool', { usedAt: now - 50, storage });

    expect(
      readToolboxRecentUses(identity, {
        now,
        storage,
        allowedToolIds: new Set(['image_optimizer']),
      }),
    ).toEqual([{ toolId: 'image_optimizer', usedAt: now - 100 }]);
  });

  it('存储异常时静默降级，不影响本地工具打开', () => {
    const failingStorage = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('blocked');
      },
    };

    expect(() =>
      recordToolboxRecentUse({ id: 'user-1' }, 'image_optimizer', { storage: failingStorage }),
    ).not.toThrow();
    expect(readToolboxRecentUses({ id: 'user-1' }, { storage: failingStorage })).toEqual([]);
  });
});
