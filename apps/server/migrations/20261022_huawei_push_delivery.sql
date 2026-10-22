-- Additive delivery evidence only. No historical notifications are replayed.
CREATE TABLE IF NOT EXISTS huawei_push_delivery_attempts (
    id char(36) NOT NULL PRIMARY KEY,
    job_id bigint unsigned NOT NULL,
    subscription_id char(36) NOT NULL,
    generation char(36) NOT NULL,
    endpoint_hash char(64) NOT NULL,
    notification_type varchar(32) NOT NULL,
    category varchar(32) NOT NULL,
    provider_request_id varchar(128) DEFAULT NULL,
    send_status varchar(16) NOT NULL DEFAULT 'sending',
    send_code varchar(64) DEFAULT NULL,
    created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    accepted_at datetime(6) DEFAULT NULL,
    receipt_result int DEFAULT NULL,
    receipt_sub_status int DEFAULT NULL,
    receipt_at datetime(6) DEFAULT NULL,
    delivered_at datetime(6) DEFAULT NULL,
    KEY idx_huawei_attempt_job (job_id),
    KEY idx_huawei_attempt_subscription (subscription_id, created_at),
    KEY idx_huawei_attempt_created (created_at),
    CONSTRAINT fk_huawei_attempt_job FOREIGN KEY (job_id) REFERENCES browser_push_jobs(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS huawei_push_delivery_receipts (
    id char(64) NOT NULL PRIMARY KEY,
    attempt_id char(36) NOT NULL,
    provider_request_id varchar(128) NOT NULL,
    result int NOT NULL,
    sub_status int DEFAULT NULL,
    provider_timestamp bigint unsigned NOT NULL,
    received_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    KEY idx_huawei_receipt_attempt (attempt_id, provider_timestamp),
    CONSTRAINT fk_huawei_receipt_attempt FOREIGN KEY (attempt_id) REFERENCES huawei_push_delivery_attempts(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
