-- 获授权发布时执行；仅替换已发布的手动动效控制说明，保留文章其他内容，可重复执行。
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;
UPDATE knowledge_base
SET content = REPLACE(
  REPLACE(content,
    '灵感星图包含星轨微光、晶核呼吸和星点闪烁。名片、公开主页及预览中的“暂停背景动效”或“播放背景动效”会同步控制当前会话的展示，不改变背景持有者的装扮。',
    '落日海岸呈现书页灯塔、灯光呼吸和水面流光；灵感星图包含星轨微光、晶核呼吸和星点闪烁。名片、公开主页及预览中的背景自动播放，不提供手动播放或暂停入口。'),
  '商店列表使用静态缩略图；',
  '商店列表按显示尺寸和屏幕像素密度选择清晰图片，保留懒加载，并与预览共用图片缓存；')
WHERE id = '34617ed7-632a-4f10-a2a8-7056a20cf211'
  AND type = 'html'
  AND (content LIKE '%暂停背景动效%' OR content LIKE '%商店列表使用静态缩略图%');
COMMIT;
