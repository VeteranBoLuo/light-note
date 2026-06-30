CREATE TABLE IF NOT EXISTS resource_tag_relations (
  tag_id varchar(255) NOT NULL,
  resource_type varchar(32) NOT NULL,
  resource_id varchar(255) NOT NULL,
  user_id varchar(255) NOT NULL,
  create_time datetime DEFAULT CURRENT_TIMESTAMP,
  source varchar(32) DEFAULT 'manual',
  confidence decimal(5, 4) DEFAULT NULL,
  PRIMARY KEY (tag_id, resource_type, resource_id) USING BTREE,
  KEY idx_resource (resource_type, resource_id) USING BTREE,
  KEY idx_user_tag (user_id, tag_id) USING BTREE,
  CONSTRAINT fk_resource_tag_tag_id FOREIGN KEY (tag_id) REFERENCES tag (id) ON DELETE CASCADE,
  CONSTRAINT fk_resource_tag_user_id FOREIGN KEY (user_id) REFERENCES user (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8 ROW_FORMAT = DYNAMIC;

INSERT IGNORE INTO resource_tag_relations (tag_id, resource_type, resource_id, user_id, source)
SELECT r.tag_id, 'bookmark', r.bookmark_id, b.user_id, 'migration'
FROM tag_bookmark_relations r
INNER JOIN bookmark b ON b.id = r.bookmark_id
INNER JOIN tag t ON t.id = r.tag_id;

INSERT INTO tag (name, user_id, sort)
SELECT nt.name, nt.user_id, 0
FROM note_tags nt
LEFT JOIN tag t ON t.user_id = nt.user_id AND t.name = nt.name AND t.del_flag = 0
WHERE t.id IS NULL
GROUP BY nt.user_id, nt.name;

INSERT IGNORE INTO resource_tag_relations (tag_id, resource_type, resource_id, user_id, source)
SELECT tm.id, 'note', ntr.note_id, n.create_by, 'migration'
FROM note_tag_relations ntr
INNER JOIN note n ON n.id = ntr.note_id
INNER JOIN note_tags nt ON nt.id = ntr.tag_id
INNER JOIN (
  SELECT user_id, name, MIN(id) AS id
  FROM tag
  WHERE del_flag = 0
  GROUP BY user_id, name
) tm ON tm.user_id = nt.user_id AND tm.name = nt.name;
