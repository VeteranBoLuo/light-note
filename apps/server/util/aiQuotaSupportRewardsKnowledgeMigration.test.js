import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('../migrations/20260825_ai_quota_and_support_rewards_knowledge.sql', import.meta.url);

const quotaMigrationUrls = [
  '../migrations/20260724_ai_quota_expansion_knowledge.sql',
  '../migrations/20260808_growth_page_knowledge_sync.sql',
  '../migrations/20260824_ai_skills_knowledge_sync.sql',
  '../migrations/20260824_ai_skills_public_knowledge_refresh.sql',
  '../migrations/20260824_ai_skills_remove_legacy_conversations.sql',
  '../migrations/20260824_ai_usage_governance_knowledge.sql',
  '../migrations/20260825_ai_usage_call_details_knowledge.sql',
].map((path) => new URL(path, import.meta.url));

const supportMigrationUrls = [
  '../migrations/20260808_afdian_support_knowledge.sql',
  '../migrations/20260813_afdian_integration_knowledge.sql',
  '../migrations/20260814_afdian_support_management_knowledge.sql',
].map((path) => new URL(path, import.meta.url));

const pointsMigrationUrls = [
  '../migrations/20260717_knowledge_base_feature_sync.sql',
  '../migrations/20260724_ai_quota_expansion_knowledge.sql',
  '../migrations/20260808_growth_page_knowledge_avatar_frames.sql',
  '../migrations/20260808_growth_page_knowledge_sync.sql',
  '../migrations/20260811_growth_achievement_avatar_frames.sql',
  '../migrations/20260813_points_economy_c4_knowledge.sql',
  '../migrations/20260814_points_earning_c5_knowledge.sql',
].map((path) => new URL(path, import.meta.url));

async function sources(urls) {
  return Promise.all(urls.map((url) => readFile(fileURLToPath(url), 'utf8')));
}

describe('AI 额度与赞助赠送公开知识迁移', () => {
  it('固定更新额度、积分和赞助三篇文章，并完整披露当前规则', async () => {
    const source = await readFile(fileURLToPath(migrationUrl), 'utf8');

    expect(source).toContain('START TRANSACTION;');
    expect(source).toContain('COMMIT;');
    expect(source).toContain('52d9bd49-6bb0-4ac8-a4fb-65c2d80401c7');
    expect(source).toContain('11a21140-7ecf-117e-8c23-96d5e1f6a052');
    expect(source).toContain('80b98e73-84c0-4d0a-8dc2-5bd993bc59ae');
    expect(source).toContain('Lv.10～15 为 105、120、140、160、180、200 万 tokens/日');
    expect(source).toContain('user、test 与 root 都按各自真实成长等级计算');
    expect(source).toContain('240 积分兑换 30 万，420 积分兑换 60 万 tokens');
    expect(source).toContain('每实付 ¥1 赠送 10 万 tokens');
    expect(source).toContain('超过 ¥200 的单笔赠送需管理员复核');
    expect(source).toContain('策略启用前的历史订单不追溯赠送');
    expect(source).toContain('不会把余额扣成负数');
    expect(source).toContain('逐次调用详情');
    expect(source).toContain('修复由后端代码门禁判定');
    expect(source).toContain('不保存或显示问题、正文、标题、网址、图片和模型回答');
  });

  it('所有可重跑的额度与赞助知识源都不会覆盖回旧规则', async () => {
    for (const source of await sources(quotaMigrationUrls)) {
      expect(source).toContain('Lv.1～5 分别为 30、35、40、45、50 万');
      expect(source).toContain('每实付 ¥1 赠送 10 万 tokens');
      expect(source).not.toContain('Lv.15“文圣”每日 400 万');
      expect(source).not.toContain('Lv.1 为 50 万 tokens，Lv.15 为 400 万');
    }
    for (const source of await sources(supportMigrationUrls)) {
      expect(source).toContain('¥6、¥18、¥50 分别赠送 60 万、180 万、500 万');
      expect(source).toContain('单笔实付超过 ¥200 需要管理员人工复核');
      expect(source).not.toContain('赞助后不会自动发放积分、经验或徽章');
    }
  });

  it('所有仍会写积分商店文章的脚本都保留 C4 价格与抽奖口径', async () => {
    for (const source of await sources(pointsMigrationUrls)) {
      expect(source).toContain('240 积分');
      expect(source).toContain('420 积分');
      expect(source).toContain('单抽 170');
      expect(source).toContain('十连 1600');
      expect(source).not.toContain('AI 轻量加油包：90 积分');
      expect(source).not.toContain('AI 加油包：150 积分');
      expect(source).not.toContain('抽奖单抽 88');
    }
  });
});
