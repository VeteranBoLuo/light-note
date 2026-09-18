import fs from 'node:fs/promises';
import pool from '../../db/index.js';
import { validateCommunityChatImage } from '../services/communityChatImageService.js';
import { putObjectToObs, deleteObjectFromObs, createDownloadSignedUrl } from '../obsClient.js';
import { access, first, fail, publicId, loadPost, strictFields } from './core.js';

import { communityFeedSchemaReady } from './schema.js';
import { COMMUNITY_IMAGE_SCHEMA } from './schemaContract.js';
export function imagesReady(db = pool) {
  return communityFeedSchemaReady(db, COMMUNITY_IMAGE_SCHEMA);
}
export function imageDto(row, postId, revision) {
  return {
    publicId: row.public_id,
    url: `/api/community/images/${row.public_id}${postId ? `?postId=${postId}&revision=${revision}` : ''}`,
    width: Number(row.width),
    height: Number(row.height),
    fileSize: Number(row.file_size),
    contentType: row.content_type,
  };
}
export async function uploadImage({ user, input, file, db = pool, env = process.env, putObject = putObjectToObs }) {
  try {
    await access(db, user, { env, write: true });
    if (!(await imagesReady(db))) fail('COMMUNITY_IMAGES_UNAVAILABLE', 503);
    strictFields(input, ['requestId']);
    const id = publicId(input.requestId);
    let info;
    try {
      info = await validateCommunityChatImage(file);
    } catch {
      fail('COMMUNITY_IMAGE_INVALID', 400);
    }
    const objectKey = `community-feed/${id}.${info.extension}`;
    const c = await db.getConnection();
    let existing;
    try {
      await c.beginTransaction();
      await access(c, user, { env, write: true, lock: true });
      existing = await first(c, 'SELECT * FROM community_post_images WHERE public_id=? FOR UPDATE', [id]);
      if (existing) {
        if (existing.owner_id !== user.id || existing.content_hash !== info.contentSha256)
          fail('COMMUNITY_REQUEST_REUSED', 409);
        if (existing.status !== 'ready') fail('COMMUNITY_UPLOAD_PENDING', 409);
      } else {
        const pending = await first(
          c,
          "SELECT COUNT(*) AS count FROM community_post_images WHERE owner_id=? AND post_id IS NULL AND status IN ('uploading','ready') AND created_at>=DATE_SUB(NOW(),INTERVAL 24 HOUR)",
          [user.id],
        );
        if (Number(pending.count) >= 24) fail('COMMUNITY_IMAGE_PENDING_LIMIT', 429);
        await c.query(
          'INSERT INTO community_post_images (public_id,owner_id,object_key,content_type,content_hash,file_size,width,height) VALUES (?,?,?,?,?,?,?,?)',
          [id, user.id, objectKey, info.contentType, info.contentSha256, info.fileSize, info.width, info.height],
        );
      }
      await c.commit();
    } catch (error) {
      await c.rollback();
      throw error;
    } finally {
      c.release();
    }
    if (existing) return imageDto(existing);
    try {
      await putObject(objectKey, file.path, info.contentType);
      const [result] = await db.query(
        "UPDATE community_post_images SET status='ready' WHERE public_id=? AND status='uploading'",
        [id],
      );
      if (result.affectedRows !== 1) fail('COMMUNITY_UPLOAD_PENDING', 409);
    } catch (error) {
      await db.query(
        "UPDATE community_post_images SET status='delete_pending' WHERE public_id=? AND status='uploading'",
        [id],
      );
      throw error;
    }
    return imageDto({
      public_id: id,
      width: info.width,
      height: info.height,
      file_size: info.fileSize,
      content_type: info.contentType,
    });
  } finally {
    if (file?.path) await fs.unlink(file.path).catch(() => {});
  }
}
export async function bindImages(c, post, revisionId, ids) {
  if (!ids.length) return;
  if (!(await imagesReady(c))) fail('COMMUNITY_IMAGES_UNAVAILABLE', 503);
  for (const [index, id] of ids.entries()) {
    const row = await first(c, 'SELECT * FROM community_post_images WHERE public_id=? FOR UPDATE', [id]);
    if (
      !row ||
      row.owner_id !== post.author_id ||
      row.status !== 'ready' ||
      (row.post_id && Number(row.post_id) !== Number(post.id))
    )
      fail('COMMUNITY_IMAGE_UNAVAILABLE', 409);
    await c.query('UPDATE community_post_images SET post_id=? WHERE public_id=?', [post.id, id]);
    await c.query('INSERT INTO community_revision_images (revision_id,image_id,sort_order) VALUES (?,?,?)', [
      revisionId,
      id,
      index,
    ]);
  }
}
export async function revisionImages(db, revisionIds) {
  if (!revisionIds.length || !(await imagesReady(db))) return [];
  const [rows] = await db.query(
    `SELECT i.*,ri.revision_id,ri.sort_order FROM community_revision_images ri JOIN community_post_images i ON i.public_id=ri.image_id WHERE ri.revision_id IN (${revisionIds.map(() => '?').join(',')}) AND i.status='ready' ORDER BY ri.sort_order`,
    revisionIds,
  );
  return rows;
}
export async function readImage({
  user,
  id,
  input = {},
  db = pool,
  env = process.env,
  sign = createDownloadSignedUrl,
}) {
  const account = await access(db, user, { env });
  const row = await first(db, "SELECT * FROM community_post_images WHERE public_id=? AND status='ready'", [
    publicId(id),
  ]);
  if (!row) fail('COMMUNITY_IMAGE_UNAVAILABLE', 404);
  if (input.postId) {
    const privileged = row.owner_id === user?.id || account?.role === 'root';
    const post = await loadPost(db, input.postId, user, {
      owner: row.owner_id === user?.id,
      moderator: account?.role === 'root',
    });
    const revision = await first(
      db,
      'SELECT r.id FROM community_post_revisions r JOIN community_revision_images ri ON ri.revision_id=r.id WHERE r.post_id=? AND r.revision_no=? AND ri.image_id=?',
      [post.id, Number(input.revision), row.public_id],
    );
    if (!revision || (!privileged && Number(post.published_revision_id) !== Number(revision.id)))
      fail('COMMUNITY_IMAGE_UNAVAILABLE', 404);
  } else if (row.owner_id !== user?.id) fail('COMMUNITY_IMAGE_UNAVAILABLE', 404);
  return { ...row, signedUrl: sign({ objectKey: row.object_key, expires: 60 }).url };
}
export async function discardImage({ user, id, db = pool, env = process.env }) {
  await access(db, user, { env, ownSafety: true });
  await db.query(
    "UPDATE community_post_images SET status='delete_pending' WHERE public_id=? AND owner_id=? AND post_id IS NULL",
    [publicId(id), user.id],
  );
  return { discarded: true };
}
export async function cleanupImages({ db = pool, deleteObject = deleteObjectFromObs } = {}) {
  if (!(await imagesReady(db))) return;
  await db.query(
    "UPDATE community_post_images SET status='delete_pending' WHERE post_id IS NULL AND created_at<DATE_SUB(NOW(),INTERVAL 24 HOUR)",
  );
  const [rows] = await db.query(
    "SELECT public_id,object_key FROM community_post_images WHERE status='delete_pending' LIMIT 50",
  );
  for (const row of rows) {
    await deleteObject(row.object_key);
    await db.query("DELETE FROM community_post_images WHERE public_id=? AND status='delete_pending'", [row.public_id]);
  }
}
