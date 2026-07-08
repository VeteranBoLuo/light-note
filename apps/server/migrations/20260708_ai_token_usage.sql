-- AI token 用量计数表(限流用)
-- 与 agent_logs(事后完整审计)互补:本表做「请求前占位 + 原子累加」的限流计数器,
-- 支持按 user / fingerprint / visitor_global 三种主体计数(agent_logs 无 fp/ip 列、游客全是同一 visitor,无法按个体计)。
-- P0-A 灰度阶段仅"只记录不拦截"(dry-run),用于观测真实用量;P1 开启 enforce 后据此按等级限流。
-- 幂等:CREATE TABLE IF NOT EXISTS;由 DBA(站长)手动执行,无 auto-runner。
CREATE TABLE IF NOT EXISTS ai_token_usage (
  id           BIGINT       NOT NULL AUTO_INCREMENT,
  subject_type VARCHAR(16)  NOT NULL COMMENT 'user | fingerprint | visitor_global',
  subject_key  VARCHAR(128) NOT NULL COMMENT 'user_id / 指纹或IP / all',
  period_type  VARCHAR(8)   NOT NULL COMMENT 'day | month',
  period_key   CHAR(8)      NOT NULL COMMENT 'YYYYMMDD / YYYYMM(月补两位下划线)',
  tokens_used  BIGINT       NOT NULL DEFAULT 0,
  call_count   INT          NOT NULL DEFAULT 0,
  updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_subject_period (subject_type, subject_key, period_type, period_key)
) COMMENT 'AI token 限流计数(P0-A 先 dry-run 观测)';

-- 过期行清理示例(挂后台「日志清理」或定时任务,隐私合规:计数过期即删):
-- DELETE FROM ai_token_usage WHERE period_type='day'   AND period_key < DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 7 DAY), '%Y%m%d');
-- DELETE FROM ai_token_usage WHERE period_type='month' AND period_key < CONCAT(DATE_FORMAT(DATE_SUB(NOW(), INTERVAL 1 MONTH), '%Y%m'), '__');
