-- 2026-08-24 旧全局助手与旧会话档案完全下线后的公开帮助同步。
-- MySQL 5.7 兼容、幂等；只更新业务知识，不删除历史会话数据或修改表结构。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @ai_skills_guide_id = 'd16dabc0-7366-1173-ac9a-a7f89586e39b';
SET @ai_skills_guide_title = '模块 AI：按页面使用、材料边界与额度';
SET @ai_skills_guide_content = '<h1>模块 AI</h1><p>轻笺不再提供跨模块自由聊天和操作的全局助手。AI 能力放在笔记、书签、文件、待办、资源中心和帮助中心的对应页面中；当前页面和明确选择的资源决定本次任务，模型不会重新猜测业务模块。</p><h2>在哪里使用</h2><ul><li><strong>笔记：</strong>总结或比较明确选择的笔记、改写当前笔记或选区、根据所选材料生成新笔记。</li><li><strong>书签：</strong>生成网页存档与摘要、分析当前书签、根据网页生成新笔记。</li><li><strong>文件：</strong>总结明确选择且已解析的文件；图片可先提取并总结可识别文字。</li><li><strong>待办：</strong>把当前标题、说明和清单拆成可检查的步骤；最终保存仍由待办页面完成。</li><li><strong>资源中心：</strong>分析明确选择的个人资料；<strong>帮助中心：</strong>只读检索公开产品帮助。</li></ul><h2>材料边界</h2><p>不同模块、不同资源和不同账号之间不会共享材料。每次执行都根据结构化资源标识重新读取当前权威内容，旧结果本身不能充当事实来源。</p><h2>生成与保存</h2><p>“生成新笔记”在生成成功后会立即创建并打开一篇已保存的笔记，直接退出编辑器也不会丢失。改写、拆解和字段建议等操作先展示可检查结果，只有用户明确应用或保存后才修改原业务数据。</p><h2>额度</h2><p>笔记、书签、文件、待办、标签整理等所有真实模型调用统一计入 AI 额度；没有调用模型的确定性处理不扣额度。可在“设置 → AI 用量”分别查看今日等级额度、永久加油余额和当前总可用额度。</p>';

UPDATE knowledge_base
SET title = @ai_skills_guide_title,
    content = @ai_skills_guide_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    sort = 99,
    admin_archived = 0,
    updated_by = NULL
WHERE id = @ai_skills_guide_id
   OR (title IN ('AI 助手（轻笺智域）使用说明', @ai_skills_guide_title) AND COALESCE(admin_archived, 0) = 0);

SET @ai_quota_guide_id = '52d9bd49-6bb0-4ac8-a4fb-65c2d80401c7';
SET @ai_quota_guide_content = '<h1>AI 额度、等级与加油包</h1><h2>统一额度</h2><p>笔记、书签、文件、待办、标签整理等所有实际模型调用共享同一份 AI 额度。一次用户动作内的模型回退、有限重试和格式修复累计到同一笔执行；没有调用模型的确定性解析不扣模型额度。</p><h2>额度组成</h2><ul><li><strong>今日等级额度：</strong>随成长等级提升并按当前产品规则每日重置。</li><li><strong>永久加油余额：</strong>不会每日重置；今日额度耗尽后自动继续使用。</li><li><strong>当前总可用：</strong>今日剩余额度与永久余额之和。</li></ul><p>不同任务的材料长度和输出长度不同，实际消耗也会不同。</p><h2>查看用量</h2><p>前往“设置 → AI 用量”可同时查看今日等级额度、永久加油余额和当前总可用额度。额度不足时，系统会在访问模型前拒绝请求，不会先生成再补扣。</p><h2>AI 加油包</h2><p>AI 加油包进入背包后可按产品当前规则转为永久 AI 余额；每日等级额度耗尽后才自动使用。</p>';

UPDATE knowledge_base
SET content = @ai_quota_guide_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    sort = 96,
    admin_archived = 0,
    updated_by = NULL
WHERE id = @ai_quota_guide_id OR title = 'AI 额度、等级与加油包';

COMMIT;

SELECT id, title, category, status, type, sort, admin_archived, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id IN (@ai_skills_guide_id, @ai_quota_guide_id)
ORDER BY sort DESC, title;
