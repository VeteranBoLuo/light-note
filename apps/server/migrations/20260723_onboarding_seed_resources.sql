-- 系统示例资源来源标记：成长统计永久排除注册时自动生成的内容。
-- MySQL 5.7 兼容、可重复执行；先建表，再从现有 onboarding 标签关系回填。

CREATE TABLE IF NOT EXISTS onboarding_seed_resources (
  user_id varbinary(255) NOT NULL,
  resource_type varchar(32) NOT NULL,
  resource_id varbinary(255) NOT NULL,
  seed_version varchar(32) NOT NULL DEFAULT 'v1',
  create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, resource_type, resource_id),
  KEY idx_onboarding_resource (resource_type, resource_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='注册时系统自动生成的示例资源，不计入成长和运营统计';

INSERT IGNORE INTO onboarding_seed_resources
  (user_id, resource_type, resource_id, seed_version)
SELECT DISTINCT user_id, resource_type, resource_id, 'v1'
FROM resource_tag_relations
WHERE source = 'onboarding'
  AND resource_type IN ('bookmark', 'note', 'file');

INSERT IGNORE INTO onboarding_seed_resources
  (user_id, resource_type, resource_id, seed_version)
SELECT DISTINCT user_id, 'tag', tag_id, 'v1'
FROM resource_tag_relations
WHERE source = 'onboarding';

-- 旧版统计可能已把纯示例资源固化为“首次创建”成就。
-- 只删除零积分的解锁标记；已领取奖励的不逆向扣分，也不影响拥有真实资源的用户。
DELETE pl
FROM points_log pl
WHERE pl.reason = 'ach_unlock'
  AND pl.delta = 0
  AND pl.ref = 'first_bookmark'
  AND EXISTS (
    SELECT 1
    FROM onboarding_seed_resources seeded
    WHERE seeded.user_id = pl.user_id
      AND seeded.resource_type = 'bookmark'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM bookmark b
    WHERE BINARY b.user_id = BINARY pl.user_id
      AND NOT EXISTS (
        SELECT 1
        FROM onboarding_seed_resources osr
        WHERE osr.user_id = b.user_id
          AND osr.resource_type = 'bookmark'
          AND osr.resource_id = b.id
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM growth_events ge
    WHERE BINARY ge.user_id = BINARY pl.user_id
      AND ge.source = 'bookmark'
      AND ge.status = 'granted'
  );

DELETE pl
FROM points_log pl
WHERE pl.reason = 'ach_unlock'
  AND pl.delta = 0
  AND pl.ref = 'first_note'
  AND EXISTS (
    SELECT 1
    FROM onboarding_seed_resources seeded
    WHERE seeded.user_id = pl.user_id
      AND seeded.resource_type = 'note'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM note n
    WHERE BINARY n.create_by = BINARY pl.user_id
      AND NOT EXISTS (
        SELECT 1
        FROM onboarding_seed_resources osr
        WHERE osr.user_id = n.create_by
          AND osr.resource_type = 'note'
          AND osr.resource_id = n.id
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM growth_events ge
    WHERE BINARY ge.user_id = BINARY pl.user_id
      AND ge.source = 'note'
      AND ge.status = 'granted'
  );

DELETE pl
FROM points_log pl
WHERE pl.reason = 'ach_unlock'
  AND pl.delta = 0
  AND pl.ref = 'first_file'
  AND EXISTS (
    SELECT 1
    FROM onboarding_seed_resources seeded
    WHERE seeded.user_id = pl.user_id
      AND seeded.resource_type = 'file'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM files f
    WHERE BINARY f.create_by = BINARY pl.user_id
      AND NOT EXISTS (
        SELECT 1
        FROM onboarding_seed_resources osr
        WHERE osr.user_id = f.create_by
          AND osr.resource_type = 'file'
          AND osr.resource_id = CAST(f.id AS CHAR)
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM growth_events ge
    WHERE BINARY ge.user_id = BINARY pl.user_id
      AND ge.source = 'file'
      AND ge.status = 'granted'
  );

SELECT resource_type, COUNT(*) AS marker_count
FROM onboarding_seed_resources
GROUP BY resource_type
ORDER BY resource_type;
