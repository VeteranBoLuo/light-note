#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const webpImages = args.includes('--webp-images');
const option = (name, fallback) => {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error('VISITOR_SHOWCASE_OPTION_INVALID');
  return args[i + 1];
};
const planPath = option('--plan', null);
if (apply && !planPath) throw new Error('VISITOR_SHOWCASE_PLAN_REQUIRED');
const stateDir = path.resolve(
  option('--state-dir', path.join(os.homedir(), '.local/state/light-note/visitor-showcase')),
);
process.env.ALLOW_REMOTE_DATABASE_READS = apply ? 'false' : 'true';
process.env.ALLOW_REMOTE_DATABASE_WRITES = apply ? 'true' : 'false';
const { default: pool } = await import('../db/index.js');
const { readVisitorShowcasePlan, applyVisitorShowcasePlan, validateVisitorShowcasePlan } =
  await import('../util/services/visitorNoteShowcaseService.js');
const { visitorImageLocator } = await import('../util/services/visitorExampleScheduleService.js');
const { images: managedImages } = await import('./visitorExamples/manifestV2.mjs');
async function save(name, value) {
  await fs.mkdir(stateDir, { recursive: true, mode: 0o700 });
  await fs.chmod(stateDir, 0o700);
  const target = path.join(stateDir, name);
  await fs.writeFile(target, JSON.stringify(value, null, 2), { flag: 'wx', mode: 0o600 });
  return target;
}
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const uploadUrl = (locator) => `https://boluo66.top/uploads/${locator}`;
// 三张托管示例图换成同目录的 WebP 展示副本；地址按内容摘要命名，与 v2 安装规则一致。
async function webpReplacements(owner) {
  const root = fileURLToPath(new URL('./visitorExamples/', import.meta.url));
  return Promise.all(
    managedImages.map(async (image) => {
      const png = await fs.readFile(path.resolve(root, image.path));
      const webpPath = path.resolve(root, image.path.replace(/\.png$/, '.webp'));
      const webp = await fs.readFile(webpPath);
      const digest = sha256(webp);
      return {
        file: path.relative(root, webpPath),
        from: uploadUrl(visitorImageLocator(owner, sha256(png), 'png')),
        to: uploadUrl(visitorImageLocator(owner, digest, 'webp')),
        sha256: digest,
        size: webp.length,
      };
    }),
  );
}
// 正文只能引用已上线且内容一致的图片：应用前逐张经站点下载复核。
async function assertImagesPublished(items = []) {
  for (const item of items) {
    const response = await fetch(item.to, { cache: 'no-store' }).catch(() => null);
    const bytes = response?.ok ? Buffer.from(await response.arrayBuffer()) : null;
    if (!bytes || bytes.length !== item.size || sha256(bytes) !== item.sha256)
      throw new Error('VISITOR_SHOWCASE_IMAGE_UNAVAILABLE');
  }
}
let connection;
try {
  const stamp = `${Date.now()}-${process.pid}`;
  if (!apply) {
    const [users] = await pool.query("SELECT id FROM user WHERE role='visitor' AND del_flag=0 LIMIT 2");
    const owner = option('--owner', users.length === 1 ? String(users[0].id) : null);
    if (!owner) throw new Error('VISITOR_OWNER_REQUIRED');
    const replacements = webpImages ? await webpReplacements(owner) : [];
    const plan = await readVisitorShowcasePlan(pool, owner, {
      images: replacements.map(({ file, ...item }) => item),
    });
    const planFile = await save(`plan-${stamp}.json`, plan);
    const swapImages = (content) => replacements.reduce((text, item) => text.replaceAll(item.from, item.to), content);
    console.log(
      JSON.stringify({
        mode: 'dry-run',
        planFile,
        // 应用前须先把这些文件按 upload 名放进站点图片目录，应用时会经站点复核。
        images: replacements.map((item) => ({ file: item.file, upload: item.to, size: item.size })),
        notes: plan.changes.map((n) => ({
          title: n.title,
          from: n.before.type,
          to: n.after.type,
          changed: n.before.type !== n.after.type || n.before.content !== n.after.content,
          imagesOnly: n.before.type === n.after.type && swapImages(n.before.content) === n.after.content,
        })),
      }),
    );
  } else {
    const plan = validateVisitorShowcasePlan(JSON.parse(await fs.readFile(path.resolve(planPath), 'utf8')));
    if (option('--owner', plan.owner) !== plan.owner) throw new Error('VISITOR_SHOWCASE_OWNER_CONFLICT');
    await assertImagesPublished(plan.images);
    await save(`before-${stamp}.json`, plan);
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const changed = await applyVisitorShowcasePlan(connection, plan);
    await save(`candidate-${stamp}.json`, { planHash: plan.hash, changed });
    if (args.includes('--test-rollback')) throw new Error('VISITOR_TEST_ROLLBACK');
    await connection.commit();
    connection.release();
    connection = null;
    await save(`completed-${stamp}.json`, { planHash: plan.hash, changed });
    if (changed.length) {
      const { invalidatePersonalKnowledgeCache } = await import('../util/personalKnowledgeSearch.js');
      await invalidatePersonalKnowledgeCache(plan.owner, { persist: true }).catch(() => {});
    }
    console.log(JSON.stringify({ mode: 'applied', planHash: plan.hash, changed: changed.length }));
  }
} catch (error) {
  if (connection) await connection.rollback();
  console.error(
    '[visitor-showcase] stopped code=%s',
    /^[A-Z][A-Z0-9_]+$/.test(error?.code || error?.message || '')
      ? error.code || error.message
      : 'VISITOR_SHOWCASE_FAILED',
  );
  process.exitCode = 1;
} finally {
  if (connection) connection.release();
  await pool.end();
  const { default: redis } = await import('../util/redisClient.js');
  if (redis.isOpen) redis.destroy();
}
