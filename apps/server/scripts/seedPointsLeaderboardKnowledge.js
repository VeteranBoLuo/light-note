import pool from '../db/index.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';
import { upsertKnowledgeBase } from '../util/services/knowledgeBaseService.js';

const entry = {
  title: '积分排行榜怎样计分和发奖',
  category: '帮助中心',
  helpSection: 'AI 与权益',
  status: 'public',
  type: 'markdown',
  content: `# 积分排行榜

在成长中心打开「排行榜」，也可以从知识庄园的「更多」直接进入周榜。有榜分时会自动参与排名，榜单上方显示自己的实际名次。公开列表展示前 20 名的昵称、头像和社区 ID。昵称和头像可在个人资料里修改。

榜分累计签到、每日任务、周挑战、卖出作物和免费竿钓获的水族首销时实际到账的积分。鱼饵钓获、鱼苗袋购入、赎回后再次卖出和来源无法核验的水族只增加钱包余额。总榜还计入成就和连签里程碑。抽奖、每日惊喜、活动、后台发放和榜单奖励都计 0 分。消费后已获得的榜分继续保留。

周榜按北京时间每周一零点结算，月榜每月 1 日重新累计，总榜显示历史累计。每个有签到、任务或周挑战积分到账，或成功收获作物的自然日，算 1 个有效日。

首个完整周只记录排名，奖励卡展示正式周榜档位。正式周榜满 100 分、至少 3 个有效日可达标。席位按达标人数的一半向下取整，最多 3 席，依次发放 88、77、66 积分。奖励自动到账，可在背包获得记录查看。月榜和总榜仅展示排名。`,
};

try {
  if (process.argv.includes('--apply')) {
    const [[root]] = await pool.query("SELECT id FROM user WHERE role = 'root' AND del_flag = 0 ORDER BY create_time LIMIT 1");
    if (!root) throw new Error('KNOWLEDGE_OWNER_MISSING');
    await upsertKnowledgeBase({ userId: root.id, input: entry });
    console.log('[leaderboard-knowledge] saved %s', entry.title);
  } else {
    console.log('[leaderboard-knowledge] %s', entry.title);
  }
} catch (error) {
  console.error('[leaderboard-knowledge] failed code=%s', stableAgentErrorCode(error));
  process.exitCode = 1;
} finally {
  await pool.end();
}
