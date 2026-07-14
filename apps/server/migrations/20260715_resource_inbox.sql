CREATE TABLE IF NOT EXISTS resource_inbox (
  id varchar(255) NOT NULL,
  user_id varchar(255) NOT NULL,
  resource_type varchar(32) NOT NULL COMMENT 'bookmark/note/file',
  resource_id varchar(255) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'pending' COMMENT 'pending/completed',
  source varchar(32) NOT NULL DEFAULT 'quick_capture',
  create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  complete_time datetime DEFAULT NULL,
  update_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_user_resource (user_id, resource_type, resource_id),
  KEY idx_user_status_time (user_id, status, create_time),
  CONSTRAINT fk_resource_inbox_user
    FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 ROW_FORMAT=DYNAMIC COMMENT='跨资源待整理队列';
