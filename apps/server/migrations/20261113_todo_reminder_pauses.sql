CREATE TABLE IF NOT EXISTS todo_reminder_pauses (
  owner_id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci NOT NULL,
  target_id char(36) NOT NULL COMMENT '单条待办 ID 或重复系列 ID',
  paused_from_utc datetime NOT NULL,
  paused_until_utc datetime NOT NULL COMMENT '恢复边界，保留以跳过尚未领取的旧提醒',
  PRIMARY KEY (owner_id, target_id),
  CONSTRAINT fk_todo_reminder_pause_user FOREIGN KEY (owner_id) REFERENCES user(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC COMMENT='待办提醒暂停期限';
