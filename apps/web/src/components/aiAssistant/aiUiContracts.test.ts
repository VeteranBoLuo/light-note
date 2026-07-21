import { describe, expect, it } from 'vitest';
import {
  buildAiConversationRetentionPatch,
  closestAiTemporaryRetentionDays,
  parseMoveFileFolderId,
  resolveAiChangeSetListTarget,
  shouldUseAiCloudHistory,
  telemetryMemoryType,
} from './aiUiContracts';

describe('AI workspace UI contracts', () => {
  it('keeps the active change set only when it belongs to the filtered list', () => {
    const items = [{ id: 'draft-1' }, { id: 'draft-2' }];
    expect(resolveAiChangeSetListTarget(items as any, 'applied-1', 'applied-2')).toBe('draft-1');
    expect(resolveAiChangeSetListTarget(items as any, 'draft-2', 'draft-1')).toBe('draft-2');
  });

  it('accepts only an empty root target or a strict safe positive folder id', () => {
    expect(parseMoveFileFolderId('')).toBeNull();
    expect(parseMoveFileFolderId('12')).toBe(12);
    expect(parseMoveFileFolderId('0')).toBeUndefined();
    expect(parseMoveFileFolderId('-1')).toBeUndefined();
    expect(parseMoveFileFolderId('1e3')).toBeUndefined();
    expect(parseMoveFileFolderId('9007199254740992')).toBeUndefined();
  });

  it('maps every persisted memory type to the bounded telemetry vocabulary', () => {
    expect(telemetryMemoryType('preference')).toBe('preference');
    expect(telemetryMemoryType('fact')).toBe('stable_fact');
    expect(telemetryMemoryType('topic')).toBe('project');
    expect(telemetryMemoryType('workflow')).toBe('project');
    expect(telemetryMemoryType('temporary_state')).toBe('temporary_state');
  });

  it('builds explicit conversation retention patches without carrying stale expiry timestamps', () => {
    const now = Date.UTC(2026, 6, 19, 0, 0, 0);
    expect(buildAiConversationRetentionPatch('standard', 7, now)).toEqual({
      retentionMode: 'standard',
      expireAt: null,
    });
    expect(buildAiConversationRetentionPatch('indefinite', 30, now)).toEqual({
      retentionMode: 'indefinite',
      expireAt: null,
    });
    expect(buildAiConversationRetentionPatch('temporary', 7, now)).toEqual({
      retentionMode: 'temporary',
      expireAt: '2026-07-26T00:00:00.000Z',
    });
    expect(() => buildAiConversationRetentionPatch('temporary', 2, now)).toThrow('AI_RETENTION_DAYS_INVALID');
  });

  it('maps an existing temporary expiry to the nearest supported retention preset', () => {
    const now = Date.UTC(2026, 6, 19, 0, 0, 0);
    expect(closestAiTemporaryRetentionDays('2026-07-20T00:00:00.000Z', now)).toBe(1);
    expect(closestAiTemporaryRetentionDays('2026-07-25T00:00:00.000Z', now)).toBe(7);
    expect(closestAiTemporaryRetentionDays('2026-08-12T00:00:00.000Z', now)).toBe(30);
    expect(closestAiTemporaryRetentionDays(null, now)).toBe(1);
  });

  it('enables cloud conversation history only for signed-in users that did not opt out', () => {
    expect(shouldUseAiCloudHistory('user-1', 'user', undefined)).toBe(true);
    expect(shouldUseAiCloudHistory('user-1', 'root', true)).toBe(true);
    expect(shouldUseAiCloudHistory('user-1', 'user', false)).toBe(false);
    expect(shouldUseAiCloudHistory('', 'user', true)).toBe(false);
    expect(shouldUseAiCloudHistory('visitor-1', 'visitor', true)).toBe(false);
  });
});
