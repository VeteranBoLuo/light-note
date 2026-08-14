-- 爱发电赞助记录、累计榜和隐私偏好帮助知识（MySQL 5.7、幂等）。
-- 仅同步 knowledge_base 内容，不修改结构；不随部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @support_help_id = '80b98e73-84c0-4d0a-8dc2-5bd993bc59ae';
SET @support_help_title = '如何自愿支持轻笺';
SET @support_help_content = '<h1>轻笺会一直免费</h1><p>轻笺的核心记录与整理能力永久免费。赞助完全自愿，不会解锁核心功能，也不会影响未赞助用户的使用权益。</p><h2>从哪里进入</h2><p>电脑端打开右上角个人中心菜单，选择“支持轻笺”；手机端进入底部“我的”，选择“支持轻笺”。也可以直接访问 <a href="/support">/support</a>。</p><h2>不关联爱发电账号也能记录吗</h2><p>可以。登录轻笺后从支持页选择赞助入口，轻笺会生成一个有时效的一次性下单凭证；订单经爱发电 API 复核后可归入当前轻笺账号。直接从爱发电其他入口赞助、且没有关联账号时，轻笺无法知道对应的是哪个轻笺用户。</p><h2>OAuth 关联有什么作用</h2><p>OAuth 关联完全可选，用于把同一爱发电账号的历史和后续真实订单归并到轻笺账号。关联不会接触爱发电密码或支付口令，也可随时解除。同一爱发电订单只保存一条，后续关联只补充归属，不会生成两份数据。</p><h2>赞助记录在哪里看</h2><p>登录后打开支持页，可以查看当前关联的爱发电账号、累计确认金额、订单数、最近确认时间和最近三笔已确认订单。这里只使用爱发电 API 确认的真实订单。</p><h2>累计榜会公开什么</h2><p>已确认并归属到轻笺账号的赞助默认以“匿名支持者”参与累计榜。你可以在支持页主动公开自己的轻笺昵称和头像，也可以随时恢复匿名或退出榜单。爱发电昵称不会用于公开展示。历史订单没有可信的逐单支付时间，因此轻笺不会用同步时间伪造月榜；月榜会在可靠数据覆盖完整周期后再开放。</p><h2>隐私与安全</h2><p>轻笺不保存付款码、支付密码、订单留言或收货地址。管理员不能替用户开启公开身份，只能在安全或合规需要时隐藏公开信息，并留下操作审计。</p><h2>除了赞助还能怎样支持</h2><p>持续使用、提交反馈、分享轻笺或参与共建，都是对这个免费项目很珍贵的支持。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @support_help_id, @support_help_title, @support_help_content,
  '帮助中心', 'public', 'html', 97, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @support_help_id)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @support_help_title);

UPDATE knowledge_base
SET content = @support_help_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    sort = 97,
    updated_by = NULL
WHERE id = @support_help_id OR title = @support_help_title;

COMMIT;
