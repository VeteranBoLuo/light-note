import pool from '../db/index.js';

const HELP_CATEGORY = '帮助中心';

async function ensureHelpSectionColumn() {
  const [columns] = await pool.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'knowledge_base'
        AND column_name = 'help_section'
      LIMIT 1`,
  );
  if (columns.length) return false;
  await pool.query(
    "ALTER TABLE `knowledge_base` ADD COLUMN `help_section` varchar(50) DEFAULT NULL COMMENT '帮助中心展示栏目；仅 category=帮助中心 时使用' AFTER `category`",
  );
  return true;
}

async function backfillHelpSections() {
  const [result] = await pool.query(
    `UPDATE knowledge_base
        SET help_section = CASE
          WHEN title REGEXP 'AI|智能|额度|权益|笔记助手|轻笺助手' THEN 'AI 与权益'
          WHEN title REGEXP '待办|任务|提醒|日历|待处理' THEN '待办与提醒'
          WHEN title REGEXP '云空间|云文件|文件夹|文件预览|文件分享|上传方式|存储空间|扩容' THEN '云空间'
          WHEN title REGEXP '笔记|Markdown|富文本|模板' THEN '笔记与编辑'
          WHEN title REGEXP '书签|标签|资源中心|整理|链接|网页|搜索|导入导出|收藏' THEN '收集与整理'
          WHEN title REGEXP '账号|账户|登录|注册|个人中心|成长|积分|设置|安全|隐私|回收站|数据恢复|备份' THEN '账号与设置'
          WHEN title REGEXP '共建|反馈|支持轻笺|聊天室|开源|官网|帮助中心地址' THEN '社区与支持'
          WHEN title REGEXP '快速|开始|入门|欢迎|总览|完整介绍|使用指南|功能路径|快捷键|安装|移动端' THEN '快速上手'
          ELSE '其他帮助'
        END
      WHERE category = ?
        AND (help_section IS NULL OR TRIM(help_section) = '')`,
    [HELP_CATEGORY],
  );
  return Number(result.affectedRows || 0);
}

try {
  const columnAdded = await ensureHelpSectionColumn();
  const backfilled = await backfillHelpSections();
  console.log('[help-section-migration] completed columnAdded=%s backfilled=%s', columnAdded, backfilled);
} catch (error) {
  console.error('[help-section-migration] failed code=%s', String(error?.code || error?.message || 'UNKNOWN'));
  process.exitCode = 1;
} finally {
  await pool.end();
}
