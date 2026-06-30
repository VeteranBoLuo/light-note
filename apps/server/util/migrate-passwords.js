/**
 * 密码明文 → scrypt 哈希迁移脚本
 * 
 * 用法:
 *   cd /Users/boluo/project/light-note-back
 *   node --env-file .env util/migrate-passwords.js
 *
 * 安全:
 *   - 可重复运行: 只处理 password_method='plain' 的行
 *   - login handler 同时认两种格式，迁移过程中登录不受影响
 */
import pool from '../db/index.js';
import { hashPassword, verifyPassword } from './password.js';

const BATCH_SIZE = 50;

async function main() {
  // 1. 统计
  const [countRow] = await pool.query(
    "SELECT COUNT(*) AS cnt FROM user WHERE password_method = 'plain'"
  );
  const total = countRow[0].cnt;
  console.log(`待迁移用户: ${total}`);
  if (total === 0) {
    console.log('全部已是哈希，无需操作');
    return;
  }

  // 2. 样例验证
  const [sample] = await pool.query(
    "SELECT id, password FROM user WHERE password_method = 'plain' AND password IS NOT NULL AND password != '' LIMIT 1"
  );
  if (sample.length > 0) {
    const { id, password } = sample[0];
    const hashed = hashPassword(password);
    if (!verifyPassword(password, hashed)) {
      throw new Error('内部错误：哈希验证不通过');
    }
    console.log(`样例通过 — id: ${id}`);
  }

  // 3. 分批迁移
  let offset = 0;
  let migrated = 0;
  while (true) {
    const [rows] = await pool.query(
      "SELECT id, password FROM user WHERE password_method = 'plain' LIMIT ? OFFSET ?",
      [BATCH_SIZE, offset]
    );
    if (rows.length === 0) break;

    for (const row of rows) {
      if (!row.password) continue;
      const hashed = hashPassword(row.password);
      await pool.query(
        "UPDATE user SET password = ?, password_method = 'scrypt' WHERE id = ?",
        [hashed, row.id]
      );
      migrated++;
    }
    offset += BATCH_SIZE;
    console.log(`已迁移 ${migrated}/${total}`);
  }

  console.log(`\n✅ 迁移完成！${migrated} 个用户已从明文升级为 scrypt 哈希`);
  process.exit(0);
}

main().catch((e) => {
  console.error('迁移失败:', e.message);
  process.exit(1);
});
