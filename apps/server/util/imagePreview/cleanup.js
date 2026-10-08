import pool from '../../db/index.js';
import {
  cloudObjectOwner,
  beginCloudObjectDeletion,
  finishCloudObjectDeletion,
} from '../services/cloudObjectPublication.js';
import { isManagedImage } from './managedImage.js';
import { localImageLocator } from './sources.js';
import { deleteObjectFromObs } from '../obsClient.js';
import { registerCloudImage, removeImageReferences } from './references.js';
export { isManagedImage };
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
  const userId = cloudObjectOwner(objectKey);
  if (!userId) {
    if (await isManagedImage('obs', objectKey)) return;
    await deleteObjectFromObs(objectKey);
    return;
  }
  const connection = await pool.getConnection();
  let claim;
  try {
    await connection.beginTransaction();
    await connection.query('SELECT id FROM user WHERE id=? FOR UPDATE', [userId]);
    claim = await beginCloudObjectDeletion(connection, userId, objectKey);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  if (!claim) return;
  await deleteObjectFromObs(objectKey);
  await finishCloudObjectDeletion(pool, claim);
}
