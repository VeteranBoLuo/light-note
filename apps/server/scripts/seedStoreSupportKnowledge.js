/**
 * 资源商店不再提供赞助入口、支持者榜和历史赞助记录后，同步帮助中心与 AI 知识库：
 *
 * - 「如何购买 AI 额度与云空间」：去掉旧赞助页与历史赞助的说明，订单记录只描述资源购买。
 * - 「支持轻笺与历史赞助记录」：归档（与后台「归档」相同：转为内部并标记归档，可在后台恢复），公开链接不再可见。
 *
 * 只处理内容仍与上一版维护结果一致的条目（按正文 SHA-256 核对）；已是目标状态则跳过，其他变化一律停止，不覆盖人工修改。
 * 口径以 docs/support-packages.md 与资源商店页面为准。
 * 用法：node scripts/seedStoreSupportKnowledge.js          只读预览
 *       node scripts/seedStoreSupportKnowledge.js --apply  写入（需对应的线上内容写入授权）
 */
import { createHash } from 'node:crypto';
import pool from '../db/index.js';
import { invalidateKnowledgeCache } from '../util/knowledgeService.js';
import { knowledgeSnapshotHash, updateKnowledgeBaseById } from '../util/services/knowledgeBaseService.js';

const STORE_CONTENT = [
  '<!-- data-ln-policy:support-packages-v5 -->',
  '<h1>资源商店</h1>',
  '<p><a href="/store">资源商店</a> 是购买永久 AI 额度、永久云空间和组合套餐的唯一入口。电脑端从右上角个人中心进入，手机端在「我的」里进入。</p>',
  '<h2>一次购买，永久有效；优先使用每日免费额度</h2>',
  '<p>AI 与组合套餐每次购买都按页面标示的固定 AI 额度到账，不再提供首购加赠。每天先使用每日免费额度，再使用购买的永久 AI 余额；购买余额不会按日清零。</p>',
  '<h2>一次购买，永久扩容</h2>',
  '<p>云空间套餐每次购买都按页面标示的固定容量永久叠加到当前账号，无需续费，不区分首次购买与再次购买，也没有空间首购加赠。组合套餐的云空间同样固定到账。</p>',
  '<h2>每单 1 份</h2>',
  '<p>每个套餐每单固定购买 1 份。需要更多额度或空间时可以再次购买，每次都按页面标示的数量叠加到当前账号。</p>',
  '<h2>限时套餐</h2>',
  '<p>限时套餐直接展示最终售价、最终到账、有效期和个人限购。请核对活动截止时间与可购买次数。</p>',
  '<h2>下单与付款</h2>',
  '<p>购买前需要登录轻笺，但不需要预先关联爱发电。确认套餐后会前往爱发电的对应商品付款，套餐和金额已按你的选择确定。轻笺会锁定当前账号、套餐版本、金额和权益快照，付款确认后自动到账。</p>',
  '<h2>请从商店选择套餐</h2>',
  '<p>不经过资源商店、直接在爱发电主页完成的付款，不会按金额自动匹配套餐，也不会发放 AI 额度或云空间。型号或数量与所选套餐不一致、少付、多付、超时付款或身份冲突，都会暂停到账并进入人工核对，不会改发其他权益。</p>',
  '<h2>订单记录</h2>',
  '<p>资源商店里的「订单记录」显示当前账号每笔资源购买的到账情况。</p>',
  '<h2>历史余额、旧订单与退款</h2>',
  '<p>历史余额和已入账权益保持原样。旧版订单按下单时保存的权益结算，符合原首购规则的订单仍按原规则核验与发放，不会按新版额度削减。重复回调只回放原结果；退款或订单反转进入人工核对，不自动扣成负资产，也不恢复已经使用的历史首购资格。</p>',
].join('');

export const ENTRIES = [
  {
    action: 'update',
    id: '1d5ce955-326b-4f6c-9e7e-1ea704dca0a2',
    expectedTitle: '如何购买 AI 额度与云空间',
    expectedContentSha256: '5f6ef670a0969a5596b2a09085661ce6f54e1f571fe5cf0bb806e4f0b2cc3d72',
    title: '如何购买 AI 额度与云空间',
    content: STORE_CONTENT,
  },
  {
    action: 'archive',
    id: '80b98e73-84c0-4d0a-8dc2-5bd993bc59ae',
    expectedTitle: '支持轻笺与历史赞助记录',
    expectedContentSha256: '0ef98c07d23801aed9dea7df4c5299ec5b479d70db5c5a2521ded6b397cc94b7',
  },
];

const sha256 = (value) =>
  createHash('sha256')
    .update(String(value ?? ''), 'utf8')
    .digest('hex');

export function classifyEntry(entry, row) {
  if (!row) return 'missing';
  const archived = Number(row.admin_archived || 0) === 1;
  const matchesExpected = row.title === entry.expectedTitle && sha256(row.content) === entry.expectedContentSha256;
  if (entry.action === 'archive') {
    if (archived) return matchesExpected ? 'already' : 'changed';
    return matchesExpected ? 'ready' : 'changed';
  }
  if (archived) return 'archived';
  if (row.title === entry.title && row.content === entry.content) return 'already';
  return matchesExpected ? 'ready' : 'changed';
}

async function archiveEntry({ entry, row, userId }) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[current]] = await connection.query('SELECT * FROM knowledge_base WHERE id = ? FOR UPDATE', [entry.id]);
    if (!current || knowledgeSnapshotHash(current) !== knowledgeSnapshotHash(row)) {
      throw new Error(`KNOWLEDGE_CHANGED: ${entry.id} 在预检后发生变化`);
    }
    await connection.query(
      "UPDATE knowledge_base SET status = 'internal', admin_archived = 1, updated_by = ? WHERE id = ? AND COALESCE(admin_archived, 0) = 0",
      [userId, entry.id],
    );
    await connection.commit();
    invalidateKnowledgeCache();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function main() {
  const apply = process.argv.includes('--apply');
  const plans = [];
  for (const entry of ENTRIES) {
    const [[row]] = await pool.query('SELECT * FROM knowledge_base WHERE id = ?', [entry.id]);
    const state = classifyEntry(entry, row);
    plans.push({ entry, row, state });
    console.log(`[store-support-knowledge] ${state} ${entry.action} ${entry.id} 「${row?.title ?? '-'}」`);
  }
  const blocked = plans.filter((plan) => !['ready', 'already'].includes(plan.state));
  if (blocked.length) {
    throw new Error(`条目已不是上一版维护结果，停止且不写入：${blocked.map((plan) => plan.entry.id).join(', ')}`);
  }
  if (!apply) {
    console.log('[store-support-knowledge] 只读预览完成；确认后追加 --apply 写入');
    return;
  }
  const [[root]] = await pool.query(
    "SELECT id FROM user WHERE role = 'root' AND del_flag = 0 ORDER BY create_time LIMIT 1",
  );
  if (!root?.id) throw new Error('未找到 root 用户，无法写入知识库');
  for (const { entry, row, state } of plans) {
    if (state === 'already') continue;
    if (entry.action === 'archive') {
      await archiveEntry({ entry, row, userId: root.id });
      console.log(`[store-support-knowledge] archived ${entry.id}`);
      continue;
    }
    await updateKnowledgeBaseById({
      userId: root.id,
      id: entry.id,
      patch: { title: entry.title, content: entry.content },
      expectedSnapshot: knowledgeSnapshotHash(row),
    });
    console.log(`[store-support-knowledge] updated ${entry.id} → ${entry.title}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(async () => {
      await pool.end().catch(() => {});
      process.exit(0);
    })
    .catch(async (error) => {
      console.error('[store-support-knowledge] 失败:', error?.message || error);
      await pool.end().catch(() => {});
      process.exit(1);
    });
}
