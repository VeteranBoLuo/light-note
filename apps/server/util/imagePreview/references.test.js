import { expect, it, vi } from 'vitest';
vi.mock('../../db/index.js', () => ({ default: {} }));
import { registerCloudImage } from './references.js';

it.each([
  ['photo.heic', 'image/heic'],
  ['photo.heif', 'application/octet-stream'],
  ['photo.bin', 'image/jpeg'],
])('registers %s as a candidate and leaves decoding to actual content', async (file_name, file_type) => {
  const asset = { id: 'asset', status: 'pending_delete', source_version: 'version', owner_user_id: 'owner' };
  const db = {
    query: vi.fn(async (sql) => {
      if (sql.startsWith('SELECT * FROM image_assets') || sql.startsWith('SELECT id,status FROM image_assets'))
        return [[asset]];
      if (sql.startsWith('SELECT asset_id FROM image_asset_refs')) return [[]];
      return [{ affectedRows: 1 }];
    }),
  };
  await expect(
    registerCloudImage(db, { id: 7, create_by: 'owner', obs_key: 'key', file_name, file_type }),
  ).resolves.toMatchObject({ id: 'asset' });
  expect(db.query.mock.calls.some(([sql]) => sql.startsWith('INSERT INTO file_preview_artifacts'))).toBe(true);
  expect(db.query.mock.calls.some(([sql]) => sql.startsWith('INSERT IGNORE INTO image_asset_refs'))).toBe(true);
});

it('does not treat known non-image extensions as image candidates or accept missing object keys', async () => {
  const db = { query: vi.fn() };
  expect(await registerCloudImage(db, { file_name: 'notes.txt', file_type: 'image/png', obs_key: 'key' })).toBeNull();
  expect(await registerCloudImage(db, { file_name: 'photo.heic', file_type: 'image/heic' })).toBeNull();
  expect(db.query).not.toHaveBeenCalled();
});
