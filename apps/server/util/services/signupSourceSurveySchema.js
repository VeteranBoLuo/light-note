import { readFile } from 'node:fs/promises';
import pool from '../../db/index.js';

export async function signupSourceSurveySchemaReady(db = pool) {
  const [[row]] = await db.query(`SELECT COUNT(*) AS total FROM information_schema.columns
    WHERE table_schema=DATABASE() AND table_name='signup_source_survey'
    AND column_name IN ('id','form_id','eligible_from','after_create_time','after_user_id')`);
  if (Number(row.total) !== 5) return false;
  const [indexes] = await db.query(`SELECT table_name AS tableName,index_name AS indexName,
    GROUP_CONCAT(column_name ORDER BY seq_in_index) AS columns_list,MAX(non_unique) AS non_unique
    FROM information_schema.statistics WHERE table_schema=DATABASE()
    AND ((table_name='signup_source_survey' AND index_name='PRIMARY')
      OR (table_name='user' AND index_name='idx_user_created_list')) GROUP BY table_name,index_name`);
  return (
    indexes.some(
      (i) => i.tableName === 'signup_source_survey' && i.columns_list === 'id' && Number(i.non_unique) === 0,
    ) && indexes.some((i) => i.tableName === 'user' && i.columns_list === 'del_flag,create_time,id')
  );
}

// Explicit installer only. No DDL in registration, request or scheduler paths.
export async function migrateSignupSourceSurveySchema(db = pool) {
  const sql = await readFile(new URL('../../migrations/20261028_signup_source_survey.sql', import.meta.url), 'utf8');
  await db.query(
    sql
      .replace(/^--.*$/gm, '')
      .trim()
      .replace(/;$/, ''),
  );
}
