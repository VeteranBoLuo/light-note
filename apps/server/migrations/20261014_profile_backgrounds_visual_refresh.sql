-- 在 20261014_profile_backgrounds_knowledge.sql 之后执行；最高档视觉更新保留商品 ID、价格及持有权。
-- 仅获授权发布时同步帮助中心名称，不覆盖已有文章的其他内容；可重复执行。
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;
UPDATE knowledge_base
SET content = REPLACE(content, '星河夜航 1500 积分', '灵感星图 1500 积分')
WHERE (id = '34617ed7-632a-4f10-a2a8-7056a20cf211' OR title = '个人背景：社区名片与公开主页')
  AND type = 'html'
  AND content LIKE '%星河夜航 1500 积分%';

UPDATE knowledge_base
SET content = CONCAT(content, '<h2>背景动效与加载</h2><p>灵感星图包含星轨微光、晶核呼吸和星点闪烁。名片、公开主页及预览中的“暂停背景动效”或“播放背景动效”会同步控制当前会话的展示，不改变背景持有者的装扮。系统开启“减少动态效果”时自动使用静态展示；背景离开屏幕或页面进入后台时暂停动效。</p><p>商店列表使用静态缩略图；名片与公开主页先显示小图，再渐进显示共用的清晰图片，图片解码完成后才启用动效。最高档视觉更新沿用原商品，原“星河夜航”的持有者无需重新兑换。</p>')
WHERE (id = '34617ed7-632a-4f10-a2a8-7056a20cf211' OR title = '个人背景：社区名片与公开主页')
  AND type = 'html'
  AND content NOT LIKE '%<h2>背景动效与加载</h2>%';
COMMIT;
