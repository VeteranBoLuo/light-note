// 默认只读；应用模式须显式给出两项参数，且数据库写入策略仍由环境守卫限制。
import { pathToFileURL } from 'node:url';
export function parseGiftBackfillArgs(args) {
  const allowed = new Set(['--apply', '--confirm-ai-gifts', '--help']);
  if (args.some((arg) => !allowed.has(arg)))
    throw Object.assign(new Error('AI_GIFT_ARGUMENT_INVALID'), { code: 'AI_GIFT_ARGUMENT_INVALID' });
  const apply = args.includes('--apply');
  if (apply !== args.includes('--confirm-ai-gifts'))
    throw Object.assign(new Error('AI_GIFT_APPLY_CONFIRMATION_REQUIRED'), {
      code: 'AI_GIFT_APPLY_CONFIRMATION_REQUIRED',
    });
  return { apply, help: args.includes('--help') };
}
async function main() {
  let database;
  try {
    const options = parseGiftBackfillArgs(process.argv.slice(2));
    if (options.help) {
      console.log(
        'backfillAiLevelGifts.js [--apply --confirm-ai-gifts]\n默认只读聚合预览；应用前须开启 AI_LEVEL_GIFT_MODE，并具有对应环境写入授权。',
      );
      return;
    }
    const dotenv = (await import('dotenv')).default;
    dotenv.config({
      path: process.env.DOTENV_CONFIG_PATH || new URL('../.env', import.meta.url).pathname,
      quiet: true,
    });
    if (!options.apply) {
      if (process.env.LIGHTNOTE_LOCAL_TEST !== '1' && process.env.LIGHTNOTE_DATABASE_SCOPE !== 'local')
        process.env.ALLOW_REMOTE_DATABASE_READS = 'true';
      process.env.ALLOW_REMOTE_DATABASE_WRITES = 'false';
    }
    console.log = (...values) => console.error(...values);
    database = (await import('../db/index.js')).default;
    const { runAiLevelGiftBackfill } = await import('../util/aiLevelGiftBackfill.js');
    const result = await runAiLevelGiftBackfill({ database, apply: options.apply });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    if (options.apply && !result.complete) process.exitCode = 1;
  } catch (error) {
    console.error(
      '[ai-gift-backfill] failed code=%s',
      /^[A-Z0-9_]{1,80}$/.test(error?.code || '') ? error.code : 'AI_GIFT_BACKFILL_FAILED',
    );
    process.exitCode = 1;
  } finally {
    await database?.end();
    if (database) {
      const redis = (await import('../util/redisClient.js')).default;
      if (redis.isOpen) redis.destroy();
    }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
