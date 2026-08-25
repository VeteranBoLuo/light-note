-- AI 用量明细与免费/扣费边界的公开帮助说明。
-- 固定 ID 幂等更新；只触碰产品帮助文章，不写用户业务数据或历史 AI 内容。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @module_ai_id = 'd16dabc0-7366-1173-ac9a-a7f89586e39b';
SET @module_ai_content = '<h1>模块 AI</h1><p>轻笺不再提供跨模块自由聊天和操作的全局助手。AI 能力放在笔记、书签、文件、待办、资源中心、标签和帮助中心的对应页面中；当前页面和明确选择的资源决定本次任务，不会沿用其他模块或上一次材料。</p><h2>会消耗 AI 额度</h2><ul><li>笔记、书签和文件的总结、问答、比较、生成笔记与正文处理。</li><li>网址智能识别、网页 AI 摘要、待办草稿与拆解、从笔记或文件提取待办。</li><li>资源搜索结果的 AI 回答、帮助问答、批量智能打标签，以及用户明确点击的 AI 扩展图标搜索。</li></ul><p>只有真正发出用户主模型调用时才按实际 token 扣除；没有材料、缓存命中或确定性结果为 0。模型返回格式不合格时的一次受限协议修复由平台承担，不重复扣用户额度。</p><h2>不消耗 AI 额度</h2><ul><li>笔记、书签、文件和待办的基础增删改查，以及本地关键词搜索。</li><li>文件文本提取、本地 OCR、预览生成和网页正文存档。</li><li>普通标签图标搜索，以及缓存或无需模型的结果。</li></ul><p>不扣 AI token 不代表无限使用：网页抓取、文件解析、OCR 和外部图标查询仍有大小、页数、频率、并发与安全限制，这些限制不会消耗模型额度。</p><h2>在哪里查看</h2><p>在设置中点击“AI 用量与计费规则”进入独立页面：上方查看今日等级额度、永久加油余额和当前总可用；“最近用量”按时间和模块展示真实扣费、平台承担与执行状态；“计费规则”展示当前免费和扣费能力。明细不会保存或显示问题、正文、标题、网址和资源内容。</p>';
UPDATE knowledge_base
SET content = @module_ai_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    sort = 99,
    admin_archived = 0,
    updated_by = NULL
WHERE id = @module_ai_id;

SET @ai_quota_id = '52d9bd49-6bb0-4ac8-a4fb-65c2d80401c7';
SET @ai_quota_content = '<h1>AI 额度、用量明细与永久余额</h1><h2>额度组成</h2><ul><li><strong>今日等级额度：</strong>按自然日重置，优先消耗。</li><li><strong>永久余额：</strong>不会每日重置，今日额度用完后自动继续使用。</li><li><strong>当前总可用：</strong>今日剩余额度与永久余额之和。</li></ul><h2>每日等级额度</h2><p>游客按设备每日 20 万 tokens，并受可信网络额度保护。登录账号按成长等级计算：Lv.1～5 分别为 30、35、40、45、50 万；Lv.6～9 为 60、70、80、90 万；Lv.10～15 为 105、120、140、160、180、200 万 tokens/日。user、test 与 root 都按各自真实成长等级计算，账号角色不会额外放大 AI 额度。</p><h2>永久余额来源</h2><ul><li><strong>积分兑换：</strong>240 积分兑换 30 万，420 积分兑换 60 万 tokens，兑换后直接入永久余额。</li><li><strong>赞助感谢：</strong>赠送策略启用后的爱发电合格实付订单，每实付 ¥1 赠送 10 万 tokens；¥6、¥18、¥50 分别赠送 60 万、180 万、500 万。</li></ul><p>赞助赠送以爱发电 API 核验、可信订单归属和实际支付金额为准；策略启用前的历史订单不追溯赠送，超过 ¥200 的单笔赠送需管理员复核，退款或订单反转进入人工处理且不会把余额扣成负数。</p><h2>统一计费与逐次明细</h2><p>笔记、书签、文件、待办、标签整理和帮助问答等真实模型调用共享同一份额度。用户主调用按实际 token 结算；缓存、无材料和本地确定性处理不扣，受限输出协议修复由平台承担。点击消耗记录可按真实顺序查看 Provider、模型、输入/输出/合计 token、耗时、承担方及脱敏修复原因；页面不保存或显示问题、正文、标题、网址、图片和模型回答。额度不足会在下一次模型调用前停止。</p>';
SET @ai_quota_content = REPLACE(@ai_quota_content, '<strong>永久余额：</strong>', '<strong>永久加油余额（永久余额）：</strong>');
SET @ai_quota_content = CONCAT(@ai_quota_content, '<h2>计费边界补充</h2><p>只有真正发出用户主模型调用时才按实际 token 扣除；缓存命中、无可用材料、确定性解析和纯本地处理不扣。内部协议修复由平台承担；批量整理会保留已经完成的建议。</p><p>不扣 AI token 不代表无限使用：网页抓取、文件解析、OCR 和外部图标查询仍有大小、页数、频率、并发与安全限制。</p><p>从设置中的“AI 用量与计费规则”入口进入独立页面后，可筛选最近用量。</p><h2>逐次调用详情</h2><p>修复由后端代码门禁判定，并显示脱敏原因；历史上未保存具体原因的记录会明确标注，不会猜测。页面仍不保存或显示问题、正文、标题、网址、图片和模型回答。</p>');
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

SET @bookmark_snapshot_id = '2308c270-7ed0-117e-80f0-dfa644922619';
SET @bookmark_snapshot_content = '# 网页存档、AI 摘要与防死链\n\n网页存档和 AI 摘要现在是两个清楚分开的动作。\n\n## 免费的网页存档\n- 新增书签时可选择“保存网页存档”，也可在存档详情中手动生成或更新。\n- 它只抓取并保存当时可读取的网页正文，不调用模型、不消耗 AI 额度。\n- 后台自动存档有并发和积压保护，手动抓取有频率、安全和正文大小限制；这些限制不会影响书签本身保存。\n\n## 消耗额度的 AI 摘要\n- 已经有网页正文后，用户再明确点击“生成 AI 摘要”。\n- 摘要按本次真实模型 token 计入统一 AI 额度；更新正文不会自动连带生成摘要。\n- 已有摘要在不要求重新生成时可直接读取缓存，缓存读取不扣额度。\n\n需要登录使用；需登录访问、强反爬或纯前端渲染的网站可能无法保存正文。抓取失败不会覆盖已有的成功存档。';
UPDATE knowledge_base
SET content = @bookmark_snapshot_content,
    updated_by = NULL
WHERE id = @bookmark_snapshot_id;

COMMIT;

SELECT id, title, status, type, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id IN (@module_ai_id, @ai_quota_id, @bookmark_snapshot_id)
ORDER BY id;
