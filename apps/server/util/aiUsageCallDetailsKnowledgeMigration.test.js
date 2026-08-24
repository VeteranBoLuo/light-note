import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const files = [
  new URL('../migrations/20260824_ai_usage_governance_knowledge.sql', import.meta.url),
  new URL('../migrations/20260824_ai_skills_public_knowledge_refresh.sql', import.meta.url),
  new URL('../migrations/20260825_ai_usage_call_details_knowledge.sql', import.meta.url),
];

describe('AI 用量逐次调用详情公开帮助', () => {
  it('所有仍可重跑的知识写入源都保留当前详情能力和隐私边界', async () => {
    for (const file of files) {
      const source = await readFile(fileURLToPath(file), 'utf8');
      expect(source).toContain('逐次调用详情');
      expect(source).toContain('修复由后端代码门禁判定');
      expect(source).toContain('历史上未保存具体原因的记录会明确标注');
      expect(source).toContain('不保存或显示问题、正文、标题、网址、图片和模型回答');
    }
  });

  it('线上增量迁移固定文章、事务和幂等 UPDATE', async () => {
    const source = await readFile(fileURLToPath(files[2]), 'utf8');
    expect(source).toContain('START TRANSACTION;');
    expect(source).toContain('COMMIT;');
    expect(source).toContain("SET @ai_quota_id = '52d9bd49-6bb0-4ac8-a4fb-65c2d80401c7'");
    expect(source).toContain('WHERE id = @ai_quota_id');
    expect(source).not.toMatch(/INSERT\s+INTO\s+ai_(?:executions|provider_spans|skill_turns)/iu);
  });
});
