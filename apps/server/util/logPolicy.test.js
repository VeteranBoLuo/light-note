import { describe, expect, it } from 'vitest';
import { shouldSkipApiLog, summarizeApiLogPayload } from './logPolicy.js';

it.each(['status', 'request', 'confirm'])('更换邮箱日志不保存密码、邮箱、票据或验证码：%s', (action) => {
  expect(summarizeApiLogPayload(`/api/user/email-change/${action}`, { email: 'private@example.com', oldPassword: 'secret', challenge: 'secret-ticket', code: '123456' }))
    .toEqual({ payloadSummary: 'account_email_change_omitted' });
});

it.each(['/api/user/github', '/api/user/github/bind'])('GitHub 认证日志不保留授权码、票据或账号身份：%s', (path) => {
  expect(summarizeApiLogPayload(path, { code: 'provider-secret', state: 'browser-secret', userId: 'private-id', confirm: true })).toEqual({
    payloadSummary: 'github_oauth_omitted', confirmed: true,
  });
});

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
    '/api/community-chat/rooms/general/read-receipt-counts?messagePublicIds=message-1',
    '/api/infra/dashboard',
    '/api/infra/diagnostics',
    '/api/infra/services',
    '/api/infra/storage',
    '/api/infra/security',
    '/api/common/recordAiEvent',
    '/api/common/recordResourceOpen',
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
    '/api/support/donation/checkout?option=coffee',
    '/api/support/checkout?skuId=ai-6&catalogVersion=support-packages-v2',
    '/api/community-chat/rooms/general/messages',
  ])('保留真实读取与写入接口日志：%s', (url) => {
    expect(shouldSkipApiLog(url)).toBe(false);
  });
});
