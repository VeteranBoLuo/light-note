-- AI 用量逐次调用详情公开帮助。固定文章 ID 幂等更新，不读取或复制任何用户内容。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @ai_quota_id = '52d9bd49-6bb0-4ac8-a4fb-65c2d80401c7';
SET @ai_quota_content = '<h1>AI 额度、用量明细与永久余额</h1><h2>额度组成</h2><ul><li><strong>今日等级额度：</strong>按自然日重置，优先消耗。</li><li><strong>永久余额：</strong>不会每日重置，今日额度用完后自动继续使用。</li><li><strong>当前总可用：</strong>今日剩余额度与永久余额之和。</li></ul><h2>每日等级额度</h2><p>游客按设备每日 20 万 tokens，并受可信网络额度保护。登录账号按成长等级计算：Lv.1～5 分别为 30、35、40、45、50 万；Lv.6～9 为 60、70、80、90 万；Lv.10～15 为 105、120、140、160、180、200 万 tokens/日。user、test 与 root 都按各自真实成长等级计算，账号角色不会额外放大 AI 额度。</p><h2>永久余额来源</h2><ul><li><strong>积分兑换：</strong>240 积分兑换 30 万，420 积分兑换 60 万 tokens，兑换后直接入永久余额。</li><li><strong>赞助感谢：</strong>赠送策略启用后的爱发电合格实付订单，每实付 ¥1 赠送 10 万 tokens；¥6、¥18、¥50 分别赠送 60 万、180 万、500 万。</li></ul><p>赞助赠送以爱发电 API 核验、可信订单归属和实际支付金额为准；策略启用前的历史订单不追溯赠送，超过 ¥200 的单笔赠送需管理员复核，退款或订单反转进入人工处理且不会把余额扣成负数。</p><h2>统一计费与逐次明细</h2><p>笔记、书签、文件、待办、标签整理和帮助问答等真实模型调用共享同一份额度。用户主调用按实际 token 结算；缓存、无材料和本地确定性处理不扣，受限输出协议修复由平台承担。点击消耗记录可按真实顺序查看 Provider、模型、输入/输出/合计 token、耗时、承担方及脱敏修复原因；页面不保存或显示问题、正文、标题、网址、图片和模型回答。额度不足会在下一次模型调用前停止。</p>';
SET @ai_quota_content = REPLACE(@ai_quota_content, '<strong>永久余额：</strong>', '<strong>永久加油余额（永久余额）：</strong>');
SET @ai_quota_content = CONCAT(@ai_quota_content, '<h2>逐次调用详情</h2><p>修复由后端代码门禁判定，并显示脱敏原因；历史上未保存具体原因的记录会明确标注，不会猜测。页面仍不保存或显示问题、正文、标题、网址、图片和模型回答。</p>');

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
