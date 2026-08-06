import { describe, expect, it } from 'vitest';
import {
  assertNoteTreeFeature,
  NOTE_TREE_FEATURE,
  NoteTreeFeatureError,
  noteTreeFeatureIdentity,
  resolveNoteTreeFeatures,
  __testing,
} from './noteTreeFeatureFlags.js';

const userIdentity = (id = 'user-1') => ({
  actor: { id, role: 'user' },
  subject: { id, role: 'user' },
});

describe('noteTreeFeatureFlags', () => {
  it('本地与测试默认完整开启，且下游开关依赖读取/写入能力', () => {
    expect(resolveNoteTreeFeatures(userIdentity(), {})).toEqual({
      note_tree_read: true,
      note_tree_write: true,
      note_tree_mobile: true,
      note_tree_subtree_trash: true,
      ai_note_branch_scope: true,
      ai_note_branch_analysis: true,
    });

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
  });

  it('生产环境默认关闭，Root/测试账号仍可先行验收', () => {
    expect(resolveNoteTreeFeatures(userIdentity(), { NODE_ENV: 'production' })).toEqual({
      note_tree_read: false,
      note_tree_write: false,
      note_tree_mobile: false,
      note_tree_subtree_trash: false,
      ai_note_branch_scope: false,
      ai_note_branch_analysis: false,
    });
    expect(
      resolveNoteTreeFeatures(
        { actor: { id: 'root-1', role: 'root' }, subject: { id: 'subject-1', role: 'user' } },
        { NODE_ENV: 'production' },
      ).note_tree_read,
    ).toBe(true);
    expect(
      resolveNoteTreeFeatures(userIdentity('tester-1'), {
        NODE_ENV: 'production',
        NOTE_TREE_TEST_USER_IDS: 'tester-1',
      }).note_tree_read,
    ).toBe(true);
  });

  it('显式开启可全量放行，也可与百分比灰度组合', () => {
    expect(
      resolveNoteTreeFeatures(userIdentity('enabled-user'), {
        NODE_ENV: 'production',
        NOTE_TREE_READ_ENABLED: 'true',
      }).note_tree_read,
    ).toBe(true);

    const subjectId = 'rollout-user';
    const bucket = __testing.stableBucket(NOTE_TREE_FEATURE.READ, subjectId);
    expect(
      resolveNoteTreeFeatures(userIdentity(subjectId), {
        NODE_ENV: 'production',
        NOTE_TREE_READ_ENABLED: 'true',
        NOTE_TREE_READ_ROLLOUT_PERCENT: String(bucket),
      }).note_tree_read,
    ).toBe(false);
    expect(
      resolveNoteTreeFeatures(userIdentity(subjectId), {
        NODE_ENV: 'production',
        NOTE_TREE_READ_ENABLED: 'true',
        NOTE_TREE_READ_ROLLOUT_PERCENT: String(bucket + 1),
      }).note_tree_read,
    ).toBe(true);
  });

  it('按 subject ID 确定性分桶，同一用户结果稳定', () => {
    const env = { NOTE_TREE_READ_ROLLOUT_PERCENT: '20' };
    const first = resolveNoteTreeFeatures(userIdentity('stable-user'), env).note_tree_read;
    for (let index = 0; index < 20; index += 1) {
      expect(resolveNoteTreeFeatures(userIdentity('stable-user'), env).note_tree_read).toBe(first);
    }
    expect(__testing.stableBucket(NOTE_TREE_FEATURE.READ, 'stable-user')).toBeGreaterThanOrEqual(0);
    expect(__testing.stableBucket(NOTE_TREE_FEATURE.READ, 'stable-user')).toBeLessThan(100);
  });

  it('Root 和测试账号跳过百分比分桶，但不能绕过显式急停', () => {
    const root = { actor: { id: 'root-1', role: 'root' }, subject: { id: 'subject-1', role: 'user' } };
    expect(resolveNoteTreeFeatures(root, { NOTE_TREE_READ_ROLLOUT_PERCENT: '0' }).note_tree_read).toBe(true);
    expect(
      resolveNoteTreeFeatures(userIdentity('tester-1'), {
        NOTE_TREE_TEST_USER_IDS: 'tester-1,tester-2',
        NOTE_TREE_READ_ROLLOUT_PERCENT: '0',
      }).note_tree_read,
    ).toBe(true);
    expect(resolveNoteTreeFeatures(root, { NOTE_TREE_READ_ENABLED: 'false' }).note_tree_read).toBe(false);
  });

  it('管理员代管按 actor Root 放行、按 subject 形成资源身份', () => {
    const req = {
      user: { id: 'subject-1', role: 'user' },
      resourceUser: { id: 'subject-1', role: 'user' },
      billingUser: { id: 'root-1', role: 'root' },
    };
    expect(noteTreeFeatureIdentity(req)).toEqual({
      actor: { id: 'root-1', role: 'root' },
      subject: { id: 'subject-1', role: 'user' },
    });
    expect(assertNoteTreeFeature(req, NOTE_TREE_FEATURE.READ, { NOTE_TREE_READ_ROLLOUT_PERCENT: '0' })).toBeTruthy();
  });

  it('未命中灰度时返回不暴露功能存在性的稳定错误', () => {
    expect(() =>
      assertNoteTreeFeature(
        { user: { id: 'user-1', role: 'user' } },
        NOTE_TREE_FEATURE.WRITE,
        { NOTE_TREE_WRITE_ENABLED: 'false' },
      ),
    ).toThrowError(expect.objectContaining({ code: 'NOTE_TREE_FEATURE_DISABLED', status: 404 }));
    expect(new NoteTreeFeatureError(NOTE_TREE_FEATURE.READ).feature).toBe(NOTE_TREE_FEATURE.READ);
  });
});
