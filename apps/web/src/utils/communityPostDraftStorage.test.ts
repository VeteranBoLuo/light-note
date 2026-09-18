import { beforeEach, describe, expect, it } from 'vitest';
import { readCommunityPostDraft, writeCommunityPostDraft, removeCommunityPostDraft } from './communityPostDraftStorage';

describe('community post draft persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  it('keeps each account and post after tab session storage is cleared', () => {
    writeCommunityPostDraft('community-post-draft:a:user:one', 'first');
    writeCommunityPostDraft('community-post-draft:a:user:two', 'second');
    writeCommunityPostDraft('community-post-draft:b:user:one', 'other account');
    sessionStorage.clear();
    expect(readCommunityPostDraft('community-post-draft:a:user:one')).toBe('first');
    removeCommunityPostDraft('community-post-draft:a:user:two');
    expect(readCommunityPostDraft('community-post-draft:a:user:one')).toBe('first');
    expect(readCommunityPostDraft('community-post-draft:b:user:one')).toBe('other account');
  });
  it('migrates an existing session draft and clears both stores on removal', () => {
    sessionStorage.setItem('draft', 'old draft');
    expect(readCommunityPostDraft('draft')).toBe('old draft');
    expect(localStorage.getItem('draft')).toBe('old draft');
    expect(sessionStorage.getItem('draft')).toBeNull();
    sessionStorage.setItem('draft', 'stale draft');
    expect(readCommunityPostDraft('draft')).toBe('old draft');
    removeCommunityPostDraft('draft');
    expect(readCommunityPostDraft('draft')).toBeNull();
  });
});
