import pool from '../../db/index.js';
import { insertData } from '../agent/data.js';
import { fetchWebMeta } from '../fetchWebMeta.js';
import { enqueueResources } from '../resourceInbox.js';
import { RESOURCE_TYPE, insertResourceTagRelations, validateUserTags } from '../resourceTags.js';
import { archiveBookmark } from '../snapshot.js';
import { ensureTag } from './tagService.js';
import { triggerResourceCreateEffects } from './resourceCreateEffects.js';

export function normalizeBookmarkUrl(value) {
  const url = String(value || '').trim();
  if (!url) return '';
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function cleanBookmarkFields(bookmark, { userId, url, name, description }) {
  const fields = { name, url, description, userId };
  if (bookmark?.iconUrl !== undefined) fields.iconUrl = bookmark.iconUrl;
  if (bookmark?.sort !== undefined && Number.isFinite(Number(bookmark.sort))) fields.sort = Number(bookmark.sort);
  if (bookmark?.isTop !== undefined) fields.isTop = Number(bookmark.isTop) === 1 ? 1 : 0;
  return insertData(fields);
}

export async function createBookmark({
  userId,
  userRole,
  bookmark = {},
  tagIds = [],
  tagNames = [],
  tagSource = 'manual',
  addToInbox = false,
  inboxSource = 'quick_capture',
  duplicateToInbox = false,
  fillMetadata = false,
  saveSnapshot = true,
  signal,
  request,
  suppressUserRewards = false,
} = {}) {
  if (!userId) throw new Error('USER_REQUIRED: 缺少用户');
  const url = normalizeBookmarkUrl(bookmark.url);
  if (!url) throw new Error('URL_REQUIRED: 网址不能为空');
  let name = String(bookmark.name || '').trim();
  let description = String(bookmark.description || '').trim();
  if (fillMetadata && (!name || !description)) {
    const meta = await fetchWebMeta(url, { signal });
    if (meta.ok) {
      if (!name) name = String(meta.title || '').trim();
      if (!description) description = String(meta.description || '').trim();
    }
  }
  name = (name || url).slice(0, 255);
  if (url.length > 255) throw new Error('URL_TOO_LONG: 网址不能超过 255 个字符');
  description = description.slice(0, 255);
  const normalizedTagIds = Array.isArray(tagIds) ? tagIds : [];
  const normalizedTagNames = Array.isArray(tagNames) ? tagNames : [];
  if (normalizedTagIds.length + normalizedTagNames.length > 4) {
    throw new Error('TOO_MANY_TAGS: 最多选择 4 个标签');
  }

  const connection = await pool.getConnection();
  let data;
  let attachedTagNames = [];
  try {
    await connection.beginTransaction();
    const [urlDuplicates] = await connection.query(
      'SELECT id, name FROM bookmark WHERE user_id = ? AND url = ? AND del_flag = 0 LIMIT 1',
      [userId, url],
    );
    if (urlDuplicates.length) {
      if (addToInbox && duplicateToInbox) {
        const inbox = await enqueueResources(connection, {
          userId,
          items: [{ resourceType: 'bookmark', resourceId: String(urlDuplicates[0].id) }],
          source: 'duplicate_requeue',
        });
        await connection.commit();
        return {
          id: urlDuplicates[0].id,
          name: urlDuplicates[0].name,
          url,
          duplicate: true,
          addedToInbox: true,
          inbox,
          tags: [],
        };
      }
      throw new Error(`DUPLICATE_URL: 该网址已收藏为「${urlDuplicates[0].name}」`);
    }
    const [nameDuplicates] = await connection.query(
      'SELECT id FROM bookmark WHERE user_id = ? AND name = ? AND del_flag = 0 LIMIT 1',
      [userId, name],
    );
    if (nameDuplicates.length) throw new Error(`DUPLICATE_NAME: 书签「${name}」已存在`);

    data = cleanBookmarkFields(bookmark, { userId, url, name, description });
    await connection.query('INSERT INTO bookmark SET ?', [data]);

    const validTagIds = await validateUserTags(connection, { tagIds: normalizedTagIds, userId });
    const ensuredTagIds = [];
    for (const rawName of normalizedTagNames.map((item) => String(item || '').trim()).filter(Boolean)) {
      const tag = await ensureTag({ userId, name: rawName, connection });
      ensuredTagIds.push(tag.id);
      attachedTagNames.push(tag.name);
    }
    await insertResourceTagRelations(connection, {
      tagIds: [...validTagIds, ...ensuredTagIds],
      resourceType: RESOURCE_TYPE.BOOKMARK,
      resourceId: data.id,
      userId,
      source: tagSource,
    });
    if (addToInbox) {
      await enqueueResources(connection, {
        userId,
        items: [{ resourceType: 'bookmark', resourceId: data.id }],
        source: inboxSource,
      });
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  triggerResourceCreateEffects({
    request,
    userId,
    userRole,
    resourceType: 'bookmark',
    resourceId: data.id,
    url,
    suppressUserRewards,
  });
  if (saveSnapshot) archiveBookmark(userId, data.id).catch(() => {});
  return {
    id: data.id,
    name,
    url,
    tags: attachedTagNames,
    duplicate: false,
    addedToInbox: Boolean(addToInbox),
  };
}
