import pool from '../db/index.js';
import { assertSchema,ensureSpace } from '../util/dataExport/storage.js';
try{await assertSchema(pool);await ensureSpace();console.log('[data-export-check] ready');}
catch{console.error('[data-export-check] DATA_EXPORT_NOT_READY');process.exitCode=1;}
finally{await pool.end();}
