import pool from '../db/index.js';
import { inspectBookmarkUrl } from '../util/bookmarkUrl.js';

// 默认只读审计；显式传 --apply-safe 才会修复可确定的规范化差异和“协议后单一空格候选”。
// 分享文案、多候选及无候选脏数据一律留在 unresolvedIds，禁止脚本猜测目标网址。
const APPLY_SAFE = process.argv.includes('--apply-safe');

function isSafeCandidateRepair(rawUrl, resolution) {
  if (resolution.state !== 'needs_confirmation' || resolution.candidates.length !== 1) return false;
  return /^https?:\/\/(?:(?:%20|%09|%0a|%0d)+|\s+)/iu.test(String(rawUrl || '').trim());
}

function classify(row) {
  const resolution = inspectBookmarkUrl(row.url, { allowTextExtraction: true });
  const canonicalUrl = resolution.canonicalUrl || resolution.candidates[0]?.url || '';
  const safelyRepairable =
    (resolution.state === 'normalized' && Boolean(canonicalUrl)) || isSafeCandidateRepair(row.url, resolution);
  return { row, resolution, canonicalUrl, safelyRepairable };
}

function hostChanged(rawUrl, canonicalUrl) {
  try {
    return new URL(String(rawUrl || '').trim()).host.toLowerCase() !== new URL(canonicalUrl).host.toLowerCase();
  } catch {
    return true;
  }
}

async function main() {
  const [rows] = await pool.query(
    'SELECT id, user_id AS userId, name, url FROM bookmark WHERE del_flag = 0 ORDER BY user_id, create_time, id',
  );
  const items = rows.map(classify);
  const stats = {
    total: items.length,
    valid: 0,
    normalized: 0,
    needsConfirmation: 0,
    invalid: 0,
    repaired: 0,
    conflicts: 0,
  };
  for (const item of items) {
    if (item.resolution.state === 'valid') stats.valid += 1;
    else if (item.resolution.state === 'normalized') stats.normalized += 1;
    else if (item.resolution.state === 'needs_confirmation') stats.needsConfirmation += 1;
    else stats.invalid += 1;
  }

  if (APPLY_SAFE) {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      for (const item of items.filter((candidate) => candidate.safelyRepairable)) {
        if (!item.canonicalUrl || item.canonicalUrl === item.row.url) continue;
        const [duplicates] = await connection.query(
          'SELECT id FROM bookmark WHERE user_id = ? AND url = ? AND del_flag = 0 AND id <> ? LIMIT 1',
          [item.row.userId, item.canonicalUrl, item.row.id],
        );
        if (duplicates.length) {
          stats.conflicts += 1;
          continue;
        }
        const resetIcon = hostChanged(item.row.url, item.canonicalUrl);
        const [result] = await connection.query(
          resetIcon
            ? 'UPDATE bookmark SET url = ?, icon_url = NULL, icon_checked_at = NULL WHERE id = ? AND user_id = ? AND url = ? AND del_flag = 0'
            : 'UPDATE bookmark SET url = ? WHERE id = ? AND user_id = ? AND url = ? AND del_flag = 0',
          [item.canonicalUrl, item.row.id, item.row.userId, item.row.url],
        );
        stats.repaired += Number(result.affectedRows || 0);
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: APPLY_SAFE ? 'apply-safe' : 'dry-run',
        ...stats,
        unresolvedIds: items
          .filter((item) => ['needs_confirmation', 'invalid'].includes(item.resolution.state) && !item.safelyRepairable)
          .map((item) => item.row.id),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error('书签地址审计失败:', error?.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
