import { describe, expect, it, vi } from 'vitest';
import { communityCapabilities, preserveCommunityPreference } from '../communityPreferences.js';
import { getCommunityPreferences, updateCommunityPreferences } from './communityPreferenceService.js';
const user = { id: 'owner', role: 'user' };
function database(preferences = { theme: 'night', homePage: 'bookmark' }) {
  let stored = JSON.stringify(preferences);
  const connection = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    query: vi.fn(async (sql, values) => {
      if (sql.startsWith('SELECT')) return [[{ preferences: stored }]];
      stored = values[0];
      return [{ affectedRows: 1 }];
    }),
  };
  return {
    query: connection.query,
    getConnection: vi.fn(async () => connection),
    connection,
    stored: () => JSON.parse(stored),
  };
}
describe('community navigation preferences', () => {
  it('P1 exposes chat only, without a database-dependent capability', () => {
    expect(communityCapabilities()).toEqual({ protocolVersion: 1, availableViews: ['chat'], feedEnabled: false });
  });
  it('uses existing account storage and does not touch app home or unrelated fields', async () => {
    const db = database();
    expect(await getCommunityPreferences({ user, db })).toMatchObject({ defaultView: 'chat', revision: 0 });
    expect(
      await updateCommunityPreferences({ user, db, input: { defaultView: 'chat', expectedRevision: 0 } }),
    ).toMatchObject({ revision: 1 });
    expect(db.stored()).toEqual({
      theme: 'night',
      homePage: 'bookmark',
      communityNavigation: { defaultView: 'chat', revision: 1 },
    });
    expect(db.connection.commit).toHaveBeenCalledOnce();
    expect(db.connection.release).toHaveBeenCalledOnce();
  });
  it('rejects stale updates without changing persisted preference', async () => {
    const db = database({ communityNavigation: { defaultView: 'feed', revision: 3 } });
    await expect(
      updateCommunityPreferences({ user, db, input: { defaultView: 'chat', expectedRevision: 2 } }),
    ).rejects.toMatchObject({ code: 'COMMUNITY_PREFERENCE_CONFLICT' });
    expect(db.stored().communityNavigation).toEqual({ defaultView: 'feed', revision: 3 });
    expect(db.connection.rollback).toHaveBeenCalledOnce();
  });
  it('rejects unavailable views, unknown fields and nonmembers before borrowing a connection', async () => {
    const db = database();
    for (const input of [
      { defaultView: 'feed', expectedRevision: 0 },
      { defaultView: 'chat', expectedRevision: 0, userId: 'other' },
      { defaultView: 'chat', expectedRevision: -1 },
    ]) {
      await expect(updateCommunityPreferences({ user, db, input })).rejects.toBeDefined();
    }
    await expect(getCommunityPreferences({ user: { id: 'guest', role: 'visitor' }, db })).rejects.toMatchObject({
      code: 'COMMUNITY_LOGIN_REQUIRED',
    });
    expect(db.getConnection).not.toHaveBeenCalled();
  });
  it('normal preference saves cannot forge or erase the dedicated field', () => {
    const old = { communityNavigation: { defaultView: 'feed', revision: 4 } };
    expect(
      JSON.parse(
        preserveCommunityPreference({ theme: 'day', communityNavigation: { defaultView: 'chat', revision: 0 } }, old),
      ),
    ).toEqual({ ...old, theme: 'day' });
    expect(JSON.parse(preserveCommunityPreference({ communityNavigation: old.communityNavigation }, {}))).toEqual({});
  });
});
