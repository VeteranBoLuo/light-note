import pool from '../db/index.js';
import {
  knowledgeManorAdminSchemaReady,
  migrateKnowledgeManorAdminSchema,
} from '../util/services/knowledgeManorAdminSchema.js';

try {
  if (!process.argv.includes('--check') && !process.argv.includes('--start-observation'))
    await migrateKnowledgeManorAdminSchema(pool);
  if (!(await knowledgeManorAdminSchemaReady(pool))) throw new Error('SCHEMA_MISSING');
  // Run only after the new API is deployed and verified. Schema installation does not declare collection coverage.
  if (process.argv.includes('--start-observation'))
    await pool.query(
      'UPDATE knowledge_manor_runtime SET coverage_started_at=NOW() WHERE id=1 AND coverage_started_at IS NULL',
    );
  console.log('Knowledge Manor admin schema ready; no player balances or inventories changed.');
} catch {
  console.error('KNOWLEDGE_MANOR_ADMIN_SCHEMA_FAILED');
  process.exitCode = 1;
} finally {
  await pool.end();
}
