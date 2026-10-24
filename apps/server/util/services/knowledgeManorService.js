import { createHash, randomInt } from 'node:crypto';
import pool from '../../db/index.js';
import { createManor, executeManorCommand, projectManor, ManorError, MANOR_VERSION } from '@lightnote/shared/manor';
import { getGrowth, getDailyQuestState, lockGrowthAccount } from '../growth.js';
import { earnPoints } from '../points.js';
import { getGrowthCalendarContext } from '../growthPreferences.js';
import { getWeeklyChallenges } from '../weeklyChallenge.js';

const random = () => randomInt(0, 0x1_0000_0000) / 0x1_0000_0000;
const parsed = value => typeof value === 'string' ? JSON.parse(value) : value;

async function accountContext(db, userId, now) {
  const [[account]] = await db.query('SELECT role, del_flag FROM user WHERE id=? LIMIT 1', [userId]);
  if (!account || Number(account.del_flag) !== 0 || account.role !== 'root') {
    throw new ManorError('MANOR_ACCOUNT_UNAVAILABLE', 403);
  }
  const calendar = await getGrowthCalendarContext(userId, { db, now });
  const growth = await getGrowth(userId, { userRole: account.role, db, calendar });
  const daily = await getDailyQuestState(userId, growth, { db, calendar });
  const weekly = await getWeeklyChallenges(userId, { db, calendar });
  const [milestones] = await db.query("SELECT ref FROM points_log WHERE user_id=? AND reason='streak_milestone' AND ref IN ('7','30','100')", [userId]);
  const bestKnownStreak = Math.max(Number(growth.streak) || 0, ...milestones.map(row => Number(row.ref)));
  const supplyEligibility = {
    'streak-7': bestKnownStreak >= 7, 'streak-30': bestKnownStreak >= 30, 'streak-100': bestKnownStreak >= 100,
    'week-all': weekly.challenges.length > 0 && weekly.challenges.every(c => c.done),
  };
  return { now, calendar, points: growth.points, dailyDone: daily.quests.map(q => Boolean(q.done)), quests: daily.quests, supplyEligibility };
}

function checkRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).some(k => !['requestId', 'revision', 'version', 'action', 'args'].includes(k))
    || typeof input.requestId !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(input.requestId)
    || !Number.isSafeInteger(input.revision) || input.revision < 0
    || typeof input.version !== 'string' || input.version.length > 32
    || typeof input.action !== 'string' || input.action.length > 48
    || !Array.isArray(input.args) || JSON.stringify(input.args).length > 2048) {
    throw new ManorError('MANOR_COMMAND_INVALID', 400);
  }
}

/** The account growth lock serializes manor points with shop, lottery and growth rewards. */
export function createKnowledgeManorService({ db = pool, context = accountContext, rng = random, lockAccount = lockGrowthAccount, creditPoints = earnPoints, now = () => new Date() } = {}) {
  async function readState(connection, userId, ctx) {
    const [[row]] = await connection.query('SELECT revision,state_json FROM knowledge_manors WHERE user_id=?', [userId]);
    const state = row ? parsed(row.state_json) : createManor(ctx);
    return { revision: Number(row?.revision || 0), state: projectManor(state, ctx) };
  }
  async function get(userId) {
    const conn = await db.getConnection();
    try {
      // Read points and inventory from one snapshot while purchases may be committing.
      await conn.beginTransaction();
      const ctx = await context(conn, userId, now());
      const value = { version: MANOR_VERSION, ...(await readState(conn, userId, ctx)), quests: ctx.quests || [] };
      await conn.commit();
      return value;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally { conn.release(); }
  }
  async function execute(userId, input) {
    checkRequest(input);
    const digest = createHash('sha256').update(JSON.stringify({ version: input.version, action: input.action, args: input.args })).digest('hex');
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await lockAccount(conn, userId);
      const ctx = await context(conn, userId, now());
      const [[receipt]] = await conn.query('SELECT command_hash,result_json FROM knowledge_manor_operations WHERE user_id=? AND request_id=? FOR UPDATE', [userId, input.requestId]);
      if (receipt) {
        if (receipt.command_hash !== digest) throw new ManorError('MANOR_REQUEST_CONFLICT');
        const current = await readState(conn, userId, ctx);
        await conn.commit();
        return { version: MANOR_VERSION, ...current, result: parsed(receipt.result_json).result, replayed: true, quests: ctx.quests || [] };
      }
      // Recover a prior receipt before checking new-version gates or revision.
      if (input.version !== MANOR_VERSION) throw new ManorError('MANOR_VERSION_UNSUPPORTED');
      const current = await readState(conn, userId, ctx);
      if (current.revision !== input.revision) throw new ManorError('MANOR_REVISION_CONFLICT');
      const next = executeManorCommand(current.state, input, { ...ctx, random: rng });
      const revision = current.revision + 1;
      if (!Number.isSafeInteger(revision)) throw new ManorError('MANOR_REVISION_INVALID');
      const meta = { manorVersion: MANOR_VERSION, manorAction: input.action };
      const ref = createHash('sha256').update(input.requestId).digest('hex');
      if (next.pointsDelta > 0) {
        const credited = await creditPoints(userId, next.pointsDelta, 'manor_sale', ref, conn, { policyVersion: MANOR_VERSION, meta });
        if (!credited) throw new ManorError('MANOR_LEDGER_CONFLICT');
      } else if (next.pointsDelta < 0) {
        const cost = -next.pointsDelta;
        const [spent] = await conn.query('UPDATE user_growth SET points=points-? WHERE user_id=? AND points>=?', [cost, userId, cost]);
        if (spent.affectedRows !== 1) throw new ManorError('MANOR_POINTS_INSUFFICIENT');
        await conn.query('INSERT INTO points_log (user_id,delta,reason,ref,policy_version,meta) VALUES (?, ?, ?, ?, ?, ?)', [userId, -cost, 'manor_cost', ref, MANOR_VERSION, JSON.stringify(meta)]);
      }
      const stored = { ...next.state };
      delete stored.wallet; // user_growth.points remains the only balance.
      await conn.query(`INSERT INTO knowledge_manors (user_id,revision,state_json) VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE revision=VALUES(revision),state_json=VALUES(state_json)`, [userId, revision, JSON.stringify(stored)]);
      await conn.query('INSERT INTO knowledge_manor_operations (user_id,request_id,command_hash,model_version,revision,result_json,points_delta) VALUES (?, ?, ?, ?, ?, ?, ?)', [userId, input.requestId, digest, MANOR_VERSION, revision, JSON.stringify({ result: next.result ?? null }), next.pointsDelta]);
      await conn.commit();
      return { version: MANOR_VERSION, revision, state: next.state, result: next.result, replayed: false, quests: ctx.quests || [] };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }
  return { get, execute };
}

export const knowledgeManorService = createKnowledgeManorService();
