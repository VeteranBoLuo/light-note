-- 积分明细与兑换目标帮助；幂等更新公开知识，不修改业务 Schema 或积分数据。
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;
SET @ledger_help_id = '41a4111b-4ef6-4f31-9c60-cd9b83a036c2';
SET @ledger_help_title = '积分明细与兑换目标';
SET @ledger_help_content = '## 查看积分
在成长中心进入「积分明细」，或从设置中的「积分明细」查看余额和流水。原积分中心入口已合并到积分明细。

页面上方显示当前积分、近 28 天收入和支出，下方按时间查看积分变化，可筛选获得、消费、抽奖和系统调整。摘要的近 28 天统计不限制下方历史流水的查询范围。

「收支分析」展开近 28 天各来源的收入与支出；「积分规则」查看当前获取方式。流水中的预扣、结算调整与退回应结合完整记录理解，保存工具成果为笔记不会再次扣积分。非积分奖励会显示相应资产变化。

## 设置兑换目标
在成长中心的「兑换」页选择想兑换的商品并设为目标，可查看现有积分、差额和进度。目标不会自动兑换或扣分。

预计时间只使用近 28 天稳定收入估算，不包含未来消费、成就、活动或随机奖励。低打扰模式下不显示预计天数。目标商品下架、已拥有且不能重复兑换或达到兑换上限时，页面提示不可用，可以重新选择或关闭目标。';

INSERT INTO knowledge_base (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT @ledger_help_id, @ledger_help_title, @ledger_help_content, '帮助中心', 'public', 'markdown', 99, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @ledger_help_id)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @ledger_help_title);

UPDATE knowledge_base SET content = @ledger_help_content, category = '帮助中心', status = 'public',
  type = 'markdown', sort = 99, admin_archived = 0, updated_by = NULL
WHERE id = @ledger_help_id OR title = @ledger_help_title;
COMMIT;
