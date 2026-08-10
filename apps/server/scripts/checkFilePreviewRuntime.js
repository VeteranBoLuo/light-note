#!/usr/bin/env node

import pool from '../db/index.js';
import { checkFilePreviewRuntime } from '../util/filePreview/runtimeCheck.js';

try {
  const result = await checkFilePreviewRuntime();
  if (!result.ok) {
    const failures = [
      result.schema.ok ? null : `schema:${result.schema.missing.join(',')}`,
      !result.runtimes.archive.config.archiveEnabled || result.runtimes.archive.ready
        ? null
        : `archive:${result.runtimes.archive.errorCode}`,
      !result.runtimes.office.config.officeEnabled || result.runtimes.office.ready
        ? null
        : `office:${result.runtimes.office.errorCode}`,
    ].filter(Boolean);
    console.error('[file-preview-runtime] failed checks=%s', failures.join('|'));
    process.exitCode = 1;
  } else {
    console.log(
      '[file-preview-runtime] ok archive=%s office=%s',
      result.runtimes.archive.config.archiveEnabled ? result.runtimes.archive.bin : 'disabled',
      result.runtimes.office.config.officeEnabled ? result.runtimes.office.bin : 'disabled',
    );
  }
} catch (error) {
  console.error('[file-preview-runtime] failed code=%s', String(error?.code || error?.name || 'UNKNOWN'));
  process.exitCode = 1;
} finally {
  await pool.end();
}
