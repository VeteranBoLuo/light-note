-- AI 用量逐次调用详情公开帮助。固定文章 ID 幂等更新，不读取或复制任何用户内容。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @ai_quota_id = '52d9bd49-6bb0-4ac8-a4fb-65c2d80401c7';
SET @ai_quota_content = '<h1>AI 额度、用量明细与加油包</h1><h2>三个数字分别表示什么</h2><ul><li><strong>今日等级额度：</strong>随成长等级提升，按当前产品规则每日重置。</li><li><strong>永久加油余额：</strong>不会每日重置；今日等级额度耗尽后自动继续使用。</li><li><strong>当前总可用：</strong>今日剩余额度与永久加油余额之和。</li></ul><p>头像菜单中的 AI 额度显示“当前总可用”，因此可能明显大于每日等级额度。点击后会直接进入独立的“AI 用量与计费”页面。</p><h2>统一计费</h2><p>笔记、书签、文件、待办、标签整理和帮助问答等所有实际模型调用共享同一份额度。用户主调用按 Provider 返回的实际 token 结算；缓存、无材料和本地确定性解析不扣，受限协议修复由平台承担。</p><p>不同任务的材料长度和输出长度不同，实际消耗也会不同。额度不足时系统会在下一次模型调用前拒绝请求，不会事后把余额扣成负数。</p><h2>逐次调用详情</h2><p>点击任一消耗记录可按真实顺序查看图片文字识别、内容理解与生成、输出协议修复等模型调用。详情会列出 Provider、模型、输入/输出/合计 token、耗时和用户或平台承担；修复由后端代码门禁判定，并显示缺少来源、引用无效、覆盖过度、篇幅不足或结构协议不合格等脱敏原因。历史上未保存具体原因的记录会明确标注，不会猜测；页面仍不保存或显示问题、正文、标题、网址、图片和模型回答。</p><h2>AI 加油包</h2><p>AI 加油包进入背包后可按产品当前规则转为永久 AI 余额；每日等级额度耗尽后才自动使用。</p>';

UPDATE knowledge_base
SET title = 'AI 额度、用量明细与加油包',
    content = @ai_quota_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    sort = 96,
    admin_archived = 0,
    updated_by = NULL
WHERE id = @ai_quota_id;

COMMIT;

SELECT id, title, status, type, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id = @ai_quota_id;
