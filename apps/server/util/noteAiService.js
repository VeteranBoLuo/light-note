import pool from '../db/index.js';
import { parseNoteContent, renderNoteForAi } from './noteSemantic.js';
import { recognizeNoteImages } from './noteImageOcr.js';

export async function findOwnedNoteForAi({ userId, noteId = '', title = '' }) {
  if (noteId) {
    const [rows] = await pool.query(
      `SELECT id, title, content, type, create_time, update_time
         FROM note WHERE id = ? AND create_by = ? AND del_flag = 0 LIMIT 1`,
      [noteId, userId],
    );
    return rows[0] || null;
  }
  if (!title) throw new Error('ID_REQUIRED: 请提供笔记名称或笔记 ID');
  const [rows] = await pool.query(
    `SELECT id, title, content, type, create_time, update_time
       FROM note
      WHERE create_by = ? AND del_flag = 0 AND (title = ? OR title LIKE ?)
      ORDER BY (title = ?) DESC, update_time DESC LIMIT 1`,
    [userId, title, `%${title}%`, title],
  );
  return rows[0] || null;
}

export async function recognizeOwnedNoteImages({ note, document, signal, limit = 2, imageNumbers = [] }) {
  const [imageRows] = await pool.query('SELECT url FROM note_images WHERE note_id = ?', [note.id]);
  const allowedUrls = new Set(imageRows.map((row) => String(row.url || '')).filter(Boolean));
  const selectedNumbers = new Set(
    (Array.isArray(imageNumbers) ? imageNumbers : [])
      .map(Number)
      .filter((value) => Number.isInteger(value) && value > 0),
  );
  const candidates = (
    selectedNumbers.size ? document.images.filter((image) => selectedNumbers.has(Number(image.order))) : document.images
  ).slice(0, limit);
  const supported = candidates.filter((image) => allowedUrls.has(image.url));
  const unsupported = candidates
    .filter((image) => !allowedUrls.has(image.url))
    .map((image) => ({ ...image, status: 'unsupported', content: '' }));
  return [...(await recognizeNoteImages(supported, { signal, allowedUrls, limit })), ...unsupported].sort(
    (left, right) => Number(left.order || 0) - Number(right.order || 0),
  );
}

export async function buildNoteAiPayload({
  note,
  question = '',
  focus = 'all',
  taskStatus = 'all',
  maxChars = 11_000,
} = {}) {
  const document = parseNoteContent({ content: note?.content, type: note?.type });
  return {
    document,
    content: renderNoteForAi(document, {
      question,
      focus,
      taskStatus,
      maxChars,
    }),
  };
}
