-- 仅用于明确回滚当前新增能力；会删除尚未落地的简报与建议批次数据。
DROP TABLE IF EXISTS organize_ai_tag_suggestions;
DROP TABLE IF EXISTS organize_ai_tag_batches;
DROP TABLE IF EXISTS workbench_daily_briefs;
ALTER TABLE tag DROP INDEX uk_tag_active_user_name, DROP COLUMN active_name;
