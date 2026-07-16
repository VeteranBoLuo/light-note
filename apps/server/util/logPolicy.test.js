import { describe, expect, it } from 'vitest';
import { shouldSkipApiLog } from './logPolicy.js';

describe('API 日志跳过策略', () => {
  it.each([
    '/api/json/getConfigByName',
    '/json/getConfigByName?name=%E6%9B%B4%E6%96%B0%E6%97%A5%E5%BF%97',
    '/api/inbox/count',
    '/inbox/count?source=navigation',
    '/api/notification/unreadCount',
  ])('跳过无审计价值的被动读取接口：%s', (url) => {
    expect(shouldSkipApiLog(url)).toBe(true);
  });

  it.each(['/api/json/updateConfig', '/api/inbox/list', '/api/inbox/enqueue', '/api/bookmark/getBookmarkList'])(
    '保留真实读取与写入接口日志：%s',
    (url) => {
      expect(shouldSkipApiLog(url)).toBe(false);
    },
  );
});
