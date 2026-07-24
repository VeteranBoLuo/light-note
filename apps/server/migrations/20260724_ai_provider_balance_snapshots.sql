-- AI 供应商每日余额快照（MySQL 5.7 兼容、幂等）
-- 用于后台展示“今日账户余额变化”：比较当天业务日 0 点与当前可用余额。
-- 它记录的是账户余额变化，不等同于按请求精确结算的费用；充值、赠金、退款或同账号其他系统调用也会反映在该值中。

CREATE TABLE IF NOT EXISTS ai_provider_balance_snapshots (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  provider          VARCHAR(32) NOT NULL COMMENT '供应商标识，例如 deepseek',
  currency          CHAR(3) NOT NULL COMMENT '余额币种，例如 CNY/USD',
  snapshot_day      CHAR(8) NOT NULL COMMENT 'Asia/Shanghai 业务日 YYYYMMDD',
  snapshot_kind     VARCHAR(16) NOT NULL DEFAULT 'midnight' COMMENT 'midnight | bootstrap',
  snapshot_at       DATETIME NOT NULL COMMENT '实际采样时间',
  total_balance     DECIMAL(18,6) NOT NULL DEFAULT 0 COMMENT '总可用余额',
  granted_balance   DECIMAL(18,6) NOT NULL DEFAULT 0 COMMENT '赠金余额',
  topped_up_balance DECIMAL(18,6) NOT NULL DEFAULT 0 COMMENT '充值余额',
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ai_provider_balance_snapshot_day (provider, currency, snapshot_day),
  KEY idx_ai_provider_balance_snapshot_day (snapshot_day, provider)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI 供应商每日账户余额快照';
