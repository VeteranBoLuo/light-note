import pool from '../../db/index.js';
import { localImageLocator } from './sources.js';
import { deleteObjectFromObs } from '../obsClient.js';
import { registerCloudImage, removeImageReferences } from './references.js';
export async function isManagedImage(storage, locator, db = pool) {
  const [rows] = await db.query('SELECT id FROM image_assets WHERE storage_kind=? AND source_locator=? LIMIT 1', [
    storage,
    locator,
  ]);
  return rows.length > 0;
}
export async function protectManagedNoteImage(url) {
  const locator = localImageLocator(url);
  return locator ? isManagedImage('local', locator) : false;
}
export async function deferCloudImageDeletion(db, files) {
  for (const file of files) {
    // Register before the business record disappears, preserving durable storage identity.
    const asset = await registerCloudImage(db, file);
    if (asset) await removeImageReferences(db, 'cloud_file', [file.id]);
  }
}
export async function deleteUnmanagedObject(objectKey) {
  if (await isManagedImage('obs', objectKey)) return;
  await deleteObjectFromObs(objectKey);
}
