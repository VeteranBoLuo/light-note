import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
const lstat = vi.fn();

vi.mock('../../db/index.js', () => ({ default: { query } }));
vi.mock('node:fs', () => ({ promises: { lstat } }));

const {
  classifyLocalImage,
  evidenceHash,
  hasAnyLocalImageReference,
  inspectLocalImage,
  resolveGovernedImagePath,
  verifyOwnerMissing,
} = await import('./safety.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resource governance safety boundary', () => {
  it('只把 note-* 与内容哈希书签图标识别为已知来源，拒绝路径和旧版未知文件名', () => {
    expect(classifyLocalImage('note-123-image.png')).toBe('note');
    expect(classifyLocalImage(`bookmark-icon-${'a'.repeat(64)}.png`)).toBe('bookmark_icon');
    expect(classifyLocalImage('bookmark-old-id.png')).toBe('unsupported');
    expect(classifyLocalImage('../../note-x.png')).toBe('unsupported');
    expect(resolveGovernedImagePath('/tmp/images', '../note-x.png')).toBeNull();
  });

  it('用户行只要仍存在（包括软删除）就绝不判为 owner missing', async () => {
    query.mockResolvedValueOnce([[{ id: 'soft-deleted-user' }]]);
    await expect(verifyOwnerMissing('soft-deleted-user')).resolves.toBe(false);
    expect(query).toHaveBeenCalledWith('SELECT id FROM user WHERE id = ? LIMIT 1', ['soft-deleted-user']);
  });

  it('引用检查不排除回收站或软删除行，任一引用存在就保留物理文件', async () => {
    query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ one: 1 }]]);
    await expect(hasAnyLocalImageReference('note-1.png')).resolves.toBe(true);
    expect(query.mock.calls[0][0]).not.toContain('del_flag');
    expect(query.mock.calls[1][0]).toContain('FROM note WHERE content');
  });

  it('找不到当前登记时仍检查版本、模板和书签，避免删除历史可见资源', async () => {
    query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ one: 1 }]]);
    await expect(hasAnyLocalImageReference('note-history.png')).resolves.toBe(true);
    expect(query.mock.calls[2][0]).toContain('note_versions');
  });

  it('证据摘要不受 open 到 queued 的流程状态变化影响', () => {
    const finding = {
      id: 'finding-1',
      issue_code: 'LOCAL_IMAGE_UNREFERENCED',
      risk_level: 'safe',
      observation_count: 2,
      last_verified_at: '2026-08-09T00:00:00.000Z',
      evidence_json: JSON.stringify({ fileName: 'note-old.png', referenced: false }),
    };
    expect(evidenceHash({ ...finding, state: 'open' })).toBe(evidenceHash({ ...finding, state: 'queued' }));
  });

  it('符号链接即使无引用也不允许进入清理', async () => {
    lstat.mockResolvedValue({ isSymbolicLink: () => true, isFile: () => true, size: 10, mtimeMs: 0 });
    const result = await inspectLocalImage(
      { root: '/www/wwwroot/images', fileName: 'note-old.png' },
      { now: new Date('2026-08-09T00:00:00Z') },
    );
    expect(result).toMatchObject({ eligible: false, resultCode: 'IMAGE_NOT_REGULAR_FILE' });
    expect(query).not.toHaveBeenCalled();
  });
});
