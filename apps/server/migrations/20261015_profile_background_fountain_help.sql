-- 视觉更新沿用 background_stars、1500 积分及原持有权，仅在获授权发布时执行。
-- 在已有背景帮助迁移之后执行；只替换相关名称和动效描述，可重复执行。
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;
UPDATE knowledge_base
SET content = REPLACE(
  REPLACE(
    REPLACE(content,
      '灵感星图包含星轨微光、晶核呼吸和星点闪烁。',
      '灵感之泉呈现笔尖落墨、墨池涟漪、倒影波动和悬浮信笺。'),
    '灵感星图', '灵感之泉'),
  '金色星轨流光、晶核折光与层叠星辉', '紫晶墨流、层层涟漪与悬浮信笺')
WHERE id = '34617ed7-632a-4f10-a2a8-7056a20cf211'
  AND category = '帮助中心'
  AND type = 'html'
  AND (content LIKE '%灵感星图%' OR content LIKE '%金色星轨流光、晶核折光与层叠星辉%');
COMMIT;
