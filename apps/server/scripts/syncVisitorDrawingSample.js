#!/usr/bin/env node

import pool from '../db/index.js';
import { syncVisitorDrawingSample } from '../util/services/visitorDrawingSampleService.js';

const apply = process.argv.slice(2).includes('--apply');

try {
  const result = await syncVisitorDrawingSample({ apply });
  console.log(
    '[visitor-drawing-sample] apply=%s changed=%s applied=%s revision=%s title=%s bytes=%s',
    apply,
    result.changed,
    result.applied,
    result.currentRevision,
    result.targetTitle,
    result.targetBytes,
  );
} catch (error) {
  console.error('[visitor-drawing-sample] failed code=%s', String(error?.code || error?.name || 'UNKNOWN'));
  process.exitCode = 1;
} finally {
  await pool.end();
}
