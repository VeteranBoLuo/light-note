#!/usr/bin/env node

import pool from '../db/index.js';
import { checkBookmarkIconRuntime } from '../util/bookmarkIconRuntimeCheck.js';

try {
  const result = await checkBookmarkIconRuntime();
  if (!result.ok) {
    const failures = [
      result.schema.ok ? null : `schema:${result.schema.missing.join(',')}`,
      result.health.ok ? null : 'favicon-api:health',
      result.storage.ok ? null : 'storage:writable',
      result.probe.ok ? null : `favicon-api:probe:${result.probe.errorCode}`,
    ].filter(Boolean);
    console.error(
      '[bookmark-icon-runtime] failed checks=%s',
      failures.join('|'),
    );
    process.exitCode = 1;
  } else {
    console.log(
      '[bookmark-icon-runtime] ok source=%s contentType=%s',
      result.probe.sourceType || 'unknown',
      result.probe.contentType || 'unknown',
    );
  }
} catch (error) {
  console.error(
    '[bookmark-icon-runtime] failed code=%s',
    String(error?.code || error?.name || 'UNKNOWN'),
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
