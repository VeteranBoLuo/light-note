import { describe, expect, it } from 'vitest';
import {
  resolveAgentPersistenceMode,
  shouldRestoreAgentPersistentState,
  shouldWriteAgentPersistentState,
} from './agentPersistenceMode.js';

describe('Agent Phase 2 持久层开关', () => {
  it('缺失或非法配置都失败关闭，不因 Runtime V3 自动启用', () => {
    expect(resolveAgentPersistenceMode({ AI_AGENT_RUNTIME_MODE: 'v3_enforce' })).toBe('disabled');
    expect(resolveAgentPersistenceMode({ AI_AGENT_STATE_PERSISTENCE_MODE: 'unknown' })).toBe('disabled');
  });

  it('shadow 只写不读，enforce 才允许恢复', () => {
    expect(shouldWriteAgentPersistentState('shadow')).toBe(true);
    expect(shouldRestoreAgentPersistentState('shadow')).toBe(false);
    expect(shouldWriteAgentPersistentState('enforce')).toBe(true);
    expect(shouldRestoreAgentPersistentState('enforce')).toBe(true);
  });
});
