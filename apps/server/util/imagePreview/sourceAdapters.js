import { buildNoteCardPreview } from '../noteCardPreview.js';
import { localImageLocator, hash } from './sources.js';
import { syncNoteImageReferences, syncCloudImageById } from './references.js';
import { imageError } from './compress.js';

// Business access/retention belongs to the source adapter, never the image encoder.
// Future chat adapters must check the parent message and cap maxUrlAgeSeconds at attachment expiry.
export const imageSourceAdapters = Object.freeze({
  note: {
    flag: 'IMAGE_PREVIEW_NOTES_ENABLED',
    identity(item, owner) {
      try {
        const locator = localImageLocator(
          new URL(item.previewImageUrl, 'https://boluo66.top').searchParams.get('source') || '',
        );
        return locator ? hash(`${owner}:local:${locator}`) : '';
      } catch {
        return '';
      }
    },
    async resolve(c, owner, id, { readOnly }) {
      const [[note]] = await c.query(
        'SELECT id,content,type FROM note WHERE id=? AND create_by=? AND del_flag=0 FOR UPDATE',
        [id, owner],
      );
      if (!note) throw imageError('IMAGE_PREVIEW_NOT_FOUND');
      const locator = localImageLocator(buildNoteCardPreview(note.content, note.type)?.imageUrl || '');
      if (!locator) return { asset: null, maxUrlAgeSeconds: 600 };
      const key = hash(`${owner}:local:${locator}`);
      let [[asset]] = await c.query('SELECT * FROM image_assets WHERE identity_hash=?', [key]);
      if (!asset && !readOnly) {
        await syncNoteImageReferences(c, note.id);
        [[asset]] = await c.query('SELECT * FROM image_assets WHERE identity_hash=?', [key]);
      }
      return { asset, maxUrlAgeSeconds: 600 };
    },
  },
  cloud_file: {
    flag: 'IMAGE_PREVIEW_CLOUD_ENABLED',
    identity(item, owner) {
      return item.obsKey ? hash(`${owner}:obs:${item.obsKey}`) : '';
    },
    async resolve(c, owner, id, { readOnly }) {
      const [[file]] = await c.query(
        'SELECT id,obs_key FROM files WHERE id=? AND create_by=? AND del_flag=0 FOR UPDATE',
        [id, owner],
      );
      if (!file) throw imageError('IMAGE_PREVIEW_NOT_FOUND');
      let [[asset]] = await c.query(
        "SELECT * FROM image_assets WHERE source_type='cloud_file' AND source_id=? AND owner_user_id=? AND source_locator=?",
        [String(file.id), owner, file.obs_key],
      );
      if (!asset && !readOnly) asset = await syncCloudImageById(c, file.id);
      return { asset, maxUrlAgeSeconds: 600 };
    },
  },
});
