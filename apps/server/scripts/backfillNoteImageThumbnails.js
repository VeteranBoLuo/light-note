import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import pool from '../db/index.js';
import { extractNoteCardPreviewImage } from '../util/noteCardPreview.js';
import { ensureNoteImageThumbnail, thumbnailKeyForNoteImageUrl } from '../util/noteImageThumbnail.js';

const execFileAsync = promisify(execFile);
const BATCH_SIZE = 100;

async function assertThumbnailRuntime() {
  const bin = String(process.env.NOTE_IMAGE_MAGICK_BIN || process.env.AI_OCR_MAGICK_BIN || 'convert').trim();
  try {
    await execFileAsync(bin, ['-version'], { timeout: 5_000, maxBuffer: 256 * 1024, windowsHide: true });
    const { stdout = '' } = await execFileAsync(bin, ['-list', 'format'], {
      timeout: 8_000,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
    });
    if (!/^\s*WEBP\*?\s+WEBP\s+rw[+-]/imu.test(stdout)) {
      throw new Error('NOTE_THUMBNAIL_WEBP_UNAVAILABLE');
    }
  } catch (error) {
    const wrapped = new Error('NOTE_THUMBNAIL_RUNTIME_UNAVAILABLE');
    wrapped.code = 'NOTE_THUMBNAIL_RUNTIME_UNAVAILABLE';
    wrapped.cause = error;
    throw wrapped;
  }
}

async function main() {
  await assertThumbnailRuntime();
  let cursor = '';
  let scanned = 0;
  let candidates = 0;
  let ready = 0;
  let failed = 0;
  let skipped = 0;

  while (true) {
    const [rows] = await pool.query(
      `SELECT n.id, n.type, LEFT(COALESCE(n.content, ''), 4000) AS content
         FROM note n
        WHERE n.id > ?
          AND n.del_flag = 0
        ORDER BY n.id
        LIMIT ?`,
      [cursor, BATCH_SIZE],
    );
    if (!rows.length) break;
    const inspectedRows = rows.map((row) => ({
      noteId: String(row.id),
      sourceUrl: extractNoteCardPreviewImage(row.content, row.type),
    }));
    const batchCandidates = inspectedRows.filter((item) => item.sourceUrl);
    candidates += batchCandidates.length;

    let registeredKeys = new Set();
    if (batchCandidates.length) {
      const noteIds = [...new Set(batchCandidates.map((item) => item.noteId))];
      const [registeredRows] = await pool.query(
        `SELECT note_id, url
           FROM note_images
          WHERE note_id IN (${noteIds.map(() => '?').join(',')})`,
        noteIds,
      );
      registeredKeys = new Set(
        registeredRows
          .map((row) => `${String(row.note_id)}:${thumbnailKeyForNoteImageUrl(row.url)}`)
          .filter((value) => !value.endsWith(':')),
      );
    }

    for (const row of inspectedRows) {
      scanned += 1;
      const key = thumbnailKeyForNoteImageUrl(row.sourceUrl);
      if (!key || !registeredKeys.has(`${row.noteId}:${key}`)) {
        skipped += 1;
        continue;
      }
      const thumbnail = await ensureNoteImageThumbnail(row.sourceUrl);
      if (thumbnail) ready += 1;
      else failed += 1;
    }
    cursor = String(rows.at(-1).id);
    console.log(
      '[note-thumbnail-backfill] scanned=%d candidates=%d ready=%d skipped=%d failed=%d',
      scanned,
      candidates,
      ready,
      skipped,
      failed,
    );
    if (rows.length < BATCH_SIZE) break;
  }

  console.log(
    '[note-thumbnail-backfill] complete scanned=%d candidates=%d ready=%d skipped=%d failed=%d',
    scanned,
    candidates,
    ready,
    skipped,
    failed,
  );
  if (failed > 0) process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  console.error('[note-thumbnail-backfill] failed code=%s', String(error?.code || 'NOTE_THUMBNAIL_BACKFILL_FAILED'));
  process.exitCode = 1;
} finally {
  await pool.end();
}
