-- 2026-08-24 旧全局助手与旧会话档案完全下线后的公开帮助同步。
-- MySQL 5.7 兼容、幂等；只更新业务知识，不删除历史会话数据或修改表结构。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @ai_skills_guide_id = 'd16dabc0-7366-1173-ac9a-a7f89586e39b';
SET @ai_skills_guide_title = '模块 AI：按页面使用、材料边界与额度';
SET @ai_skills_guide_content = '<h1>模块 AI</h1><p>轻笺不再提供跨模块自由聊天和操作的全局助手。AI 能力放在笔记、书签、文件、待办、资源中心和帮助中心的对应页面中；当前页面和明确选择的资源决定本次任务，模型不会重新猜测业务模块。</p><h2>在哪里使用</h2><ul><li><strong>笔记：</strong>总结或比较明确选择的笔记、改写当前笔记或选区、根据所选材料生成新笔记。</li><li><strong>书签：</strong>生成网页存档与摘要；从首页或管理页打开分析后会自动总结当前书签，确认“生成笔记”后把当前结果保存为新笔记。</li><li><strong>文件：</strong>总结明确选择且已解析的文件；图片可先提取并总结可识别文字。</li><li><strong>待办：</strong>把当前标题、说明和清单拆成可检查的步骤；最终保存仍由待办页面完成。</li><li><strong>资源中心：</strong>分析明确选择的个人资料；<strong>帮助中心：</strong>只读检索公开产品帮助。</li></ul><h2>材料边界</h2><p>不同模块、不同资源和不同账号之间不会共享材料。每次执行都根据结构化资源标识重新读取当前权威内容，旧结果本身不能充当事实来源。</p><h2>生成与保存</h2><p>“生成新笔记”在生成成功后会立即创建并打开一篇已保存的笔记，直接退出编辑器也不会丢失。改写、拆解和字段建议等操作先展示可检查结果，只有用户明确应用或保存后才修改原业务数据。</p><h2>额度</h2><p>笔记、书签、文件、待办、标签整理等所有真实模型调用统一计入 AI 额度；没有调用模型的确定性处理不扣额度。可在“设置 → AI 用量”分别查看今日等级额度、永久加油余额和当前总可用额度。</p>';

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
SET @ai_quota_guide_content = '<h1>AI 额度、用量明细与永久余额</h1><h2>额度组成</h2><ul><li><strong>今日等级额度：</strong>按自然日重置，优先消耗。</li><li><strong>永久余额：</strong>不会每日重置，今日额度用完后自动继续使用。</li><li><strong>当前总可用：</strong>今日剩余额度与永久余额之和。</li></ul><h2>每日等级额度</h2><p>游客按设备每日 20 万 tokens，并受可信网络额度保护。登录账号按成长等级计算：Lv.1～5 分别为 30、35、40、45、50 万；Lv.6～9 为 60、70、80、90 万；Lv.10～15 为 105、120、140、160、180、200 万 tokens/日。user、test 与 root 都按各自真实成长等级计算，账号角色不会额外放大 AI 额度。</p><h2>永久余额来源</h2><ul><li><strong>积分兑换：</strong>240 积分兑换 30 万，420 积分兑换 60 万 tokens，兑换后直接入永久余额。</li><li><strong>赞助感谢：</strong>赠送策略启用后的爱发电合格实付订单，每实付 ¥1 赠送 10 万 tokens；¥6、¥18、¥50 分别赠送 60 万、180 万、500 万。</li></ul><p>赞助赠送以爱发电 API 核验、可信订单归属和实际支付金额为准；策略启用前的历史订单不追溯赠送，超过 ¥200 的单笔赠送需管理员复核，退款或订单反转进入人工处理且不会把余额扣成负数。</p><h2>统一计费与明细</h2><p>笔记、书签、文件、待办、标签整理和帮助问答等真实模型调用共享同一份额度。用户主调用按实际 token 结算；缓存、无材料和本地确定性处理不扣，受限输出协议修复由平台承担。可在“AI 用量与计费”页核对今日额度、永久余额、当前总可用以及每次模型调用详情；额度不足会在下一次模型调用前停止。</p>';

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
