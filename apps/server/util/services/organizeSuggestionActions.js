import { applyOrganizeArchive } from './organizeArchiveDraft.js';
import { normalizeName, suggestionError } from './organizeSuggestionRules.js';
import { readCurrentSuggestionSource } from './organizeSuggestionSources.js';
import { batchWriteResourceTags } from './resourceTagWriteService.js';
import { ensureTag, updateOwnedTagIcon } from './tagService.js';
import { snapshotOwnedNoteVersion } from './noteService.js';
import { deleteOwnedNoteSubtrees } from './noteTreeService.js';
import { softDeleteOwnedCloudFiles } from './cloudFileDeletionService.js';
import { renameOwnedCloudFile } from './cloudFileRenameService.js';
export async function applySuggestionMutation(c, { userId, current, payload, value, kind, runId, preparedIcon }) {
  if (kind === 'tag_icon') {
    if (current.type !== 'tag' || current.iconUrl.trim() || !preparedIcon)
      throw suggestionError('ORGANIZE_ICON_INVALID', '请选择图标，且仅能补全默认图标');
    await updateOwnedTagIcon(c, { userId, tagId: current.id, iconUrl: preparedIcon.iconUrl });
    return { applied: preparedIcon };
  }
  if (kind === 'archive') {
    if (current.type !== 'bookmark' || payload.action !== 'archive')
      throw suggestionError('ORGANIZE_ARCHIVE_UNSUPPORTED', '仅支持为书签保存网页正文');
    if (current.hasArchive) return { applied: 'already_saved' };
    return applyOrganizeArchive(c, userId, current, payload.archiveDraft);
  }
  if (kind === 'tags') {
    const requested = value ?? payload.after;
    if (!Array.isArray(requested) || !requested.length || requested.length > 3)
      throw suggestionError('ORGANIZE_TAGS_INVALID', '请选择 1 至 3 个标签');
    const selected = [],
      seen = new Set();
    for (const tag of requested) {
      let name = normalizeName(tag.name);
      const key = name.toLowerCase();
      if (!name || name.length > 32 || seen.has(key)) throw suggestionError('ORGANIZE_TAGS_INVALID', '标签名称无效');
      seen.add(key);
      let id = tag.id ? String(tag.id) : null;
      if (id) {
        const [rows] = await c.query('SELECT name FROM tag WHERE id=? AND user_id=? AND del_flag=0 FOR UPDATE', [
          id,
          userId,
        ]);
        if (!rows.length || normalizeName(rows[0].name) !== name)
          throw suggestionError('ORGANIZE_TAG_CHANGED', '标签已删除或改名', 409);
      } else {
        const ensured = await ensureTag({ userId, name, connection: c });
        id = String(ensured.id);
        name = ensured.name;
      }
      selected.push({ id, name, source: 'existing' });
    }
    await batchWriteResourceTags(c, {
      userId,
      items: [{ type: current.type, id: current.id }],
      tagIds: selected.map((t) => t.id),
      action: 'add',
      source: 'manual',
    });
    return { applied: selected };
  }
  if (kind === 'title') {
    const name = normalizeName(value ?? payload.after);
    if (!name || name.length > 255 || /[\r\n\x00]/u.test(name))
      throw suggestionError('ORGANIZE_TITLE_INVALID', '请填写有效名称');
    if (current.type === 'note') {
      await snapshotOwnedNoteVersion(c, { userId, noteId: current.id, reason: 'organize_title' });
      await c.query(
        'UPDATE note SET title=?,revision=revision+1,update_by=? WHERE id=? AND create_by=? AND del_flag=0',
        [name, userId, current.id, userId],
      );
    } else if (current.type === 'bookmark')
      await c.query('UPDATE bookmark SET name=? WHERE id=? AND user_id=? AND del_flag=0', [name, current.id, userId]);
    else {
      const result = await renameOwnedCloudFile(c, { userId, id: current.id, name, preserveExtension: true });
      return { applied: result.name, cleanup: result.cleanup };
    }
    return { applied: name };
  }
  if (!['empty', 'duplicate'].includes(kind) || payload.action !== 'trash' || value?.confirmTrash !== true)
    throw suggestionError('ORGANIZE_CLEANUP_CONFIRM_REQUIRED', '请明确确认移入回收站');
  if (current.type === 'note') {
    if (current.protected || current.unsupported || (kind === 'empty' && !current.emptyEligible))
      throw suggestionError('ORGANIZE_NOTE_PROTECTED', '资料仍被使用或已不符合清理条件', 409);
    const guardQueries = [
      [
        "SELECT target_id FROM note_resource_refs WHERE source_user_id=? AND target_type='note' AND target_id=? FOR UPDATE",
        [userId, current.id],
      ],
      [
        "SELECT target_id FROM todo_resource_refs WHERE user_id=? AND target_type='note' AND target_id=? FOR UPDATE",
        [userId, current.id],
      ],
      [
        "SELECT resource_id FROM todo_series_resource_refs WHERE user_id=? AND resource_type='note' AND resource_id=? FOR UPDATE",
        [userId, current.id],
      ],
    ];
    for (const [sql, params] of guardQueries) {
      const [rows] = await c.query(sql, params);
      if (rows.length) throw suggestionError('ORGANIZE_NOTE_PROTECTED', '资料新增了引用或待办关联', 409);
    }
    // 锁住当前分享集合；子树分享由读取层按祖先链判定。
    await c.query("SELECT id FROM note_shares WHERE owner_user_id=? AND status='active' FOR UPDATE", [userId]);
    if (kind === 'duplicate') {
      if (!payload.members?.length) throw suggestionError('ORGANIZE_DUPLICATE_CHANGED', '重复组已变化', 409);
      let remaining = 0;
      for (const member of payload.members) {
        if (member.id === current.id) continue;
        const [items] = await c.query(
          'SELECT version_hash FROM organize_suggestion_items WHERE run_id=? AND user_id=? AND resource_type=? AND resource_id=?',
          [runId, userId, member.type, member.id],
        );
        const other = await readCurrentSuggestionSource(c, userId, member.type, member.id);
        if (!other) {
          const [closed] = await c.query(
            "SELECT id FROM organize_suggestions WHERE run_id=? AND user_id=? AND kind IN ('empty','duplicate') AND status='applied' AND item_id IN (SELECT id FROM organize_suggestion_items WHERE run_id=? AND resource_type='note' AND resource_id=?)",
            [runId, userId, runId, member.id],
          );
          if (!closed.length) throw suggestionError('ORGANIZE_DUPLICATE_CHANGED', '重复组成员已变化，请重新检查', 409);
          continue;
        }
        if (other.version !== (items[0]?.version_hash || member.version) || other.duplicateKey !== current.duplicateKey)
          throw suggestionError('ORGANIZE_DUPLICATE_CHANGED', '重复组内容已变化，请重新对照', 409);
        remaining++;
      }
      if (!remaining) throw suggestionError('ORGANIZE_KEEP_ONE_REQUIRED', '至少保留一份内容', 409);
    }
    await deleteOwnedNoteSubtrees(c, { userId, items: [{ id: current.id, expectedDescendantCount: 0 }] });
  } else if (current.type === 'file' && kind === 'empty' && current.emptyEligible)
    await softDeleteOwnedCloudFiles(c, { userId, fileIds: [Number(current.id)] });
  else throw suggestionError('ORGANIZE_CLEANUP_UNSUPPORTED', '此项只提供对照提示，不支持直接清理');
  return { deleted: true, applied: 'trash' };
}
