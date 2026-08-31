-- 2026-08-24 模块化 AI Skills 帮助知识同步（MySQL 5.7 兼容、幂等）。
-- 仅更新 knowledge_base 业务内容，不修改表结构，也不随结构迁移自动执行。
-- 上线时需按业务数据写入流程单独执行；执行后重启后端以清理进程内知识索引缓存。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @ai_skills_guide_id = 'd16dabc0-7366-1173-ac9a-a7f89586e39b';
SET @ai_skills_guide_old_title = 'AI 助手（轻笺智域）使用说明';
SET @ai_skills_guide_title = '模块 AI：按页面使用、材料边界与额度';
SET @ai_skills_guide_content = '<h1>模块 AI</h1><p>轻笺不再提供可以跨模块自由聊天和操作的全局助手。AI 能力放在笔记、书签、文件、待办、资源中心和帮助中心的对应页面中；当前页面和明确选择的资源决定本次任务，模型不会重新猜测要使用哪个业务模块。</p><h2>在哪里使用</h2><ul><li><strong>笔记：</strong>总结或比较明确选择的笔记、改写当前笔记或选区、生成新笔记草稿、提取待办候选。</li><li><strong>书签：</strong>解析网址信息、总结或比较明确选择的网页、生成笔记草稿。</li><li><strong>文件：</strong>总结、追问或比较明确选择的文件，生成笔记草稿或待办候选。</li><li><strong>待办：</strong>把自然语言解析为待办草稿，或把任务拆成可检查的步骤；保存仍由待办页面完成。</li><li><strong>资源中心：</strong>只读检索自己的资料；<strong>帮助中心：</strong>只读检索公开产品帮助。</li></ul><h2>材料与连续追问</h2><p>不同模块、不同资源和不同账号之间不会共享材料。少量连续追问只在同一项 Skill 和同一材料范围内用于理解“继续、第二点、它”等省略表达；回答中的事实每轮都会重新读取当前资源，旧回答本身不能充当事实来源。</p><h2>预览与保存</h2><p>生成笔记、待办或字段建议时，AI 只返回结构化预览，不会直接写入。用户检查后由原业务页面调用既有保存能力；权限、归属、版本和输入仍由服务端重新验证。</p><h2>额度</h2><p>笔记、书签、文件、待办、标签整理等所有真实模型调用都统一计入 AI 额度。一次用户动作内的模型回退和结构修复合并结算；没有调用模型的本地确定性处理不扣模型额度。可在“设置 → AI 用量”查看今天的统一用量。</p><h2>旧会话</h2><p>旧全局助手会话保留为只读归档，只能查看、导出或删除，不能继续发送。可在“设置 → AI 用量 → 查看旧会话”进入。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by, admin_archived)
SELECT
  @ai_skills_guide_id, @ai_skills_guide_title, @ai_skills_guide_content,
  '帮助中心', 'public', 'html', 99, NULL, NULL, 0
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @ai_skills_guide_id)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @ai_skills_guide_title AND COALESCE(admin_archived, 0) = 0);

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
   OR (title IN (@ai_skills_guide_old_title, @ai_skills_guide_title) AND COALESCE(admin_archived, 0) = 0);

SET @keyboard_guide_id = 'c49eb4fa-b3f4-4c89-8826-cf85060eb84b';
SET @keyboard_guide_title = '键盘快捷键指南';
SET @keyboard_guide_content = '<h1>键盘快捷键指南</h1><h2>全局搜索（电脑端）</h2><p>不在输入框或可编辑区域时，按 <code>/</code> 可以聚焦全局搜索；也可以使用 <code>⌘/Ctrl + F</code>。轻笺不再提供打开全局 AI 助手的快捷键，模块 AI 请从当前笔记、书签、文件、待办、资源中心或帮助中心进入。</p><h2>通用操作</h2><p>多数弹窗和预览可按 <code>Esc</code> 关闭。全局快捷键不会抢占输入框、编辑器或其他可编辑区域中的正常输入。</p><h2>笔记编辑</h2><ul><li><code>⌘/Ctrl + S</code>：保存笔记。</li><li><code>⌘/Ctrl + Z</code>：撤销。</li><li><code>⌘/Ctrl + Y</code>：重做。</li><li><code>⌘/Ctrl + B</code>、<code>I</code>、<code>U</code>：加粗、斜体、下划线。</li><li><code>⌘/Ctrl + F</code>：在编辑器内查找。</li></ul><h2>云空间</h2><p>复制本地文件后，在云空间页面使用 <code>⌘/Ctrl + V</code> 可以粘贴上传；也支持拖拽和点击上传。</p>';

UPDATE knowledge_base
SET content = @keyboard_guide_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    sort = 98,
    admin_archived = 0,
    updated_by = NULL
WHERE id = @keyboard_guide_id OR title = @keyboard_guide_title;

SET @ai_quota_guide_id = '52d9bd49-6bb0-4ac8-a4fb-65c2d80401c7';
SET @ai_quota_guide_title = 'AI 额度、等级与加油包';
SET @ai_quota_guide_content = '<h1>AI 额度、用量明细与永久余额</h1><h2>额度组成</h2><ul><li><strong>今日等级额度：</strong>按自然日重置，优先消耗。</li><li><strong>永久余额：</strong>不会每日重置，今日额度用完后自动继续使用。</li><li><strong>当前总可用：</strong>今日剩余额度与永久余额之和。</li></ul><h2>每日等级额度</h2><p>游客按设备每日 20 万 tokens，并受可信网络额度保护。登录账号按成长等级计算：Lv.1～5 分别为 30、35、40、45、50 万；Lv.6～9 为 60、70、80、90 万；Lv.10～15 为 105、120、140、160、180、200 万 tokens/日。user、test 与 root 都按各自真实成长等级计算，账号角色不会额外放大 AI 额度。</p><h2>永久余额来源</h2><ul><li><strong>积分兑换：</strong>240 积分兑换 30 万，420 积分兑换 60 万 tokens，兑换后直接入永久余额。</li><li><strong>赞助感谢：</strong>赠送策略启用后的爱发电合格实付订单，每实付 ¥1 赠送 10 万 tokens；¥6、¥18、¥50 分别赠送 60 万、180 万、500 万。</li></ul><p>赞助赠送以爱发电 API 核验、可信订单归属和实际支付金额为准；策略启用前的历史订单不追溯赠送，超过 ¥200 的单笔赠送需管理员复核，退款或订单反转进入人工处理且不会把余额扣成负数。</p><h2>统一计费与明细</h2><p>笔记、书签、文件、待办、标签整理和帮助问答等真实模型调用共享同一份额度。用户主调用按实际 token 结算；缓存、无材料和本地确定性处理不扣，受限输出协议修复由平台承担。可在“AI 用量与计费”页核对今日额度、永久余额、当前总可用以及每次模型调用详情；额度不足会在下一次模型调用前停止。</p>';

UPDATE knowledge_base
SET content = @ai_quota_guide_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    sort = 96,
    admin_archived = 0,
    updated_by = NULL
WHERE (id = @ai_quota_guide_id OR title = @ai_quota_guide_title)
  AND LOCATE('data-ln-policy:ai-quota-v', COALESCE(content, '')) = 0;

-- 旧万能助手、全局材料继承、附件会话、自由工具规划和续聊说明已与新产品冲突。
-- 采用可恢复的管理归档，不物理删除历史知识。
UPDATE knowledge_base
SET status = 'internal', admin_archived = 1, updated_by = NULL
WHERE id IN (
  '2af1b75a-8155-46d4-8e8a-acdeccad8492',
  '20969526-f304-41e8-a19d-a57ef9c1b68e',
  'af0850a6-6ae8-49ae-bd15-1c337d624dc7',
  'c75bd005-924d-4006-ab93-f987234a7d36',
  'b14e9846-ad31-4cd2-a75f-b88b132ac286',
  '6d949ad7-6143-4c99-9c44-e869f51a9310',
  '6c19c533-f5ce-4c22-a621-6c891b7475b7',
  'd4077811-4e89-4ba8-aac0-6aab7b341d68',
  'b11c6c23-78b4-4c8a-8b25-71c2c535a28d',
  '0ea0fbc9-6ac3-4d52-a929-cbc06c8bce86',
  'c8d699dc-4d66-4a9a-b680-dce81308cf5d',
  '86d4a1b5-5757-40e9-b667-2a66d4a2fc7b',
  'c7e41d92-3b60-4f18-8a5d-6e2f9c04b7d1',
  'f4a8b207-9c31-4d6e-b85f-2a71e0c34d96',
  'd2bda758-2f03-498d-9906-ca3f2ebecd51'
)
AND id <> @ai_skills_guide_id;

COMMIT;

SELECT id, title, category, status, type, sort, admin_archived, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id IN (@ai_skills_guide_id, @keyboard_guide_id, @ai_quota_guide_id)
ORDER BY sort DESC, title;
