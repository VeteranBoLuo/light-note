import pool from '../db/index.js';
import { knowledgeManorSchemaReady, migrateKnowledgeManorSchema } from '../util/services/knowledgeManorSchema.js';

try {
  if (!process.argv.includes('--check')) await migrateKnowledgeManorSchema(pool);
  if (!(await knowledgeManorSchemaReady(pool))) throw new Error('KNOWLEDGE_MANOR_SCHEMA_MISSING');
  console.log('Knowledge Manor additive schema ready; no balances or accounts changed.');
} catch {
  console.error('KNOWLEDGE_MANOR_MIGRATION_FAILED');
  process.exitCode = 1;
} finally {
  await pool.end();
}
