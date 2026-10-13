// 活跃人数只需要存在性，避免展开全部请求日志后去重。
export const ACTIVE_USERS_QUERY = `SELECT COUNT(*) AS users FROM user u
  WHERE u.role = 'user' AND u.del_flag = '0'
    AND EXISTS (SELECT 1 FROM api_logs l WHERE l.user_id = u.id AND l.del_flag = '0'
      AND l.request_time >= DATE_SUB(NOW(), INTERVAL ? DAY))`;

// 采用人数按账号去重；events 保持事件数语义，兼容历史助手与现行模块化 AI。
// 打开面板、失败日志和后台自动执行不单独构成采用。
export const AI_ADOPTION_QUERY = `SELECT COUNT(DISTINCT e.subject_user_id) AS users, COUNT(*) AS events
  FROM ai_product_events e
  JOIN user u ON u.id = e.subject_user_id AND u.role = 'user' AND u.del_flag = '0'
  WHERE e.admin_context_mode = 'normal'
    AND e.event_name IN ('ai_prompt_submitted', 'ai_completed', 'ai_change_succeeded',
      'ai_skill_started', 'ai_skill_completed', 'ai_skill_applied')
    AND e.create_time >= DATE_SUB(NOW(), INTERVAL ? DAY)`;

// Linked executions observed in this window, not a historical conversion rate.
// Draft/insert/copy/saved can overlap. Only a matching delivered result qualifies.
export const AI_OUTCOMES_QUERY = `SELECT
  COALESCE(SUM(started), 0) AS started,
  COALESCE(SUM(completed), 0) AS completed,
  COALESCE(SUM(completed AND result_action), 0) AS result_actions,
  COALESCE(SUM(completed AND draft), 0) AS draft,
  COALESCE(SUM(completed AND inserted), 0) AS inserted,
  COALESCE(SUM(completed AND copied), 0) AS copied,
  COALESCE(SUM(completed AND saved), 0) AS saved,
  COALESCE(SUM(legacy_events), 0) AS legacy_events
 FROM (
  SELECT subject_user_id, skill_id, request_id,
    MAX(linked AND event_name='ai_skill_started') AS started,
    MAX(linked AND event_name='ai_skill_completed') AS completed,
    MAX(linked AND event_name='ai_skill_result_action') AS result_action,
    MAX(linked AND event_name='ai_skill_applied' AND outcome='success' AND adoption_kind='draft') AS draft,
    MAX(linked AND event_name='ai_skill_applied' AND outcome='success' AND adoption_kind='insert') AS inserted,
    MAX(linked AND event_name='ai_skill_applied' AND outcome='success' AND adoption_kind='copy') AS copied,
    MAX(linked AND event_name='ai_skill_applied' AND outcome='success' AND adoption_kind='saved') AS saved,
    SUM(event_name='ai_skill_applied' AND (NOT linked OR adoption_kind IS NULL)) AS legacy_events
   FROM (
    SELECT e.subject_user_id,e.event_name,
      JSON_UNQUOTE(JSON_EXTRACT(e.dimensions_json,'$.skillId')) AS skill_id,
      JSON_UNQUOTE(JSON_EXTRACT(e.dimensions_json,'$.requestId')) AS request_id,
      JSON_UNQUOTE(JSON_EXTRACT(e.dimensions_json,'$.adoptionKind')) AS adoption_kind,
      JSON_UNQUOTE(JSON_EXTRACT(e.dimensions_json,'$.outcome')) AS outcome,
      COALESCE(JSON_UNQUOTE(JSON_EXTRACT(e.dimensions_json,'$.measurementVersion'))='2'
        AND JSON_UNQUOTE(JSON_EXTRACT(e.dimensions_json,'$.requestId')) REGEXP '^h_[a-f0-9]{32}$'
        AND JSON_UNQUOTE(JSON_EXTRACT(e.dimensions_json,'$.skillId')) <> '', 0) AS linked
     FROM ai_product_events e
     JOIN user u ON u.id=e.subject_user_id AND u.role='user' AND u.del_flag='0'
     WHERE e.admin_context_mode='normal' AND e.actor_user_id=e.subject_user_id
       AND e.event_name IN ('ai_skill_started','ai_skill_completed','ai_skill_result_action','ai_skill_applied')
       AND e.create_time >= DATE_SUB(NOW(), INTERVAL ? DAY)
   ) events_in_window
   GROUP BY subject_user_id,skill_id,request_id
 ) executions_in_window`;

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
