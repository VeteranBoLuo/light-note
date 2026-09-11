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
  if (await isManagedImage('obs', objectKey)) return;
  await deleteObjectFromObs(objectKey);
}
