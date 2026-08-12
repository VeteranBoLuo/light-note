-- 2026-08-12 云空间共享容量与新等级曲线帮助知识（MySQL 5.7 兼容、幂等）
-- 仅同步 knowledge_base 业务内容，不修改表结构；不随部署脚本自动执行。

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
START TRANSACTION;

SET @storage_help_id = 'f0721b1d-90ca-4fca-9f34-7cf8d797cc6a';
SET @storage_help_title = '云空间容量、扩容与回收站';
SET @storage_help_content = '<h1>云空间容量如何计算</h1><p>云空间中的当前文件和回收站文件共用同一份账号容量。把文件移入回收站不会释放空间，恢复文件也不会重复占用；只有彻底删除、清空回收站或系统按保留期完成物理清理后，容量才会释放。</p><h2>等级基础容量</h2><p>Lv.1 至 Lv.15 的基础容量依次为：1GB、1.25GB、1.5GB、1.75GB、2GB、2.5GB、3GB、4GB、5GB、6GB、8GB、10.5GB、13.5GB、16.5GB、20GB。升级会自动提高基础容量，不需要手动领取。</p><h2>永久扩容</h2><p>积分兑换、签到里程碑、抽奖或运营补发获得的扩容会永久叠加在等级容量上。目前积分商店提供 128MB、512MB 和 2GB 扩容包；升级不会覆盖已经获得的永久扩容。</p><h2>容量不足时怎么办</h2><ul><li>打开云空间顶部容量详情，查看当前文件、回收站、等级容量和永久扩容的拆分；</li><li>彻底删除不再需要的回收站文件；</li><li>完成成长任务提升等级；</li><li>使用积分兑换永久扩容包。</li></ul><p>同名覆盖上传按替换前后的文件大小差额计算，不会把旧文件和新文件重复计费。上传前会先做容量预检，写入记录前还会按对象存储中的实际文件大小再次校验。</p>';

INSERT INTO knowledge_base
  (id, title, content, category, status, type, sort, created_by, updated_by)
SELECT
  @storage_help_id, @storage_help_title, @storage_help_content,
  '帮助中心', 'public', 'html', 96, NULL, NULL
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM knowledge_base WHERE id = @storage_help_id)
  AND NOT EXISTS (SELECT 1 FROM knowledge_base WHERE title = @storage_help_title);

UPDATE knowledge_base
SET title = @storage_help_title,
    content = @storage_help_content,
    category = '帮助中心',
    status = 'public',
    type = 'html',
    sort = 96,
    updated_by = NULL
WHERE id = @storage_help_id OR title = @storage_help_title;

COMMIT;

SELECT id, title, category, status, type, sort, CHAR_LENGTH(content) AS content_length
FROM knowledge_base
WHERE id = @storage_help_id OR title = @storage_help_title;

-- 执行后需重启后端：知识检索有进程内缓存，新内容才会立即生效。
