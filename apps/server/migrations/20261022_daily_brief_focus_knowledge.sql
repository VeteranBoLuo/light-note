-- 今日简报公开帮助同步。幂等、仅知识内容；不随 Schema 检查自动执行。
-- 执行此脚本需要单独的目标环境知识写入授权。
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @daily_brief_help_id = 'bd867ec4-2df8-4cce-928a-5a48f1d992eb';
SET @daily_brief_help_title = '今日简报何时更新，如何控制自动生成';
SET @daily_brief_help_content = '今日简报位于桌面工作台和移动端“今日”，精选当前值得留意的事项，不会修改资料。

## 简报显示什么
一次性待办最多展示一项重点，按重要性和时间选择；日常重复任务不反复占位，单次任务设置多次催办仍可出现。截止、开始、计划日期和提醒分别说明，点击可进入对应待办。其他内容独立筛选，不依赖是否存在待办。项目临近到期或逾期、活跃项目有明确下一步、新成果可查看，也可以进入简报。

工坊未移除提醒的处理失败或保存失败任务优先提示，普通暂停不视为异常。失败提醒与成果独立保留，不因有成果而隐藏失败。正文按失败提醒、一次性待办、项目、成果、整理的顺序展示，每类最多一条；整理合并后最多五条。失败处理或移除提醒后，简报会随事实更新。

当前一轮仍有效的 AI 整理建议会显示待审核条数，不因启动时间较早而隐藏。待整理资料和无标签资源合并为一条简短汇总，分别显示数量并提供各自入口；两类可能重叠，不能相加为总资源数。

顶部简短概览显示今天新增的书签、笔记和文件数量，不占重点条目，不回顾昨天凑条目。没有新增时显示“今天暂无新增资源”；也没有其他重要事项时合并为一句状态。昨日新增不直接算作待处理资料。新增收藏、共同标签关系不会扩写成洞察。底部“AI 建议”会结合近期可读取的笔记、书签网页快照或已解析文件中的少量真实片段，给出有原文依据的具体行动，并提供原资料入口。只分析有界片段，不代表读完全部资料；没有新增价值或只会重复正文时明确说明暂无需要补充的建议。没有重要内容时保持简短，不强制给建议，也不会把“没有今日重点”说成全部待办清零。

## 更新与额度
默认自动更新。进入或返回工作台、页面保持前台及账号自然日切换时检查事实，有变化才更新；后台不持续生成。也可点击“更新简报”手动检查，没有变化不重复生成。

行动提醒和平静日直接由事实生成，不消耗 AI 额度。有结论的新成果概括和基于真实片段的建议判断可能调用 AI，实际调用计入正常 AI 用量。相同材料与相关背景复用既有判断，包括没有建议的结果，不因新增资源统计或跨日反复生成；同一成果不会因为待办变化而重复概括。AI 暂不可用或额度不足时仍展示事实提醒及原成果结论。最近一次已完成的 AI 建议判断会保留，包括明确没有建议的结果；等待分析或仅事实刷新不会覆盖它。更新失败时保留旧建议并显示失败状态，不将失败当作没有建议；同一失败材料不会自动反复调用。更新中或失败保留上一版及真实数据截止时间，变化的条目会有提示。

## 设置与预览
在“设置 → AI → 今日简报与例行任务”中，可关闭自动更新并保留手动查看，也可关闭整个简报。管理员预览只展示已保存的结果，不会生成或更新。';

INSERT INTO knowledge_base (id, title, content, category, help_section, status, type, sort, created_by, updated_by)
SELECT @daily_brief_help_id, @daily_brief_help_title, @daily_brief_help_content,
       '帮助中心', 'AI 与权益', 'public', 'markdown', 99, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @daily_brief_help_id)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE category = '帮助中心' AND title = @daily_brief_help_title);

UPDATE knowledge_base
SET content = @daily_brief_help_content, help_section = 'AI 与权益', status = 'public', type = 'markdown',
    admin_archived = 0, updated_by = NULL
WHERE id = @daily_brief_help_id OR (category = '帮助中心' AND title = @daily_brief_help_title);

COMMIT;
