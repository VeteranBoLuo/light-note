import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('../migrations/20260824_ai_usage_governance_knowledge.sql', import.meta.url);

describe('AI 用量治理公开帮助迁移', () => {
  it('解释真实扣费、平台修复、零扣费与免费资源保护边界', async () => {
    const source = await readFile(fileURLToPath(migrationUrl), 'utf8');

    expect(source).toContain('只有真正发出用户主模型调用时才按实际 token 扣除');
    expect(source).toContain('内部协议修复由平台承担');
    expect(source).toContain('缓存命中、无可用材料、确定性解析和纯本地处理不扣');
    expect(source).toContain('大小、页数、频率、并发与安全限制');
    expect(source).toContain('批量整理会保留已经完成的建议');
    expect(source).toContain('在设置中点击“AI 用量与计费规则”进入独立页面');
    expect(source).toContain('从设置中的“AI 用量与计费规则”入口进入独立页面后');
    expect(source).not.toContain('设置 → AI 用量 → 最近用量');
  });

  it('把网页正文存档与用户明确触发的 AI 摘要分开说明', async () => {
    const source = await readFile(fileURLToPath(migrationUrl), 'utf8');

    expect(source).toContain('网页存档和 AI 摘要现在是两个清楚分开的动作');
    expect(source).toContain('不调用模型、不消耗 AI 额度');
    expect(source).toContain('用户再明确点击“生成 AI 摘要”');
    expect(source).toContain('更新正文不会自动连带生成摘要');
  });

  it('固定文章 ID、事务和幂等 UPDATE，不读取或复制用户内容', async () => {
    const source = await readFile(fileURLToPath(migrationUrl), 'utf8');

    expect(source).toContain('START TRANSACTION;');
    expect(source).toContain('COMMIT;');
    expect(source).toContain("SET @ai_quota_id = '52d9bd49-6bb0-4ac8-a4fb-65c2d80401c7'");
    expect(source).toContain('WHERE id = @ai_quota_id');
    expect(source).not.toMatch(/INSERT\s+INTO\s+ai_(?:executions|provider_spans|skill_turns)/iu);
  });
});
