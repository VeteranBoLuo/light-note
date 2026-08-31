import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const knowledgeMigration = readFileSync(
  new URL('../migrations/20260825_support_donation_store_split_knowledge.sql', import.meta.url),
  'utf8',
);
const storeV3KnowledgeMigration = readFileSync(
  new URL('../migrations/20260831_support_packages_v3_knowledge.sql', import.meta.url),
  'utf8',
);

describe('自愿支持与资源商店公开知识', () => {
  it('最新商店帮助说明账号级 AI 首购与分档空间首购', () => {
    expect(storeV3KnowledgeMigration).toContain('data-ln-policy:support-packages-v3');
    expect(storeV3KnowledgeMigration).toContain('首次购买 AI 或组合套餐时 AI 额度加赠 20%');
    expect(storeV3KnowledgeMigration).toContain('其他 AI 与组合档位都按基础值到账');
    expect(storeV3KnowledgeMigration).toContain('纯空间套餐的首购容量按各档独立计算');
    expect(storeV3KnowledgeMigration).not.toContain('每一档套餐的首次优惠独立计算');
  });

  it('同步解释两类入口、直接爱发电订单和历史兼容边界', () => {
    expect(knowledgeMigration).toContain('如何支持轻笺');
    expect(knowledgeMigration).toContain('支持与购买分别记录');
    expect(knowledgeMigration).toContain('直接在爱发电主页完成的付款会记录为自愿支持');
    expect(knowledgeMigration).toContain('资源商店购买不会计入支持者榜');
    expect(knowledgeMigration).toContain('拆分前已按旧规则发放的 AI 余额继续保留');
    expect(knowledgeMigration).toContain('href="/store"');
    expect(knowledgeMigration).toContain('href="/support"');
    expect(knowledgeMigration).not.toContain('权益商店');
    expect(knowledgeMigration).not.toContain('每实付 ¥1 赠送 10 万');
    expect(knowledgeMigration).toContain("LOCATE('data-ln-policy:support-packages-v'");
  });
});
