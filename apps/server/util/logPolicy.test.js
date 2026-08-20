import { describe, expect, it } from 'vitest';
import { shouldSkipApiLog } from './logPolicy.js';

describe('API 日志跳过策略', () => {
  it.each([
    '/api/json/getConfigByName',
    '/json/getConfigByName?name=%E6%9B%B4%E6%96%B0%E6%97%A5%E5%BF%97',
    '/api/inbox/count',
    '/inbox/count?source=navigation',
    '/api/notification/unreadCount',
    '/api/updateLog/list',
    '/api/updateLog/image/log-1/release.webp',
    '/api/support/state',
    '/api/support/afdian/webhook',
    '/api/support/afdian/oauth/callback?code=temporary&state=temporary',
    '/api/community-chat/access',
    '/api/community-chat/rooms',
    '/api/infra/dashboard',
    '/api/infra/services',
    '/api/infra/storage',
    '/api/infra/security',
    '/api/common/recordAiEvent',
    '/api/me',
  ])('跳过无审计价值的被动读取接口：%s', (url) => {
    expect(shouldSkipApiLog(url)).toBe(true);
  });

  it.each([
    '/api/json/updateConfig',
    '/api/inbox/list',
    '/api/inbox/enqueue',
    '/api/bookmark/getBookmarkList',
    '/api/updateLog/save',
    '/api/support/checkout?option=coffee',
    '/api/community-chat/rooms/general/messages',
  ])('保留真实读取与写入接口日志：%s', (url) => {
    expect(shouldSkipApiLog(url)).toBe(false);
  });
});
