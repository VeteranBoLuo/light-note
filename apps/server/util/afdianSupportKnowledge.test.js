import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const knowledgeMigration = readFileSync(
  new URL('../migrations/20260825_support_donation_store_split_knowledge.sql', import.meta.url),
  'utf8',
);
const storeKnowledgeMigration = readFileSync(
  new URL('../migrations/20261023_support_packages_v5_knowledge.sql', import.meta.url),
  'utf8',
);

describe('自愿支持与资源商店公开知识', () => {
  it('最新商店帮助说明固定永久权益、免费额度优先和历史订单兼容', () => {
    expect(storeKnowledgeMigration).toContain('data-ln-policy:support-packages-v5');
    expect(storeKnowledgeMigration).toContain('一次购买，永久扩容');
    expect(storeKnowledgeMigration).toContain('一次购买，永久有效；优先使用每日免费额度');
    expect(storeKnowledgeMigration).toContain('不再提供首购加赠');
    expect(storeKnowledgeMigration).toContain('历史余额和已入账权益保持原样');
    expect(storeKnowledgeMigration).toContain('旧版订单按下单时保存的权益结算');
    expect(storeKnowledgeMigration).toContain('符合原首购规则的订单仍按原规则核验与发放');
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
