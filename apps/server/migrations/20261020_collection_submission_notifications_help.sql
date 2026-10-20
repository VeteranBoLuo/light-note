-- 公开收集新提交提醒帮助知识；MySQL 5.7 兼容、幂等。
-- 仅同步知识内容，随受授权的功能发布独立执行，不挂入应用启动。
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;
SET @collection_notice_help_id = 'fad2e4d3-fe3e-4169-8e4e-caea5b471735';
SET @collection_notice_help_title = '公开收集如何开启新提交提醒';
SET @collection_notice_help_content = '<h1>公开收集新提交提醒</h1>
<p>在<a href="/toolbox/forms">公开收集</a>打开自己的表单，进入“表单设置”，开启“收到新提交时通知我”，再点击“保存修改”。普通创建者也能使用，已发布的表单可以随时开关。</p>
<h2>默认关闭，仅提醒新的回答</h2>
<p>新建表单、已有表单和复制出的新表单都默认关闭。开启后，每份成功新增的回答会在通知中心提醒创建者；填写者修改已有回答或重复提交同一份回答，不会重复提醒。开启不会补发历史提交，关闭后停止产生新的提交通知。</p>
<p>提醒遵循账号的站内通知总开关。如果没有收到，请先检查表单设置是否已保存，以及账号的站内通知是否开启。历史允许多次提交的表单仍按每份新增回答提醒。</p>
<h2>通知包含什么</h2>
<p>通知标题包含表单名称，正文只提示收到新回答，不展示回答内容或填写者身份。点击通知进入对应表单的提交记录，只有表单创建者可以查看这些记录。</p>
<h2>与积分到账通知的区别</h2>
<p>新提交提醒发给表单创建者；积分到账通知发给实际获得奖励的填写者。两者相互独立，关闭创建者的新提交提醒不会停止表单已配置的积分奖励和到账通知。</p>';
INSERT INTO knowledge_base
  (id,title,content,category,help_section,status,type,sort,created_by,updated_by)
SELECT @collection_notice_help_id,@collection_notice_help_title,@collection_notice_help_content,
  '帮助中心','收集与整理','public','html',99,NULL,NULL
FROM DUAL WHERE NOT EXISTS (
  SELECT 1 FROM knowledge_base WHERE id=@collection_notice_help_id OR title=@collection_notice_help_title
);
SET @collection_notice_help_target = COALESCE(
  (SELECT id FROM knowledge_base WHERE id=@collection_notice_help_id LIMIT 1),
  (SELECT id FROM knowledge_base WHERE title=@collection_notice_help_title ORDER BY id LIMIT 1)
);
UPDATE knowledge_base SET title=@collection_notice_help_title,content=@collection_notice_help_content,
  category='帮助中心',help_section='收集与整理',status='public',type='html',sort=99,
  admin_archived=0,updated_by=NULL
WHERE id=@collection_notice_help_target;
COMMIT;
