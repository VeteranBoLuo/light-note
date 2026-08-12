import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearCommunityChatDraftMemory,
  getCommunityChatDraft,
  rememberCommunityChatDraft,
} from './useCommunityChatDraftMemory';

describe('community chat draft memory', () => {
  beforeEach(clearCommunityChatDraftMemory);

  it('按账号与频道隔离当前页面运行期草稿', () => {
    rememberCommunityChatDraft('user-1:user', 'general', '未发送内容');
    expect(getCommunityChatDraft('user-1:user', 'general')).toBe('未发送内容');
    expect(getCommunityChatDraft('user-1:user', 'help')).toBe('');
    expect(getCommunityChatDraft('user-2:user', 'general')).toBe('');
  });

  it('发送后写入空值会释放草稿', () => {
    rememberCommunityChatDraft('user-1:user', 'general', '准备发送');
    rememberCommunityChatDraft('user-1:user', 'general', '');
    expect(getCommunityChatDraft('user-1:user', 'general')).toBe('');
  });
});
