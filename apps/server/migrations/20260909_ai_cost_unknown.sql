-- NULL 表示无法核价；历史已记录成本保持不变。幂等，无用户资产迁移。
ALTER TABLE ai_provider_spans MODIFY COLUMN estimated_cost DECIMAL(12,6) NULL DEFAULT NULL;
