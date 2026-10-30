/**
 * 同步「年度报告」的帮助中心与 AI 知识库条目。
 *
 * 按标题幂等：已存在则更新正文，不存在才新建，可重复执行。
 * 时间与口径以 packages/shared/annualReport.js 和 util/annualReport/rules.js 为准，调整时同步本文件。
 * 用法：node scripts/seedAnnualReportKnowledge.js（随年度报告上线执行）
 */
import pool from '../db/index.js';
import { upsertKnowledgeBase } from '../util/services/knowledgeBaseService.js';

const ENTRIES = [
  {
    title: '年度报告：在哪里看、分享与统计口径',
    category: '帮助中心',
    helpSection: '账号与设置',
    status: 'public',
    type: 'markdown',
    content: `# 年度报告

年度报告回顾你这一年在轻笺留下的记录：收藏的书签、写下的笔记、上传的文件、完成的待办和整理过的资料，最后生成一张可以保存或分享的年度海报。

## 什么时候能看

- 2026 年度报告从 2026 年 12 月 15 日起开放。
- 12 月 31 日之前看到的是预览版，统计到前一天，每天更新；2027 年 1 月 1 日起数据定稿。

## 在哪里打开

- 成长中心：「2026 年度报告」按钮（手机端在成长中心页头下方），没看过时带红点。
- 手机「今日」页顶部：没看过时显示一行入口，看过或点「不再显示」后不再出现。
- 12 月 15 日起会收到一条站内通知，点开即可查看。
- 入口显示到 2027 年 1 月 31 日，之后收起；报告仍可以从当时的通知打开。

## 统计口径

- 按你的账号时区划分自然年。
- 已删除的内容和新手示例资料不计入。
- 批量导入不计入：同一类记录在 10 分钟内达到 30 条及以上视为批量导入（例如一次导入浏览器书签），报告会注明「另有 N 条批量导入未计入」。
- 待办按完成时间统计，整理按处理完成的时间统计。
- 成长记录从 2026 年 7 月 8 日开始，等级变化从这一天算起。
- 记录较少（活跃天数少于 7 天或记录少于 10 条）时显示简版报告；这一年没有任何记录时不显示入口。

## 隐私

- 报告只给本人看，游客没有年度报告；管理员代管账号时也无法查看。
- 资料标题、常去的网站和标签等明细只在报告页显示，标注「仅你可见」。
- 海报只含汇总数字，不含任何标题与正文。可以关闭「显示昵称与头像」和「显示年度关键词」；关键词开启时，前 3 个标签名会出现在海报上。
- 「保存到云空间」会放进云空间的「年度报告」文件夹；「分享」使用系统分享面板，不生成公开链接。

## 纪念成就

看完最后一页会解锁纪念成就「年度回望 · 2026」。纪念成就不发积分，解锁后才会出现在成就墙上。`,
  },
];

async function main() {
  const [[root]] = await pool.query(
    "SELECT id FROM user WHERE role = 'root' AND del_flag = 0 ORDER BY create_time LIMIT 1",
  );
  if (!root?.id) throw new Error('未找到 root 用户，无法写入知识库');

  for (const entry of ENTRIES) {
    const result = await upsertKnowledgeBase({ userId: root.id, input: entry });
    console.log(`[knowledge] ${result.action} → ${result.title}`);
  }
  console.log(`[knowledge] 完成，共 ${ENTRIES.length} 条`);
}

main()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error('[knowledge] 写入失败:', error?.message || error);
    await pool.end().catch(() => {});
    process.exitCode = 1;
  });
