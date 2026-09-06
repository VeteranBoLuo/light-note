-- 今日简报公开帮助同步。幂等、仅知识内容；不随 Schema 检查自动执行。
-- 执行此脚本需要单独的目标环境知识写入授权。
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @daily_brief_help_id = 'bd867ec4-2df8-4cce-928a-5a48f1d992eb';
SET @daily_brief_help_title = '今日简报何时更新，如何控制自动生成';
SET @daily_brief_help_content = '今日简报是桌面工作台里的 AI 摘要。服务端先核实当前待办、今天与昨天新增资料、无标签资源和待确认的 AI 整理建议，再由 AI 提炼重点及下一步建议；不会修改你的资料。

## 简报内容与关联
简报按重要性选择内容，不固定每类一条，不会为凑数量而加入没有数据的类别。紧急待办优先，有价值时也会提示近期资料与较早资料的共同标签，并提供两个原资料入口；这只是可核验的标签关联，不代表已经分析了全文。没有可靠关联时不显示这一项。零值不单列提醒，有其他重点时省略未变化的整理积压。

## 自动更新
默认开启。进入或返回工作台时检查是否有变化；页面一直在前台时也会定期补查，跨天按账号时区检查新一天的简报。今天尚无简报时自动生成，有相关变化时合并更新。没有变化不会重复调用 AI，切到后台后不会持续发起生成。

自动更新有冷却、失败退避和每日保护上限，不等于每次切换页面都会立即重新生成。只有真正调用 AI 才计入正常 AI 用量，单纯检查和读取已有简报不消耗模型额度。

## 手动更新与旧内容
可以点击“更新简报”主动检查和更新；若资料没有变化，会提示简报与当前资料一致。更新过程中仍可阅读上一版，数据截止时间不会冒充当前时间。资料变化或更新失败会明确提示，成功后替换为新简报。

## 设置与额度
在“设置 → AI → 今日简报与例行任务”中，可以只关闭自动更新、保留手动生成，也可以关闭整个简报功能。可用 AI 额度不足时自动更新暂停，补足额度后可以手动重试。关闭开关不会撤销已经发出的模型请求。';

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
