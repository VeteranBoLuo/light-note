// 注册时自动生成的新手示例资源不算用户自己的记录；周报、年度报告和备份提醒共用这组过滤条件。
export const SEED_FILTER = {
  bookmark: `NOT EXISTS (
          SELECT 1 FROM onboarding_seed_resources osr
          WHERE osr.user_id = b.user_id AND osr.resource_type = 'bookmark' AND osr.resource_id = b.id
        )`,
  note: `NOT EXISTS (
          SELECT 1 FROM onboarding_seed_resources osr
          WHERE osr.user_id = n.create_by AND osr.resource_type = 'note' AND osr.resource_id = n.id
        )`,
  file: `NOT EXISTS (
          SELECT 1 FROM onboarding_seed_resources osr
          WHERE osr.user_id = f.create_by AND osr.resource_type = 'file'
            AND osr.resource_id = CAST(f.id AS CHAR)
        )`,
  organize: `NOT EXISTS (
          SELECT 1 FROM onboarding_seed_resources osr
          WHERE osr.user_id = ri.user_id AND osr.resource_type = ri.resource_type
            AND osr.resource_id = ri.resource_id
        )`,
};
