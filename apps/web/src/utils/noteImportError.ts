/** Keep storage and parser error details out of user-facing import results. */
export function noteImportErrorKey(code: unknown): string {
  switch (code) {
    case 'ENOENT':
    case 'NOTE_IMPORT_SOURCE_UNAVAILABLE':
      return 'noteTransfer.sourceUnavailable';
    case 'NOTE_IMPORT_PARSE_TIMEOUT':
      return 'noteTransfer.parseTimeout';
    case 'NOTE_IMPORT_PARSE_FAILED':
      return 'noteTransfer.parseFailed';
    default:
      return 'noteTransfer.itemFailedHint';
  }
}
