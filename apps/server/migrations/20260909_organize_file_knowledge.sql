SET NAMES utf8mb4;

-- Help text follows the existing topic; safe to reapply without duplicating the section.
UPDATE knowledge_base
SET content=CONCAT(content, '\n\n### 文件内容读取与标签建议\n启动整理后会自动读取支持的文档，图片按需理解主体和可见文字。普通文字解析和有效缓存读取不消耗 AI 额度；识图和主题分析按实际调用计费。长文档连续分批分析，最多建议三个核心主题，优先复用已有标签。\n部分读取会显示缺失页面或限制原因，读取失败不代表没有主题。建议仍需审核后应用；可以重新分析未推荐文件，系统会重新确认完整范围，排除已应用、已忽略及已有标签的文件。历史任务不会自动重跑。')
WHERE id='230bf6c0-7ed0-117e-8a12-c9dc04f3e8e7' AND content NOT LIKE '%### 文件内容读取与标签建议%';
