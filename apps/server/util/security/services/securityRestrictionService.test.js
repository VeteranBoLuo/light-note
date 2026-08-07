import { describe, expect, it } from 'vitest';
import { restrictionBlocksRequest } from './securityRestrictionService.js';

const restriction = (restrictionType) => [{ restriction_type: restrictionType }];

describe('restrictionBlocksRequest', () => {
  it('写入限制只阻断非只读请求', () => {
    expect(restrictionBlocksRequest(restriction('write_lock'), { method: 'POST', path: '/todo/save' })).toBe(true);
    expect(restrictionBlocksRequest(restriction('write_lock'), { method: 'GET', path: '/todo/list' })).toBe(false);
  });

  it('上传与 AI 限制只命中对应业务路径', () => {
    expect(restrictionBlocksRequest(restriction('upload_lock'), { method: 'POST', path: '/file/upload' })).toBe(true);
    expect(restrictionBlocksRequest(restriction('upload_lock'), { method: 'POST', path: '/todo/save' })).toBe(false);
    expect(restrictionBlocksRequest(restriction('ai_lock'), { method: 'POST', path: '/chat/send' })).toBe(true);
    expect(restrictionBlocksRequest(restriction('ai_lock'), { method: 'POST', path: '/note/save' })).toBe(false);
  });

  it('登录与完全限制阻断所有请求', () => {
    expect(restrictionBlocksRequest(restriction('login_lock'), { method: 'GET', path: '/bookmark/list' })).toBe(true);
    expect(restrictionBlocksRequest(restriction('full_lock'), { method: 'GET', path: '/bookmark/list' })).toBe(true);
  });
});
