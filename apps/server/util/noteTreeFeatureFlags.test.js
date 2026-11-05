import { describe, expect, it } from 'vitest';
import {
  assertNoteTreeFeature,
  NOTE_TREE_FEATURE,
  NoteTreeFeatureError,
  noteTreeFeatureIdentity,
  resolveNoteTreeFeatures,
} from './noteTreeFeatureFlags.js';

const userIdentity = (id = 'user-1') => ({
  actor: { id, role: 'user' },
  subject: { id, role: 'user' },
});

const ALL_ENABLED = Object.freeze({
  note_tree_read: true,
  note_tree_write: true,
  note_tree_mobile: true,
  note_tree_subtree_trash: true,
  ai_note_branch_scope: true,
  ai_note_branch_analysis: true,
});

describe('noteTreeFeatureFlags', () => {
  it('未配置时在任何运行环境都完整开启，不依赖 NODE_ENV', () => {
    for (const env of [{}, { NODE_ENV: 'production' }, { NODE_ENV: 'test' }]) {
      expect(resolveNoteTreeFeatures(userIdentity(), env)).toEqual(ALL_ENABLED);
    }
    expect(resolveNoteTreeFeatures(userIdentity(), { NODE_ENV: 'production', NOTE_TREE_READ_ENABLED: 'true' })).toEqual(
      ALL_ENABLED,
    );
    // 旧的百分比灰度变量已移除，残留配置不能让普通用户静默失去页面树。
    expect(
      resolveNoteTreeFeatures(userIdentity(), { NODE_ENV: 'production', NOTE_TREE_READ_ROLLOUT_PERCENT: '0' })
        .note_tree_read,
    ).toBe(true);
  });

  it('只有显式关闭才急停，Root 也不能绕过，下游能力随上游一起关闭', () => {
    const root = { actor: { id: 'root-1', role: 'root' }, subject: { id: 'subject-1', role: 'user' } };
    for (const value of ['false', '0', 'off', 'no']) {
      expect(resolveNoteTreeFeatures(root, { NOTE_TREE_READ_ENABLED: value }).note_tree_read).toBe(false);
    }
    expect(
      resolveNoteTreeFeatures(userIdentity(), {
        NOTE_TREE_READ_ENABLED: 'false',
        NOTE_TREE_WRITE_ENABLED: 'true',
        AI_NOTE_BRANCH_SCOPE_ENABLED: 'true',
      }),
    ).toEqual({
      note_tree_read: false,
      note_tree_write: false,
      note_tree_mobile: false,
      note_tree_subtree_trash: false,
      ai_note_branch_scope: false,
      ai_note_branch_analysis: false,
    });
    expect(resolveNoteTreeFeatures(userIdentity(), { NOTE_TREE_WRITE_ENABLED: 'false' })).toEqual({
      ...ALL_ENABLED,
      note_tree_write: false,
      note_tree_subtree_trash: false,
    });
    expect(resolveNoteTreeFeatures(userIdentity(), { AI_NOTE_BRANCH_SCOPE_ENABLED: 'false' })).toEqual({
      ...ALL_ENABLED,
      ai_note_branch_scope: false,
      ai_note_branch_analysis: false,
    });
  });

  it('缺少资源身份时保持关闭，Root 不受影响', () => {
    expect(resolveNoteTreeFeatures({}, {}).note_tree_read).toBe(false);
    expect(resolveNoteTreeFeatures({ actor: { role: 'user' }, subject: { role: 'user' } }, {}).note_tree_read).toBe(
      false,
    );
    expect(resolveNoteTreeFeatures({ actor: { role: 'root' }, subject: { role: 'visitor' } }, {}).note_tree_read).toBe(
      true,
    );
  });

  it('管理员代管按 actor 识别 Root、按 subject 形成资源身份', () => {
    const req = {
      user: { id: 'subject-1', role: 'user' },
      resourceUser: { id: 'subject-1', role: 'user' },
      billingUser: { id: 'root-1', role: 'root' },
    };
    expect(noteTreeFeatureIdentity(req)).toEqual({
      actor: { id: 'root-1', role: 'root' },
      subject: { id: 'subject-1', role: 'user' },
    });
    expect(assertNoteTreeFeature(req, NOTE_TREE_FEATURE.READ, { NODE_ENV: 'production' })).toBeTruthy();
  });

  it('关闭时返回不暴露功能存在性的稳定错误', () => {
    expect(() =>
      assertNoteTreeFeature({ user: { id: 'user-1', role: 'user' } }, NOTE_TREE_FEATURE.WRITE, {
        NOTE_TREE_WRITE_ENABLED: 'false',
      }),
    ).toThrowError(expect.objectContaining({ code: 'NOTE_TREE_FEATURE_DISABLED', status: 404 }));
    expect(new NoteTreeFeatureError(NOTE_TREE_FEATURE.READ).feature).toBe(NOTE_TREE_FEATURE.READ);
  });
});
