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
SET @ai_quota_guide_content = '<h1>AI 额度、等级与加油包</h1><h2>统一额度</h2><p>笔记、书签、文件、待办、标签整理等所有实际模型调用共享同一份 AI 额度，不再只有旧对话助手计费。一次用户动作内的模型回退、有限重试和格式修复累计到同一笔执行；没有调用模型的确定性解析不扣模型额度。</p><h2>每日额度</h2><ul><li><strong>游客：</strong>按设备和可信网络保护每日额度。</li><li><strong>登录用户：</strong>基础额度随成长等级提升；每日额度耗尽后，可继续使用已有的永久 AI 加油余额。</li></ul><p>额度按当前产品规则每日重置。不同任务的材料长度和输出长度不同，实际消耗也会不同。</p><h2>查看用量</h2><p>前往“设置 → AI 用量”查看今天的统一用量。额度不足时，系统会在访问模型前拒绝请求，不会先生成再补扣。</p><h2>AI 加油包</h2><p>AI 加油包进入背包后可按产品当前规则转为永久 AI 余额；每日等级额度耗尽后才自动使用。</p>';

UPDATE knowledge_base
SET content = @ai_quota_guide_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    sort = 96,
    admin_archived = 0,
    updated_by = NULL
WHERE id = @ai_quota_guide_id OR title = @ai_quota_guide_title;

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
