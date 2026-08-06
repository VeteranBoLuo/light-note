import pool from '../../db/index.js';

/**
 * 把模型给出的用户指代解析成唯一账号。
 *
 * 用户 ID 与邮箱天然唯一，昵称不是——线上有十几个账号共用「默认昵称」。
 * 早期实现把三者混在一个无序 `LIMIT 1` 里，昵称撞车时会静默锁定到某个无关账号，
 * 并把那个人的笔记/书签/文件当成目标用户的数据返回。宁可让本轮失败并追问，
 * 也不能返回张冠李戴的内容，因此昵称歧义按 query_files 的 FOLDER_AMBIGUOUS 同款方式抛出。
 *
 * @param {string} keyword 昵称、邮箱或用户 ID
 * @returns {Promise<{ id: string, alias: string, email: string } | null>} 找不到返回 null；昵称撞多个时抛 USER_AMBIGUOUS
 */
export async function resolveAgentTargetUser(keyword) {
  const kw = String(keyword ?? '').trim();
  if (!kw) return null;

  const [exact] = await pool.query(
    `SELECT id, alias, email FROM user WHERE (id = ? OR email = ?) AND del_flag = '0' LIMIT 1`,
    [kw, kw],
  );
  if (exact[0]) return exact[0];

  const [byAlias] = await pool.query(
    `SELECT id, alias, email FROM user WHERE alias = ? AND del_flag = '0' ORDER BY id ASC LIMIT 6`,
    [kw],
  );
  if (!byAlias.length) return null;
  if (byAlias.length > 1) {
    const shown = byAlias.slice(0, 5).map((row) => row.email || row.id);
    const suffix = byAlias.length > shown.length ? ' 等' : '';
    throw new Error(
      `USER_AMBIGUOUS: 有多个用户都叫“${kw}”（${shown.join('、')}${suffix}），请改用邮箱或用户 ID 指定具体是哪一位`,
    );
  }
  return byAlias[0];
}
