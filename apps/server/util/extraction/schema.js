import { toolboxError } from '../toolbox/errors.js';

export const EXTRACTION_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS toolbox_extractions (
 id CHAR(36) NOT NULL, user_id VARCHAR(64) NOT NULL, request_id CHAR(36) NOT NULL, input_digest CHAR(64) NOT NULL,
 title VARCHAR(120) NOT NULL, goal VARCHAR(1000) NOT NULL DEFAULT '', status VARCHAR(24) NOT NULL DEFAULT 'preparing',
 phase VARCHAR(16) NOT NULL DEFAULT 'prepare', plan_json JSON DEFAULT NULL, version INT UNSIGNED NOT NULL DEFAULT 1,
 data_version INT UNSIGNED NOT NULL DEFAULT 1, accept_partial TINYINT(1) NOT NULL DEFAULT 0,
 lease_token CHAR(36) DEFAULT NULL, lease_until DATETIME DEFAULT NULL, dispatched TINYINT(1) NOT NULL DEFAULT 0,
 error_code VARCHAR(64) DEFAULT NULL, available_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY(id), UNIQUE KEY uk_extraction_request(user_id,request_id), KEY idx_extraction_owner(user_id,updated_at),
 KEY idx_extraction_queue(status,available_at,lease_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS toolbox_extraction_sources (
 id CHAR(36) NOT NULL, extraction_id CHAR(36) NOT NULL, user_id VARCHAR(64) NOT NULL, position SMALLINT UNSIGNED NOT NULL,
 resource_type VARCHAR(16) NOT NULL, resource_id VARCHAR(128) NOT NULL, resource_version VARCHAR(128) NOT NULL,
 title VARCHAR(255) NOT NULL DEFAULT '', status VARCHAR(24) NOT NULL DEFAULT 'preparing', source_json MEDIUMTEXT DEFAULT NULL,
 coverage_json JSON DEFAULT NULL, window_count INT UNSIGNED NOT NULL DEFAULT 0, processed_windows INT UNSIGNED NOT NULL DEFAULT 0,
 error_code VARCHAR(64) DEFAULT NULL, expires_at DATETIME NOT NULL,
 PRIMARY KEY(id), UNIQUE KEY uk_extraction_source(extraction_id,resource_type,resource_id),
 KEY idx_extraction_sources_owner(user_id), KEY idx_extraction_source_expiry(expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS toolbox_extraction_records (
 id CHAR(24) NOT NULL, extraction_id CHAR(36) NOT NULL, user_id VARCHAR(64) NOT NULL, source_id CHAR(36) NOT NULL,
 payload_json JSON NOT NULL, reviews_json JSON NOT NULL, version INT UNSIGNED NOT NULL DEFAULT 1,
 pending_cells SMALLINT UNSIGNED NOT NULL DEFAULT 0, excluded TINYINT(1) NOT NULL DEFAULT 0, published TINYINT(1) NOT NULL DEFAULT 0,
 created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(extraction_id,id), KEY idx_extraction_records_owner(user_id,extraction_id), KEY idx_extraction_records_source(source_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS toolbox_extraction_receipts (
 extraction_id CHAR(36) NOT NULL, user_id VARCHAR(64) NOT NULL, request_id CHAR(36) NOT NULL,
 digest CHAR(64) NOT NULL, response_json JSON NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(extraction_id,request_id), KEY idx_extraction_receipts_owner(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];
export async function ensureExtractionSchema(database) {
  for (const statement of EXTRACTION_SCHEMA) await database.query(statement);
}

/** Read-only check. Installation belongs to the explicit additive migration. */
export async function assertExtractionSchema(database) {
  for (const statement of [
    'SELECT id,user_id,request_id,input_digest,title,goal,status,phase,plan_json,version,data_version,accept_partial,lease_token,lease_until,dispatched,error_code,available_at,created_at,updated_at FROM toolbox_extractions LIMIT 0',
    'SELECT id,extraction_id,user_id,position,resource_type,resource_id,resource_version,title,status,source_json,coverage_json,window_count,processed_windows,error_code,expires_at FROM toolbox_extraction_sources LIMIT 0',
    'SELECT id,extraction_id,user_id,source_id,payload_json,reviews_json,version,pending_cells,excluded,published,created_at FROM toolbox_extraction_records LIMIT 0',
    'SELECT extraction_id,user_id,request_id,digest,response_json,created_at FROM toolbox_extraction_receipts LIMIT 0',
  ])
    await database.query(statement);
}

// Readiness belongs to this optional feature, not the shared API/Worker startup.
// Coalesce polling callers; expiry also allows an explicit installation to take
// effect without restarting. Do not turn connection or permission errors into
// a misleading "not installed" result.
const readiness = new WeakMap();
export function extractionSchemaReady(database) {
  const prior = readiness.get(database);
  if (prior && prior.expiresAt > Date.now()) return prior.promise;
  const entry = { expiresAt: Infinity, promise: null };
  entry.promise = assertExtractionSchema(database)
    .then(() => true)
    .catch((error) => {
      if (['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error?.code)) return false;
      readiness.delete(database);
      throw error;
    })
    .finally(() => {
      entry.expiresAt = Date.now() + 30000;
    });
  readiness.set(database, entry);
  return entry.promise;
}

export async function requireExtractionSchema(database) {
  if (!(await extractionSchemaReady(database)))
    throw toolboxError('EXTRACTION_SCHEMA_NOT_READY', '资料转表格尚未完成初始化，请联系管理员', 503);
}
