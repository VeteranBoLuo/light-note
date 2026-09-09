import { parseImportFiles } from './parser.js';
try {
  await parseImportFiles(process.argv[2], (progress) => {
    process.send?.({ progress });
  });
  process.send?.({ ok: true });
} catch (e) {
  process.send?.({
    errorCode:
      e.code === 'ENOENT'
        ? 'NOTE_IMPORT_SOURCE_UNAVAILABLE'
        : /^NOTE_IMPORT_/.test(e.code)
          ? e.code
          : 'NOTE_IMPORT_PARSE_FAILED',
  });
  process.exitCode = 1;
}
