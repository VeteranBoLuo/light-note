import { describe, expect, it } from 'vitest';
import {
  clearSecurityRestrictionCache,
  getActiveSecurityRestrictions,
  restrictionBlocksRequest,
} from './securityRestrictionService.js';

const restriction = (restrictionType) => [{ restriction_type: restrictionType }];

describe('getActiveSecurityRestrictions', () => {
  it('审核读取跳过旧缓存且不覆盖普通请求缓存', async () => {
    clearSecurityRestrictionCache();
    const database = { query: async () => [[]] };
    await expect(getActiveSecurityRestrictions('review-user', { database })).resolves.toEqual([]);
    database.query = async () => [restriction('ai_lock')];
    const current = await getActiveSecurityRestrictions('review-user', { database, useCache: false, failClosed: true });
    expect(current[0].restriction_type).toBe('ai_lock');
    await expect(getActiveSecurityRestrictions('review-user', { database })).resolves.toEqual([]);
    clearSecurityRestrictionCache();
  });

  it('审核查询失败向上抛出，普通调用保持原有回退', async () => {
    const error = new Error('database unavailable');
    const database = {
      query: async () => {
        throw error;
      },
    };
    await expect(
      getActiveSecurityRestrictions('review-failure', { database, useCache: false, failClosed: true }),
    ).rejects.toBe(error);
    await expect(getActiveSecurityRestrictions('review-failure', { database })).resolves.toEqual([]);
  });
});

describe('restrictionBlocksRequest', () => {
  it('写入限制只阻断非只读请求', () => {
    expect(restrictionBlocksRequest(restriction('write_lock'), { method: 'POST', path: '/todo/save' })).toBe(true);
    expect(restrictionBlocksRequest(restriction('write_lock'), { method: 'GET', path: '/todo/list' })).toBe(false);
  });

  it('上传限制只命中真实文件路由，AI 限制交给统一 Execution 门禁', () => {
    expect(restrictionBlocksRequest(restriction('upload_lock'), { method: 'POST', path: '/file/upload' })).toBe(true);
    expect(restrictionBlocksRequest(restriction('upload_lock'), { method: 'POST', path: '/todo/save' })).toBe(false);
    expect(restrictionBlocksRequest(restriction('ai_lock'), { method: 'POST', path: '/ai/skills/execute' })).toBe(
      false,
    );
    expect(restrictionBlocksRequest(restriction('ai_lock'), { method: 'POST', path: '/chat/aiQuota' })).toBe(false);
    expect(restrictionBlocksRequest(restriction('ai_lock'), { method: 'POST', path: '/note/save' })).toBe(false);
  });

  it('登录与完全限制阻断所有请求', () => {
    expect(restrictionBlocksRequest(restriction('login_lock'), { method: 'GET', path: '/bookmark/list' })).toBe(true);
    expect(restrictionBlocksRequest(restriction('full_lock'), { method: 'GET', path: '/bookmark/list' })).toBe(true);
  });
});
