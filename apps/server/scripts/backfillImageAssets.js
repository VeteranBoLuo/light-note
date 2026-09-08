import fs from 'node:fs/promises';
import path from 'node:path';
import pool from '../db/index.js';
import { registerAsset, syncContentReferences, registerCloudImage } from '../util/imagePreview/references.js';
import { localImageLocator } from '../util/imagePreview/sources.js';
import { extractManagedImages } from '../util/imagePreview/extract.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';

const apply = process.argv.includes('--apply');
const checkpointArg = process.argv.find((a) => a.startsWith('--checkpoint='));
const checkpoint = path.resolve(checkpointArg?.slice(13) || 'image-assets-backfill.checkpoint.json');
const phases = ['uploads', 'notes', 'versions', 'templates', 'files', 'bookmarks', 'audit'];
let state = { phase: 0, cursor: '', processed: 0 };
try {
  state = JSON.parse(await fs.readFile(checkpoint, 'utf8'));
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}
if (!Number.isInteger(state.phase) || state.phase < 0 || state.phase > phases.length)
  throw new Error('IMAGE_BACKFILL_CHECKPOINT_INVALID');
if (apply && process.env.LIGHTNOTE_RUNTIME_ENV !== 'local' && !process.argv.includes('--authorized-remote'))
  throw new Error('IMAGE_BACKFILL_REMOTE_AUTHORIZATION_REQUIRED');
const queries = {
  uploads:
    'SELECT ni.id,ni.url,n.create_by FROM note_images ni JOIN note n ON n.id=ni.note_id WHERE ni.id>? ORDER BY ni.id LIMIT 100',
  notes: 'SELECT id,create_by,content,type FROM note WHERE id>? ORDER BY id LIMIT 100',
  versions: 'SELECT id,create_by,content,type FROM note_versions WHERE id>? ORDER BY id LIMIT 100',
  templates: 'SELECT id,create_by,content,type FROM note_template WHERE id>? ORDER BY id LIMIT 100',
  files: 'SELECT * FROM files WHERE id>? ORDER BY id LIMIT 100',
  bookmarks: 'SELECT id,user_id AS create_by,icon_url FROM bookmark WHERE id>? ORDER BY id LIMIT 100',
};
async function save() {
  const temp = `${checkpoint}.tmp`;
  await fs.writeFile(temp, JSON.stringify(state), { mode: 0o600 });
  await fs.rename(temp, checkpoint);
}
try {
  if (!apply) {
    for (const phase of phases.filter((p) => p !== 'audit')) {
      const [rows] = await pool.query(queries[phase], ['']);
      console.log('[image-backfill] dry-run phase=%s sampleRows=%d', phase, rows.length);
    }
  } else {
    while (state.phase < phases.length) {
      const phase = phases[state.phase];
      if (phase === 'audit') {
        // Unknown/cross-owner shared storage remains protected. Only a completed full pass may enable collection.
        await pool.query(`UPDATE image_assets a LEFT JOIN image_assets other ON other.storage_kind=a.storage_kind
          AND other.source_locator=a.source_locator AND other.id<>a.id
          SET a.reconciled=IF(other.id IS NULL,1,0)
          WHERE a.status<>'deleting'`);
        state.phase++;
        await save();
        break;
      }
      const [rows] = await pool.query(queries[phase], [state.cursor]);
      if (!rows.length) {
        state.phase++;
        state.cursor = '';
        await save();
        continue;
      }
      for (let row of rows) {
        const c = await pool.getConnection();
        try {
          await c.beginTransaction();
          const table = {
            notes: 'note',
            versions: 'note_versions',
            templates: 'note_template',
            files: 'files',
            bookmarks: 'bookmark',
          }[phase];
          if (table) {
            const [[fresh]] = await c.query(`SELECT * FROM ${table} WHERE id=? FOR UPDATE`, [row.id]);
            if (!fresh) {
              await c.commit();
              state.cursor = String(row.id);
              await save();
              continue;
            }
            row = { ...row, ...fresh };
          }

          if (phase === 'uploads') {
            const locator = localImageLocator(row.url);
            if (locator)
              await registerAsset(c, {
                owner: row.create_by,
                sourceType: 'note_image',
                sourceId: locator,
                locator,
                storage: 'local',
              });
          } else if (phase === 'files') await registerCloudImage(c, row);
          else if (phase === 'bookmarks') {
            const locator = localImageLocator(row.icon_url);
            if (locator) {
              // Foreign or ambiguous legacy usages retain all matching assets; no preview is generated for bookmarks.
              await c.query(
                `INSERT IGNORE INTO image_asset_refs(asset_id,ref_type,ref_id)
                SELECT id,'bookmark',? FROM image_assets WHERE storage_kind='local' AND source_locator=?`,
                [String(row.id), locator],
              );
              await c.query(
                "UPDATE image_assets SET status='active',cleanup_after=NULL WHERE storage_kind='local' AND source_locator=? AND status<>'deleting'",
                [locator],
              );
            }
          } else {
            for (const url of extractManagedImages(row.content, row.type)) {
              const locator = localImageLocator(url);
              await registerAsset(c, {
                owner: row.create_by,
                sourceType: 'note_image',
                sourceId: locator,
                locator,
                storage: 'local',
              });
            }
            await syncContentReferences(c, {
              owner: row.create_by,
              refType: { notes: 'note', versions: 'note_version', templates: 'note_template' }[phase],
              refId: row.id,
              content: row.content,
              type: row.type,
            });
          }
          await c.commit();
          state.cursor = String(row.id);
          state.processed++;
          await save();
        } catch (e) {
          await c.rollback();
          throw e;
        } finally {
          c.release();
        }
      }
      console.log('[image-backfill] phase=%s processed=%d', phase, state.processed);
    }
    console.log(
      '[image-backfill] complete processed=%d; cleanup remains controlled by IMAGE_PREVIEW_CLEANUP_ENABLED',
      state.processed,
    );
  }
} catch (e) {
  console.error('[image-backfill] failed code=%s', stableAgentErrorCode(e));
  process.exitCode = 1;
} finally {
  await pool.end();
}
