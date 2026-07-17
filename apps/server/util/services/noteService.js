import pool from '../../db/index.js';
import { insertData } from '../agent/data.js';
import { enqueueResources } from '../resourceInbox.js';
import { triggerResourceCreateEffects } from './resourceCreateEffects.js';
import { extractNoteImageUrls, filterOwnedImageUrls } from '../noteImages.js';

const NOTE_TYPES = new Set(['html', 'markdown']);

export async function createNote({
  userId,
  userRole,
  note = {},
  addToInbox = false,
  inboxSource = 'quick_capture',
  request,
  suppressUserRewards = false,
  maxContentLength = 1_000_000,
} = {}) {
  if (!userId) throw new Error('USER_REQUIRED: 缺少用户');
  const type = note.type === 'md' ? 'markdown' : String(note.type || 'html');
  if (!NOTE_TYPES.has(type)) throw new Error('INVALID_NOTE_TYPE: 笔记类型仅支持 html 或 markdown');
  const title = String(note.title || '').trim() || '未命名文档';
  if (title.length > 255) throw new Error('TITLE_TOO_LONG: 笔记标题不能超过 255 个字符');
  const content = String(note.content || '');
  if (content.length > maxContentLength) {
    throw new Error(`CONTENT_TOO_LONG: 笔记正文不能超过 ${maxContentLength} 个字符`);
  }
  // 创建接口只接受业务字段，ID、归属、删除状态和排序均由服务端生成或使用数据库默认值。
  const data = insertData({ title, content, type, createBy: userId });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('INSERT INTO note SET ?', [data]);
    // 正文引用本站上传图片时登记引用(引用计数语义,见 util/noteImages.js):
    // 模板实例化/粘贴复用等路径创建的笔记也成为图片合法引用者,原笔记删除时不误删共享文件。
    // 只登记确属当前用户的图片,防止把他人图片锚定为自己的引用。
    const imageUrls = extractNoteImageUrls(content);
    if (imageUrls.length) {
      const ownedUrls = await filterOwnedImageUrls({ urls: imageUrls, userId, connection });
      for (const url of ownedUrls) {
        await connection.query('INSERT INTO note_images SET ?', [insertData({ noteId: data.id, url })]);
      }
    }
    if (addToInbox) {
      await enqueueResources(connection, {
        userId,
        items: [{ resourceType: 'note', resourceId: data.id }],
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
    resourceType: 'note',
    resourceId: data.id,
    suppressUserRewards,
  });
  return { id: data.id, title, type, addedToInbox: Boolean(addToInbox) };
}
