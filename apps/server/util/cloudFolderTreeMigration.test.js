import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('../migrations/20260821_cloud_folder_tree.sql', import.meta.url);
const knowledgeUrl = new URL('../migrations/20260821_cloud_folder_tree_knowledge.sql', import.meta.url);
const assertionsUrl = new URL('../migrations/schema-assertions.sql', import.meta.url);
const baselineUrl = new URL('../tag_db.sql', import.meta.url);

describe('云空间目录树迁移门禁', () => {
  it('以 MySQL 5.7 兼容方式幂等补齐父级列和 owner 目录索引', async () => {
    const [migration, baseline] = await Promise.all([
      readFile(fileURLToPath(migrationUrl), 'utf8'),
      readFile(fileURLToPath(baselineUrl), 'utf8'),
    ]);

    expect(migration).toContain("column_name = 'parent_id'");
    expect(migration).toContain('ADD COLUMN `parent_id` int(11) NULL');
    expect(migration).toContain('idx_folders_owner_parent_order');
    expect(migration).not.toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS/iu);
    expect(baseline).toContain('`parent_id` int(11) DEFAULT NULL');
    expect(baseline).toContain('`idx_folders_owner_parent_order`');
  });

  it('只读 Schema 门禁检查孤儿、跨账号父级、循环和超过 8 层', async () => {
    const assertions = await readFile(fileURLToPath(assertionsUrl), 'utf8');

    expect(assertions).toContain('[52] missing_cloud_folder_parent_column');
    expect(assertions).toContain('[52] invalid_cloud_folder_tree_index');
    expect(assertions).toContain('[52] invalid_cloud_folder_parent');
    expect(assertions).toContain('[52] cloud_folder_depth_or_cycle_exceeded');
    expect(assertions).toContain('JOIN folders f8');
  });

  it('帮助知识明确无可见根节点、跨层拖放、目录删除与书签标签差异', async () => {
    const source = await readFile(fileURLToPath(knowledgeUrl), 'utf8');

    expect(source).toContain('页面不会额外显示“根目录”节点');
    expect(source).toContain('目录最多支持 8 层');
    expect(source).toContain('拖到“全部文件”可变为第一层文件夹');
    expect(source).toContain('目录内文件不会被删除');
    expect(source).toContain('删除目录内全部文件');
    expect(source).toContain('书签继续使用标签分类');
    expect(source).toContain("WHERE title = '为什么新账号里已经有书签、笔记、标签和文件'");
    expect(source).toContain("WHERE title = '轻笺智域：上传文件进行摘要、问答和生成笔记'");
    expect(source).toContain('WHERE id = @cloud_folder_help_target_id');
    expect(source).not.toContain('WHERE id = @cloud_folder_help_id OR title = @cloud_folder_help_title');
  });
});
