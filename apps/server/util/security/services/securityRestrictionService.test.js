import { describe, expect, it } from 'vitest';
import { restrictionBlocksRequest } from './securityRestrictionService.js';

const restriction = (restrictionType) => [{ restriction_type: restrictionType }];

describe('restrictionBlocksRequest', () => {
  it('写入限制只阻断非只读请求', () => {
    expect(restrictionBlocksRequest(restriction('write_lock'), { method: 'POST', path: '/todo/save' })).toBe(true);
    expect(restrictionBlocksRequest(restriction('write_lock'), { method: 'GET', path: '/todo/list' })).toBe(false);
  });

  it('上传限制只命中真实文件路由，AI 限制交给统一 Execution 门禁', () => {
    expect(restrictionBlocksRequest(restriction('upload_lock'), { method: 'POST', path: '/file/upload' })).toBe(true);
    expect(restrictionBlocksRequest(restriction('upload_lock'), { method: 'POST', path: '/todo/save' })).toBe(false);
    expect(restrictionBlocksRequest(restriction('ai_lock'), { method: 'POST', path: '/ai/skills/execute' })).toBe(false);
    expect(restrictionBlocksRequest(restriction('ai_lock'), { method: 'POST', path: '/chat/aiQuota' })).toBe(false);
    expect(restrictionBlocksRequest(restriction('ai_lock'), { method: 'POST', path: '/note/save' })).toBe(false);
  });

  it('登录与完全限制阻断所有请求', () => {
    expect(restrictionBlocksRequest(restriction('login_lock'), { method: 'GET', path: '/bookmark/list' })).toBe(true);
    expect(restrictionBlocksRequest(restriction('full_lock'), { method: 'GET', path: '/bookmark/list' })).toBe(true);
  });
});
