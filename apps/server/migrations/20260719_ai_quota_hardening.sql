-- AI 配额安全加固：请求级占位/结算状态机。
--
-- 目标：
-- 1. reserve 与 reconcile 通过 reservation_key 幂等绑定，重复请求或重复结算不会重复扣减/退还；
-- 2. 配额主账本继续使用 ai_token_usage，游客 subject_key 只写服务端 HMAC 摘要；
-- 3. 配额不依赖 Redis，Redis 故障不会导致 AI Provider 绕过额度；
-- 4. 迁移必须先于新版后端启动；表缺失时新版后端会失败关闭 AI 调用。
--
-- 幂等：CREATE TABLE IF NOT EXISTS，可重复执行。
CREATE TABLE IF NOT EXISTS ai_token_reservations (
  id                BIGINT       NOT NULL AUTO_INCREMENT,
  reservation_key   CHAR(64)     NOT NULL COMMENT '服务端请求键与额度主体的 SHA-256 摘要',
  period_key         CHAR(8)      NOT NULL COMMENT 'YYYYMMDD',
  status             VARCHAR(16)  NOT NULL COMMENT 'pending | reserved | blocked | reconciled',
  subjects_json      TEXT         NOT NULL COMMENT '额度主体快照；游客标识仅保存 HMAC 摘要',
  reserved_tokens    BIGINT       NOT NULL DEFAULT 0,
  actual_tokens      BIGINT       DEFAULT NULL,
  created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ai_token_reservation_key (reservation_key),
  KEY idx_ai_token_reservation_period_status (period_key, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 配额请求级幂等占位与结算状态机';

-- 保留期建议：结算/拒绝记录只用于短期幂等与故障审计，可由日志清理任务保留 7 天。
-- DELETE FROM ai_token_reservations
--  WHERE period_key < DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 7 DAY), '%Y%m%d');

-- 旧版 subject_type='fingerprint' 的行可能含客户端原始指纹或 IP。
-- 完成灰度观察并确认无需追溯后，可由 DBA 单独批准清理；本迁移不执行破坏性删除。
-- DELETE FROM ai_token_usage WHERE subject_type = 'fingerprint';
