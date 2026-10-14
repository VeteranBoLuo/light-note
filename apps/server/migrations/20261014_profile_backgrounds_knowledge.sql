-- 获授权发布 C9 时同步，结构迁移与前后端就绪后执行；不覆盖既有补签卡说明。
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;
SET @background_help_id = '34617ed7-632a-4f10-a2a8-7056a20cf211';
SET @background_help_title = '个人背景：社区名片与公开主页';
SET @background_help_content = '<h1>个人背景</h1>
<p>在成长中心 → 资产与奖励 → 兑换中选择个人背景。也可以从自己的公开主页点击“更换背景”。</p>
<ul>
<li>纸上青山 600 积分、晴空来信 800 积分、落日海岸 1000 积分、星河夜航 1500 积分，均无等级门槛。</li>
<li>兑换一次永久拥有，社区名片和公开主页共用，不需要分别兑换，不可重复购买同一款。</li>
<li>兑换前可以同时预览名片与主页的效果，图片会按容器比例裁切。背景只装饰顶部身份区域，不改变成就和帖子正文。</li>
<li>兑换不会自动替换当前背景。成功后点击“使用背景”，两处将使用同一款；也可在个人背景区域随时切换已拥有的款式。</li>
<li>点击“恢复默认”即可还原原有样式，已兑换背景仍然保留，之后可免费重新使用。</li>
</ul>';
INSERT INTO knowledge_base (id, title, content, category, help_section, status, type, sort, created_by, updated_by)
SELECT @background_help_id, @background_help_title, @background_help_content, '帮助中心', '账号与设置', 'public', 'html', 99, NULL, NULL
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @background_help_id OR title = @background_help_title);
UPDATE knowledge_base SET content = @background_help_content, category = '帮助中心', help_section = '账号与设置',
 status = 'public', type = 'html', sort = 99, admin_archived = 0, updated_by = NULL
WHERE id = @background_help_id OR title = @background_help_title;
COMMIT;
