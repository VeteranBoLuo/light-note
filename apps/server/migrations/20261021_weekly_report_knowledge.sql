-- 周报新版发布时再执行；仅维护该专题，保留其他成长、积分帮助文章。
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;
SET @weekly_report_id = '9b48d748-9d7b-4dc8-b5b0-e0218d4e7b39';
SET @weekly_report_title = '成长周报：查看、分享与统计口径';
SET @weekly_report_content = '## 查看成长周报
在“我的成长”打开成长周报，可切换“本周”和“上周”。本周按账号时区统计周一至今天，并对比上周相同日期范围；上周统计完整七天，并对比再前一周。每周一的周报通知展示上周快照，较早通知保留其原始统计。

## 数字含义
记录数包含新增书签、笔记、文件，以及完成待办和整理资源；新增与完成会分开展示。活跃天数只计有上述记录的天，签到单独统计，柱子下的圆点表示该日签到。教学示例不计入新增资源。资源和完成状态变化可能影响实时周报，通知快照保留生成时的数字。

## 仅你可见
私密区域提供同期对比、最近新增的书签／笔记／文件和本周挑战，可打开资料、前往完成或领取已达成奖励。内容列表最多显示最近 20 项，完整数量以分类统计为准。条目标题只在本人实时查看时返回，不存入通知快照；管理员代看也不返回标题。

## 下载、分享与保存
周报卡只包含汇总数字、昵称、头像和等级，不包含资料标题或正文。电脑与手机导出的画布尺寸一致。可以下载图片、通过系统支持的文件分享方式分享，或保存到云空间“周报”文件夹；环境不支持文件分享时回退下载。没有记录、签到或经验时不能生成空白周报卡，可切换到上周。管理员代看不允许保存到目标账号云空间。

成长周报用于回顾在轻笺中的记录，与笔记模板中的工作周报不同。';

INSERT INTO knowledge_base (id,title,content,category,help_section,status,type,sort,created_by,updated_by)
SELECT @weekly_report_id,@weekly_report_title,@weekly_report_content,'帮助中心','账号与设置','public','markdown',98,NULL,NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id=@weekly_report_id OR title=@weekly_report_title);

UPDATE knowledge_base
SET content=@weekly_report_content,help_section='账号与设置',updated_by=NULL
WHERE (id=@weekly_report_id OR title=@weekly_report_title)
  AND category='帮助中心' AND status='public' AND type='markdown';
COMMIT;
