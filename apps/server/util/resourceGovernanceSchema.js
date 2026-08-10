import pool from '../db/index.js';

const CREATE_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS resource_governance_scans (
    id varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
    created_by varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
    status varchar(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'pending',
    scope_json json NOT NULL,
    summary_json json DEFAULT NULL,
    cursor_json json DEFAULT NULL,
    lease_owner varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    lease_expires_at datetime DEFAULT NULL,
    started_at datetime DEFAULT NULL,
    heartbeat_at datetime DEFAULT NULL,
    finished_at datetime DEFAULT NULL,
    last_error_code varchar(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
    create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_resource_governance_scans_status (status, lease_expires_at, create_time),
    KEY idx_resource_governance_scans_created (created_by, create_time)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS resource_governance_findings (
    id varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
    scan_id varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
    fingerprint char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    issue_code varchar(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    resource_type varchar(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    target_id varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    target_locator text COLLATE utf8mb4_unicode_ci,
    owner_id varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    risk_level varchar(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    state varchar(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'open',
    estimated_bytes bigint(20) unsigned NOT NULL DEFAULT '0',
    evidence_json json NOT NULL,
    observation_count int(10) unsigned NOT NULL DEFAULT '1',
    first_seen_at datetime NOT NULL,
    last_seen_at datetime NOT NULL,
    last_verified_at datetime DEFAULT NULL,
    resolution_code varchar(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
    resolved_by varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    resolved_at datetime DEFAULT NULL,
    create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_resource_governance_finding_fingerprint (fingerprint),
    KEY idx_resource_governance_findings_list (state, risk_level, resource_type, last_seen_at, id),
    KEY idx_resource_governance_findings_scan (scan_id, last_seen_at),
    KEY idx_resource_governance_findings_owner (owner_id, resource_type)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS resource_cleanup_jobs (
    id varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
    created_by varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
    risk_level varchar(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    status varchar(28) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'pending',
    total int(10) unsigned NOT NULL DEFAULT '0',
    succeeded int(10) unsigned NOT NULL DEFAULT '0',
    skipped int(10) unsigned NOT NULL DEFAULT '0',
    failed int(10) unsigned NOT NULL DEFAULT '0',
    estimated_bytes bigint(20) unsigned NOT NULL DEFAULT '0',
    released_bytes bigint(20) unsigned NOT NULL DEFAULT '0',
    confirmation_digest char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    lease_owner varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    lease_expires_at datetime DEFAULT NULL,
    started_at datetime DEFAULT NULL,
    heartbeat_at datetime DEFAULT NULL,
    finished_at datetime DEFAULT NULL,
    last_error_code varchar(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
    create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    update_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_resource_cleanup_jobs_status (status, lease_expires_at, create_time),
    KEY idx_resource_cleanup_jobs_created (created_by, create_time)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS resource_cleanup_job_items (
    job_id varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
    finding_id varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
    status varchar(28) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'pending',
    attempts int(10) unsigned NOT NULL DEFAULT '0',
    precondition_hash char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    result_code varchar(64) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
    claimed_at datetime DEFAULT NULL,
    finished_at datetime DEFAULT NULL,
    released_bytes bigint(20) unsigned NOT NULL DEFAULT '0',
    PRIMARY KEY (job_id, finding_id),
    KEY idx_resource_cleanup_job_items_claim (job_id, status, claimed_at),
    KEY idx_resource_cleanup_job_items_finding (finding_id, status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS resource_governance_audit (
    id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
    actor_user_id varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    action varchar(48) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    target_type varchar(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    target_id varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
    outcome varchar(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    summary_json json DEFAULT NULL,
    create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_resource_governance_audit_time (create_time, id),
    KEY idx_resource_governance_audit_target (target_type, target_id, create_time)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

let ensurePromise;

export function ensureResourceGovernanceSchema({ db = pool } = {}) {
  if (!ensurePromise || db !== pool) {
    const task = (async () => {
      for (const statement of CREATE_STATEMENTS) await db.query(statement);
    })();
    if (db === pool)
      ensurePromise = task.catch((error) => {
        ensurePromise = undefined;
        throw error;
      });
    else return task;
  }
  return ensurePromise;
}

export const RESOURCE_GOVERNANCE_TABLES = Object.freeze([
  'resource_governance_scans',
  'resource_governance_findings',
  'resource_cleanup_jobs',
  'resource_cleanup_job_items',
  'resource_governance_audit',
]);
