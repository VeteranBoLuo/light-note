vi.mock('../bookmarkArchiveJobs.js', () => ({ enqueueBookmarkArchiveInTransaction: vi.fn() }));
import { enqueueBookmarkArchiveInTransaction } from '../bookmarkArchiveJobs.js';
import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('./resourceTagWriteService.js', () => ({ batchWriteResourceTags: vi.fn().mockResolvedValue({}) }));
vi.mock('./tagService.js', () => ({ ensureTag: vi.fn().mockResolvedValue({ id: 'new', name: 'Vue' }) }));
vi.mock('./noteService.js', () => ({ snapshotOwnedNoteVersion: vi.fn().mockResolvedValue(true) }));
vi.mock('./noteTreeService.js', () => ({ deleteOwnedNoteSubtrees: vi.fn().mockResolvedValue({}) }));
vi.mock('./cloudFileDeletionService.js', () => ({ softDeleteOwnedCloudFiles: vi.fn().mockResolvedValue({}) }));
vi.mock('./cloudFileRenameService.js', () => ({
  renameOwnedCloudFile: vi.fn().mockResolvedValue({ name: '报告.pdf' }),
}));
vi.mock('./organizeSuggestionSources.js', () => ({ readCurrentSuggestionSource: vi.fn() }));
import { applySuggestionMutation } from './organizeSuggestionActions.js';
import { readCurrentSuggestionSource } from './organizeSuggestionSources.js';
import { deleteOwnedNoteSubtrees } from './noteTreeService.js';
import { snapshotOwnedNoteVersion } from './noteService.js';
import { softDeleteOwnedCloudFiles } from './cloudFileDeletionService.js';
import { renameOwnedCloudFile } from './cloudFileRenameService.js';
import { batchWriteResourceTags } from './resourceTagWriteService.js';
const current = { type: 'note', id: '1', title: '未命名文档', version: 'v', emptyEligible: true, duplicateKey: 'hash' };
const db = (reply = () => []) => ({ query: vi.fn(async (sql, p) => [reply(sql, p)]) });
const input = (extra = {}) => ({
  userId: 'u',
  runId: 'run',
  current,
  payload: { action: 'trash' },
  kind: 'empty',
  value: { confirmTrash: true },
  ...extra,
});
beforeEach(() => vi.clearAllMocks());
it('置顶、引用或新增子页面的当前资料不能直接清理', async () => {
  for (const extra of [{ protected: true }, { unsupported: true }, { emptyEligible: false }])
    await expect(applySuggestionMutation(db(), input({ current: { ...current, ...extra } }))).rejects.toMatchObject({
      code: 'ORGANIZE_NOTE_PROTECTED',
    });
  expect(deleteOwnedNoteSubtrees).not.toHaveBeenCalled();
});
it('每次清理单独确认，并复用子树零子页面检查与回收站', async () => {
  await expect(applySuggestionMutation(db(), input({ value: {} }))).rejects.toMatchObject({
    code: 'ORGANIZE_CLEANUP_CONFIRM_REQUIRED',
  });
  const c = db();
  expect(await applySuggestionMutation(c, input())).toMatchObject({ deleted: true });
  expect(deleteOwnedNoteSubtrees).toHaveBeenCalledWith(c, {
    userId: 'u',
    items: [{ id: '1', expectedDescendantCount: 0 }],
  });
});
it('新增引用阻止清理', async () => {
  await expect(
    applySuggestionMutation(
      db((sql) => (sql.includes('note_resource_refs') ? [{ target_id: '1' }] : [])),
      input(),
    ),
  ).rejects.toMatchObject({ code: 'ORGANIZE_NOTE_PROTECTED' });
  expect(deleteOwnedNoteSubtrees).not.toHaveBeenCalled();
});
it('重复组成员外部删除或正文变化后不能继续清理', async () => {
  const args = input({
    kind: 'duplicate',
    payload: {
      action: 'trash',
      members: [
        { id: '1', type: 'note', version: 'v' },
        { id: '2', type: 'note', version: 'v' },
      ],
    },
  });
  readCurrentSuggestionSource.mockResolvedValueOnce(null);
  await expect(applySuggestionMutation(db(), args)).rejects.toMatchObject({ code: 'ORGANIZE_DUPLICATE_CHANGED' });
  readCurrentSuggestionSource.mockResolvedValueOnce({ version: 'new', duplicateKey: 'changed' });
  await expect(applySuggestionMutation(db(), args)).rejects.toMatchObject({ code: 'ORGANIZE_DUPLICATE_CHANGED' });
  expect(deleteOwnedNoteSubtrees).not.toHaveBeenCalled();
});
it('本轮已清理其他成员后，至少保留一份正文', async () => {
  readCurrentSuggestionSource.mockResolvedValue(null);
  const c = db((sql) => (sql.includes("status='applied'") ? [{ id: 'applied' }] : []));
  await expect(
    applySuggestionMutation(
      c,
      input({
        kind: 'duplicate',
        payload: {
          action: 'trash',
          members: [
            { id: '1', type: 'note' },
            { id: '2', type: 'note', version: 'v' },
          ],
        },
      }),
    ),
  ).rejects.toMatchObject({ code: 'ORGANIZE_KEEP_ONE_REQUIRED' });
});
it('疑似重复文件不提供清理动作，零字节才复用文件回收站', async () => {
  const file = { ...current, type: 'file' };
  await expect(
    applySuggestionMutation(db(), input({ current: file, kind: 'duplicate', payload: { action: null } })),
  ).rejects.toMatchObject({ code: 'ORGANIZE_CLEANUP_CONFIRM_REQUIRED' });
  const c = db();
  await applySuggestionMutation(c, input({ current: file }));
  expect(softDeleteOwnedCloudFiles).toHaveBeenCalledWith(c, { userId: 'u', fileIds: [1] });
});
it('标题写入保存笔记版本，文件名称走保留扩展名的共享服务', async () => {
  const c = db();
  await applySuggestionMutation(c, input({ kind: 'title', value: 'Vue 组件通信' }));
  expect(snapshotOwnedNoteVersion).toHaveBeenCalledWith(c, { userId: 'u', noteId: '1', reason: 'organize_title' });
  expect(c.query.mock.calls.some(([sql]) => sql.includes('revision=revision+1'))).toBe(true);
  await applySuggestionMutation(c, input({ kind: 'title', current: { ...current, type: 'file' }, value: '报告' }));
  expect(renameOwnedCloudFile).toHaveBeenCalledWith(c, { userId: 'u', id: '1', name: '报告', preserveExtension: true });
});
it('标签复用统一写入服务，新标签只在应用时创建', async () => {
  const c = db();
  await applySuggestionMutation(c, input({ kind: 'tags', value: [{ id: null, name: 'Vue' }] }));
  expect(batchWriteResourceTags).toHaveBeenCalledWith(c, {
    userId: 'u',
    items: [{ type: 'note', id: '1' }],
    tagIds: ['new'],
    action: 'add',
    source: 'manual',
  });
});

it('正文存档应用与建议共用事务，不在事务内抓取外网', async () => {
  const c = db();
  enqueueBookmarkArchiveInTransaction.mockResolvedValue({ ok: true, status: 'pending' });
  expect(
    await applySuggestionMutation(
      c,
      input({ current: { type: 'bookmark', id: 'b' }, kind: 'archive', payload: { action: 'archive' } }),
    ),
  ).toEqual({ applied: 'queued' });
  expect(enqueueBookmarkArchiveInTransaction).toHaveBeenCalledWith(c, 'u', 'b');
});
it('已有正文不重复排队；其他资源不能提交网页存档', async () => {
  enqueueBookmarkArchiveInTransaction.mockClear();
  expect(
    await applySuggestionMutation(
      db(),
      input({
        current: { type: 'bookmark', id: 'b', hasArchive: true },
        kind: 'archive',
        payload: { action: 'archive' },
      }),
    ),
  ).toEqual({ applied: 'already_saved' });
  expect(enqueueBookmarkArchiveInTransaction).not.toHaveBeenCalled();
  await expect(
    applySuggestionMutation(db(), input({ kind: 'archive', payload: { action: 'archive' } })),
  ).rejects.toMatchObject({ code: 'ORGANIZE_ARCHIVE_UNSUPPORTED' });
});
it('入队失败不把建议误标为已应用', async () => {
  enqueueBookmarkArchiveInTransaction.mockResolvedValue({ ok: false, msg: '队列满' });
  await expect(
    applySuggestionMutation(
      db(),
      input({ current: { type: 'bookmark', id: 'b' }, kind: 'archive', payload: { action: 'archive' } }),
    ),
  ).rejects.toMatchObject({ code: 'ORGANIZE_ARCHIVE_QUEUE_FAILED' });
});
