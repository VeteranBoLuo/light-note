import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ poolQuery: vi.fn() }));

vi.mock('../../../db/index.js', () => ({ default: { query: mocks.poolQuery } }));

import queryTags from './query_tags.js';
import queryTrash from './query_trash.js';
import queryOperationLogs from './query_operation_logs.js';
import queryApiLogs from './query_api_logs.js';
import getSecurityEvents from './get_security_events.js';
import queryUsers from './query_users.js';
import queryCloudFolders from './query_cloud_folders.js';

describe('Agent 模糊查询字面量边界', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.poolQuery.mockImplementation(async (sql) =>
      String(sql).includes('COUNT(') ? [[{ total: 0, cnt: 0 }]] : [[]],
    );
  });

  it('标签查询统一转义通配符并在 SQL 声明 ESCAPE', async () => {
    await queryTags.execute({ keyword: String.raw`100%_done\path` }, { userId: 'user-1' });

    expect(mocks.poolQuery).toHaveBeenCalledTimes(2);
    for (const [sql, params] of mocks.poolQuery.mock.calls) {
      expect(String(sql)).toContain("LIKE ? ESCAPE '\\\\'");
      expect(params).toContain(String.raw`%100\%\_done\\path%`);
    }
  });

  it('跨类型回收站查询复用同一转义规则', async () => {
    await queryTrash.execute({ keyword: '%_' }, { userId: 'user-1' });

    expect(mocks.poolQuery).toHaveBeenCalledTimes(6);
    for (const [sql, params] of mocks.poolQuery.mock.calls) {
      expect(String(sql)).toContain("LIKE ? ESCAPE '\\\\'");
      expect(params).toContain(String.raw`%\%\_%`);
    }
  });

  it('Root 日志、安全事件和用户查询也复用同一字面量边界', async () => {
    const cases = [
      [queryOperationLogs, { keyword: '%_' }],
      [queryApiLogs, { keyword: '%_' }],
      [getSecurityEvents, { type: '%_' }],
      [queryUsers, { keyword: '%_' }],
    ];

    for (const [tool, args] of cases) {
      mocks.poolQuery.mockClear();
      await tool.execute(args, { userId: 'root-1' });
      const likeCalls = mocks.poolQuery.mock.calls.filter(([sql]) => String(sql).includes('LIKE ?'));
      expect(likeCalls.length).toBeGreaterThan(0);
      for (const [sql, params] of likeCalls) {
        expect(String(sql).match(/LIKE \? ESCAPE '\\\\'/gu)?.length).toBeGreaterThan(0);
        expect(params).toContain(String.raw`%\%\_%`);
      }
    }
  });

  it('云空间文件夹名称查询也把用户通配符视为普通字符', async () => {
    await queryCloudFolders.execute({ keyword: String.raw`100%_done\path` }, { userId: 'user-1' });

    expect(mocks.poolQuery).toHaveBeenCalledOnce();
    const [sql, params] = mocks.poolQuery.mock.calls[0];
    expect(String(sql)).toContain("folders.name LIKE ? ESCAPE '\\\\'");
    expect(params).toContain(String.raw`%100\%\_done\\path%`);
  });
});
