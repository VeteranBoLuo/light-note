// 活跃人数只需要存在性，避免展开全部请求日志后去重。
export const ACTIVE_USERS_QUERY = `SELECT COUNT(*) AS users FROM user u
  WHERE u.role = 'user' AND u.del_flag = '0'
    AND EXISTS (SELECT 1 FROM api_logs l WHERE l.user_id = u.id AND l.del_flag = '0'
      AND l.request_time >= DATE_SUB(NOW(), INTERVAL ? DAY))`;

// 有界后台读模型；注册后滚动窗口，分子与分母必须等待完整观察期。
export const ACTIVATION_QUERY = `SELECT COUNT(DISTINCT u.id) AS new_users,
                COUNT(DISTINCT f.user_id) AS activated_users
           FROM user u
           LEFT JOIN conversion_events f
             ON f.user_id = u.id
            AND f.event = 'first_own_resource'
            AND f.create_time >= u.create_time
            AND f.create_time < DATE_ADD(u.create_time, INTERVAL 7 DAY)
          WHERE u.role = 'user' AND u.del_flag = '0'
            AND u.create_time >= DATE_SUB(NOW(), INTERVAL ? DAY)
            AND u.create_time <= DATE_SUB(NOW(), INTERVAL 7 DAY)`;

// 按账号检查窗口内是否存在请求，避免关联全部日志后再 COUNT DISTINCT。
// 复用现有 (user_id, request_time) 索引；不增加查询次数或迁移。
export const COHORT_RETENTION_QUERY = `SELECT
  DATE_FORMAT(DATE_SUB(DATE(u.create_time), INTERVAL WEEKDAY(u.create_time) DAY), '%Y-%m-%d') AS cohort_start,
  COUNT(*) AS registered,
  COUNT(CASE WHEN u.create_time <= DATE_SUB(NOW(), INTERVAL 2 DAY) THEN 1 END) AS d1_eligible,
  COUNT(CASE WHEN u.create_time <= DATE_SUB(NOW(), INTERVAL 2 DAY)
      AND EXISTS (SELECT 1 FROM api_logs l
        WHERE l.user_id = u.id AND l.del_flag = '0'
          AND l.request_time >= DATE_ADD(u.create_time, INTERVAL 1 DAY)
          AND l.request_time < DATE_ADD(u.create_time, INTERVAL 2 DAY))
      THEN 1 END) AS d1_retained,
  COUNT(CASE WHEN u.create_time <= DATE_SUB(NOW(), INTERVAL 8 DAY) THEN 1 END) AS d7_eligible,
  COUNT(CASE WHEN u.create_time <= DATE_SUB(NOW(), INTERVAL 8 DAY)
      AND EXISTS (SELECT 1 FROM api_logs l
        WHERE l.user_id = u.id AND l.del_flag = '0'
          AND l.request_time >= DATE_ADD(u.create_time, INTERVAL 7 DAY)
          AND l.request_time < DATE_ADD(u.create_time, INTERVAL 8 DAY))
      THEN 1 END) AS d7_retained,
  COUNT(CASE WHEN u.create_time <= DATE_SUB(NOW(), INTERVAL 31 DAY) THEN 1 END) AS d30_eligible,
  COUNT(CASE WHEN u.create_time <= DATE_SUB(NOW(), INTERVAL 31 DAY)
      AND EXISTS (SELECT 1 FROM api_logs l
        WHERE l.user_id = u.id AND l.del_flag = '0'
          AND l.request_time >= DATE_ADD(u.create_time, INTERVAL 30 DAY)
          AND l.request_time < DATE_ADD(u.create_time, INTERVAL 31 DAY))
      THEN 1 END) AS d30_retained
  FROM user u
  WHERE u.role = 'user' AND u.del_flag = '0'
    AND u.create_time >= DATE_SUB(NOW(), INTERVAL ? DAY)
  GROUP BY cohort_start ORDER BY cohort_start DESC`;
