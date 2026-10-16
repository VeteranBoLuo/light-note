-- 个人装扮入口上线时执行。只补充既有背景帮助，不覆盖款式、价格与动效说明。
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;
UPDATE knowledge_base
SET content = CONCAT(content, '<h2>在个人资料中搭配装扮</h2><p>打开编辑资料，点击“个人装扮”，可以在同一窗口切换背景与头像框。顶部预览展示搭配效果；点击卡片只是试穿，不会立即修改当前装扮。</p><ul><li>背景兑换后永久拥有，点击“使用背景”才会应用。资料页、社区名片与公开主页共用同一背景，无需重复兑换。</li><li>已拥有的头像框点击“使用”即可佩戴；可兑换的头像框确认后会兑换并使用，符合条件的成就头像框可以领取并使用。</li><li>“还原”会取消当前试穿。选择默认背景或不佩戴头像框后，仍需点击底部操作确认；已经拥有的装扮会保留。</li><li>使用装扮会立即同步；昵称和社区简介仍需在编辑资料中另行保存。</li></ul>')
WHERE id = '34617ed7-632a-4f10-a2a8-7056a20cf211'
  AND category = '帮助中心' AND type = 'html'
  AND content NOT LIKE '%<h2>在个人资料中搭配装扮</h2>%';
COMMIT;
