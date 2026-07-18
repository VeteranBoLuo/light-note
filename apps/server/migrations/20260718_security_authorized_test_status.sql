-- 2026-07-18 安全事件新增“授权测试”处置状态。
-- 可重复执行：先兼容历史状态，再统一到当前枚举，避免旧环境直接收窄 ENUM 失败。

ALTER TABLE security_events
  MODIFY COLUMN handled_status
  ENUM('unhandled','processed','confirmed','false_positive','authorized_test','ignored','resolved')
  DEFAULT 'unhandled';

UPDATE security_events
SET handled_status = 'processed'
WHERE handled_status IN ('confirmed','ignored','resolved');

ALTER TABLE security_events
  MODIFY COLUMN handled_status
  ENUM('unhandled','processed','false_positive','authorized_test')
  DEFAULT 'unhandled';
