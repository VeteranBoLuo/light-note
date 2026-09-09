import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const importRoot = path.resolve(
  process.env.NOTE_IMPORT_STORAGE_DIR || fileURLToPath(new URL('../../.runtime/note-imports', import.meta.url)),
);
export function taskDirectory(id) {
  if (!/^[a-f0-9-]{36}$/i.test(String(id)))
    throw Object.assign(new Error('NOTE_IMPORT_INVALID_ID'), { code: 'NOTE_IMPORT_INVALID_ID' });
  return path.join(importRoot, id);
}
export async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
  await fs.rename(temporary, file);
}
export const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
export function importError(code, status = 400) {
  return Object.assign(new Error(code), { code, status });
}
