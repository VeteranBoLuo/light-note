-- 知识工具箱公开帮助同步。
-- MySQL 5.7 兼容、幂等；只更新 knowledge_base，不修改业务 Schema，也不随结构迁移自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @toolbox_help_id = '04cb4511-eea5-4f89-bd96-ed05e74ecfca';
SET @toolbox_help_title = '如何使用知识工具箱，以及积分和 AI 额度怎样计算';
SET @toolbox_help_content = '知识工具箱用于把已有资料直接加工成可继续使用的文件或知识成果。电脑端可从顶部“工具箱”进入；手机端可从底部中间的“工具箱”进入。

## 免费的本地工具
PDF 页面整理和图片压缩在当前浏览器内完成，原文件不会上传到轻笺服务器，也不会创建云端处理任务。关闭页面前请下载处理结果；本地结果不会自动保存到云空间。

图片压缩会分别标出“压缩前”和“压缩后”的预览、体积和尺寸。默认保留原图尺寸；压缩后反而更大时也会明确提示，你可以调整格式或质量后重新处理。

## 消耗积分的知识工具
资料转笔记、研究简报、学习套件、概念图谱、多资料对照、知识库体检和 OCR 转文字会在开始前展示本次积分报价。报价与本次所选材料绑定，过期或材料发生变化后需要重新计算；只有你确认后才会开始任务。

任务开始时先预占报价积分。完整成功按确认价结算；部分成功会按规则退回差额；失败、取消或没有生成可用成果时会释放应退积分。任务页可以查看报价、实际消耗和退回数量。

## 会不会同时消耗 AI 额度
同一次积分工具任务只消耗积分，不会再扣用户 AI 额度。成果页不提供工具内追问；保存为笔记后如使用笔记助手，那是笔记模块的独立功能，并遵循该模块自身的额度与提示规则。

## 成果保存
服务端工具的结果会先作为独立成果展示。只有点击“存入笔记”后才会创建笔记；重复点击或网络重试不会重复创建。研究速读包属于待核验草稿，请结合来源覆盖、冲突和未知项检查后再作为正式结论使用。';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT @toolbox_help_id, @toolbox_help_title, @toolbox_help_content,
       '帮助中心', 'public', 'markdown', 98, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @toolbox_help_id)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @toolbox_help_title);

UPDATE knowledge_base
SET content = @toolbox_help_content,
    category = '帮助中心', status = 'public', type = 'markdown', sort = 98,
    admin_archived = 0, updated_by = NULL
WHERE id = @toolbox_help_id OR title = @toolbox_help_title;

COMMIT;

SELECT id, title, status, type, sort, CHAR_LENGTH(content) AS content_length
  FROM knowledge_base
 WHERE id = @toolbox_help_id OR title = @toolbox_help_title;
