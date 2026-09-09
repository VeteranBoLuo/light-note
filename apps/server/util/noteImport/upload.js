import fs from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { NOTE_IMPORT_EXTENSIONS, NOTE_IMPORT_LIMITS } from '@lightnote/shared/note-transfer';
import { importError } from './storage.js';

export async function receiveImportUpload(req, res, directory, limits = NOTE_IMPORT_LIMITS) {
  const requestLimit = limits.uploadBytes + 1024 * 1024;
  if (Number(req.headers['content-length'] || 0) > requestLimit)
    throw importError('NOTE_IMPORT_UPLOAD_LIMIT', 413);
  // Keep the request paused while preparing storage. Adding a data listener before
  // this await consumes small uploads before Multer can attach its parser.
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const upload = multer({
    dest: directory,
    limits: { fileSize: limits.uploadBytes, files: limits.documents, fields: 0 },
    fileFilter: (_req, file, cb) =>
      NOTE_IMPORT_EXTENSIONS.includes(path.extname(file.originalname).toLowerCase())
        ? cb(null, true)
        : cb(importError('NOTE_IMPORT_UNSUPPORTED_FORMAT')),
  }).array('files', limits.documents);
  let receivedBytes = 0;
  const countBytes = (chunk) => {
    receivedBytes += chunk.length;
    if (receivedBytes > requestLimit) req.destroy();
  };
  try {
    await new Promise((resolve, reject) => {
      // No asynchronous gap between enabling flow and attaching Multer.
      req.on('data', countBytes);
      upload(req, res, (error) => (error ? reject(error) : resolve()));
    });
  } catch (error) {
    if (error.message === 'Unexpected end of form') throw importError('NOTE_IMPORT_UPLOAD_INCOMPLETE');
    if (['LIMIT_FILE_SIZE', 'LIMIT_FILE_COUNT', 'LIMIT_FIELD_COUNT'].includes(error.code))
      throw importError('NOTE_IMPORT_UPLOAD_LIMIT', 413);
    throw error;
  } finally {
    req.off('data', countBytes);
  }
}
