-- 支持者榜默认公开轻笺昵称与头像。
-- 既有偏好记录代表用户已经做过选择，迁移只补齐从未保存偏好的真实支持者。
-- identity_consented_at 保持 NULL，避免把产品默认误记为用户主动保存公开选择。

ALTER TABLE `support_public_preferences`
  MODIFY COLUMN `show_identity` tinyint unsigned NOT NULL DEFAULT 1;

INSERT IGNORE INTO `support_public_preferences`
  (`user_id`, `public_id`, `participate_in_ranking`, `show_identity`, `identity_consented_at`)
SELECT
  o.`light_note_user_id`,
  UUID(),
  1,
  1,
  NULL
FROM `support_orders` o
INNER JOIN `user` u
  ON u.`id` = o.`light_note_user_id`
 AND u.`del_flag` = '0'
LEFT JOIN `support_public_preferences` p
  ON p.`user_id` = o.`light_note_user_id`
WHERE o.`light_note_user_id` IS NOT NULL
  AND o.`verification_state` = 'api_verified'
  AND o.`provider_status` = 2
  AND o.`order_purpose` IN ('legacy_support', 'donation')
  AND o.`ownership_source` <> 'conflict'
  AND p.`user_id` IS NULL
GROUP BY o.`light_note_user_id`;
