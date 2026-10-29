import pool from '../../db/index.js';
import {
  ManorError,
  MANOR_VERSION,
  manorModel as M,
  projectManor,
  MANOR_COMMANDS,
} from '@lightnote/shared/manor';
import { readManorRuntime } from './knowledgeManorRuntime.js';
import { MANOR_ACTIVITY_GROUPS } from './knowledgeManorOperation.js';
import { getGrowthCalendarContext } from '../growthPreferences.js';
import { beginAdminAction, finishAdminAction } from '../adminActionExecution.js';
import { INTERNAL_ROLES } from '../internalRoles.js';
import { readManorPoints } from './manorPointsRead.js';

const parsed = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
const validId = (value) => {
  if (typeof value !== 'string' || !value || value.length > 64 || /[\x00-\x1f]/.test(value))
    throw new ManorError('MANOR_ADMIN_INPUT_INVALID', 400);
  return value;
};
const integer = (v, fallback, max) => {
  const n = v == null ? fallback : Number(v);
  if (!Number.isSafeInteger(n) || n < 1 || n > max) throw new ManorError('MANOR_ADMIN_INPUT_INVALID', 400);
  return n;
};
const dateString = (date) => new Date(date.getTime() + 28_800_000).toISOString().slice(0, 10);
export function manorAdminRange(input = {}, now = new Date()) {
  const days = integer(input.days, 7, 30);
  if (![7, 30].includes(days)) throw new ManorError('MANOR_ADMIN_INPUT_INVALID', 400);
  const end = new Date(`${dateString(now)}T00:00:00+08:00`);
  const start = new Date(end.getTime() - (days - 1) * 86_400_000);
  return {
    days,
    start: `${dateString(start)} 00:00:00`,
    end: `${dateString(new Date(end.getTime() + 86_400_000))} 00:00:00`,
    hideInternal: input.hideInternal !== false && input.hideInternal !== 'false',
  };
}
const users = (hide) =>
  `u.del_flag=0 AND u.role IN ('user','test','root')${hide ? ` AND u.role NOT IN (${INTERNAL_ROLES.map(() => '?').join(',')})` : ''}`;
const userParams = (hide) => (hide ? [...INTERNAL_ROLES] : []);
const timed = (sql) => sql.replace(/^SELECT /, 'SELECT /*+ MAX_EXECUTION_TIME(5000) */ ');

export function createManorAdminService({
  db = pool,
  now = () => new Date(),
  calendar = getGrowthCalendarContext,
  beginAudit = beginAdminAction,
  finishAudit = finishAdminAction,
} = {}) {
  async function read(fn) {
    const conn = await db.getConnection();
    try {
      await conn.query('SET TRANSACTION READ ONLY');
      await conn.beginTransaction();
      const result = await fn(conn);
      await conn.commit();
      return result;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }
  async function status(conn = db) {
    return {
      ...(await readManorRuntime(conn)),
      deploymentEnabled: process.env.KNOWLEDGE_MANOR_ENABLED === 'true',
      rules: {
        version: MANOR_VERSION,
        dailyWater: M.RULES.dailyWater * 3 + M.RULES.dailyWaterBonus,
        freeCasts: M.RULES.dailyFree,
        pityCasts: M.RULES.pityCasts,
        targetWeight: M.FACILITY_RULES.targetWeight,
      },
    };
  }
  async function operations(input = {}, connection) {
    const run = async (conn) => {
      const range = manorAdminRange(input, now()),
        limit = integer(input.limit, 20, 50);
      const where = [users(range.hideInternal), 'o.created_at>=?', 'o.created_at<?'];
      const params = [...userParams(range.hideInternal), range.start, range.end];
      if (input.userId) {
        where.push('o.user_id=?');
        params.push(validId(input.userId));
      }
      if (input.action) {
        if (!MANOR_COMMANDS.includes(input.action)) throw new ManorError('MANOR_ADMIN_INPUT_INVALID', 400);
        where.push('o.action=?');
        params.push(input.action);
      }
      if (input.resourceOnly === true) where.push('o.effectful=1 AND JSON_LENGTH(o.resource_delta_json)>0');
      if (input.cursor) {
        let c;
        try {
          c = JSON.parse(Buffer.from(String(input.cursor), 'base64url').toString());
        } catch {
          /* checked below */
        }
        if (
          String(input.cursor).length > 1024 ||
          c?.scope !== JSON.stringify([range.days, range.hideInternal, input.userId || '', input.action || '']) ||
          !/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(c?.at || '')
        )
          throw new ManorError('MANOR_ADMIN_CURSOR_INVALID', 400);
        validId(c.userId);
        validId(c.requestId);
        where.push(
          '(o.created_at<? OR (o.created_at=? AND o.user_id<?) OR (o.created_at=? AND o.user_id=? AND o.request_id<?))',
        );
        params.push(c.at, c.at, c.userId, c.at, c.userId, c.requestId);
      }
      const [rows] = await conn.query(
        timed(`SELECT o.user_id AS userId,u.alias,o.request_id AS requestId,o.action,o.effectful,
        o.resource_delta_json AS deltas,o.points_delta AS pointsDelta,o.revision,o.model_version AS version,
        DATE_FORMAT(o.created_at,'%Y-%m-%d %H:%i:%s') AS createdAt
        FROM knowledge_manor_operations o JOIN user u ON u.id=o.user_id
        WHERE ${where.join(' AND ')} ORDER BY o.created_at DESC,o.user_id DESC,o.request_id DESC LIMIT ?`),
        [...params, limit + 1],
      );
      const more = rows.length > limit,
        items = rows.slice(0, limit).map((r) => ({
          ...r,
          revision: Number(r.revision),
          pointsDelta: Number(r.pointsDelta),
          effectful: r.effectful == null ? null : Boolean(r.effectful),
          deltas: parsed(r.deltas) || [],
        }));
      const last = items.at(-1);
      return {
        items,
        nextCursor:
          more && last
            ? Buffer.from(
                JSON.stringify({
                  scope: JSON.stringify([range.days, range.hideInternal, input.userId || '', input.action || '']),
                  at: last.createdAt,
                  userId: last.userId,
                  requestId: last.requestId,
                }),
              ).toString('base64url')
            : null,
      };
    };
    return connection ? run(connection) : read(run);
  }
  async function overview(input = {}) {
    return read(async (conn) => {
      const range = manorAdminRange(input, now()),
        runtime = await status(conn),
        failures = [];
      const section = async (name, fn) => {
        try {
          return await fn();
        } catch {
          failures.push(name);
          return null;
        }
      };
      const opened = await section('opened', async () => {
        const [[row]] = await conn.query(
          timed(`SELECT COUNT(*) AS count FROM knowledge_manors m JOIN user u ON u.id=m.user_id
          WHERE ${users(range.hideInternal)} AND JSON_UNQUOTE(JSON_EXTRACT(m.state_json,'$.adopted'))='true'`),
          userParams(range.hideInternal),
        );
        return Number(row.count);
      });
      const finances = await section('finances', async () => {
        const { rows } = await readManorPoints(conn, range);
        const trend = Array.from({ length: range.days }, (_, i) => {
          const day = dateString(
            new Date(new Date(range.start.replace(' ', 'T') + '+08:00').getTime() + i * 86_400_000),
          );
          const row = rows.find((r) => r.day === day);
          return { day, issued: Number(row?.issued || 0), spent: Number(row?.spent || 0) };
        });
        return {
          issued: trend.reduce((n, r) => n + r.issued, 0),
          spent: trend.reduce((n, r) => n + r.spent, 0),
          trend,
        };
      });
      const activity = runtime.coverageStartedAt
        ? await section('activity', async () => {
            const counts = {};
            const all = MANOR_COMMANDS;
            const observed = new Date(new Date(runtime.coverageStartedAt).getTime() + 28_800_000)
              .toISOString()
              .slice(0, 19)
              .replace('T', ' ');
            const start = observed > range.start ? observed : range.start;
            for (const [group, actions] of Object.entries({ all, ...MANOR_ACTIVITY_GROUPS })) {
              const [[row]] = await conn.query(
                timed(`SELECT COUNT(DISTINCT o.user_id) AS count FROM knowledge_manor_operations o
            JOIN user u ON u.id=o.user_id WHERE ${users(range.hideInternal)} AND o.created_at>=? AND o.created_at<?
            AND o.effectful=1 AND o.action IN (${actions.map(() => '?').join(',')})`),
                [...userParams(range.hideInternal), start, range.end, ...actions],
              );
              counts[group] = Number(row.count);
            }
            return counts;
          })
        : null;
      const recent = await section(
        'recent',
        async () => (await operations({ ...input, limit: 5, resourceOnly: true }, conn)).items,
      );
      return { range, runtime, opened, finances, activity, recent, failures };
    });
  }
  async function players(input = {}) {
    return read(async (conn) => {
      const hide = input.hideInternal !== false && input.hideInternal !== 'false',
        page = integer(input.page, 1, 500),
        limit = integer(input.limit, 20, 50);
      const search = String(input.search || '').trim();
      if (search.length > 64) throw new ManorError('MANOR_ADMIN_INPUT_INVALID', 400);
      const where = [users(hide), "JSON_UNQUOTE(JSON_EXTRACT(m.state_json,'$.adopted'))='true'"],
        params = userParams(hide);
      if (search) {
        where.push('(u.id=? OR u.alias LIKE ?)');
        params.push(search, `%${search.replace(/[\\%_]/g, '\\$&')}%`);
      }
      const from = `FROM knowledge_manors m JOIN user u ON u.id=m.user_id WHERE ${where.join(' AND ')}`;
      const [[count]] = await conn.query(timed(`SELECT COUNT(*) AS total ${from}`), params);
      const [rows] = await conn.query(
        timed(`SELECT u.id AS userId,u.alias,m.revision,m.state_json AS state,
        DATE_FORMAT(m.updated_at,'%Y-%m-%d %H:%i:%s') AS updatedAt ${from} ORDER BY m.updated_at DESC,m.user_id DESC LIMIT ? OFFSET ?`),
        [...params, limit, (page - 1) * limit],
      );
      return {
        total: Number(count.total),
        page,
        items: rows.map((r) => {
          const s = parsed(r.state);
          return {
            userId: r.userId,
            alias: r.alias,
            revision: Number(r.revision),
            updatedAt: r.updatedAt,
            level: M.level(s),
            discoveries: Object.keys(s.discoveries || {}).length + Object.keys(s.cropDex || {}).length,
          };
        }),
      };
    });
  }
  async function player(userId) {
    validId(userId);
    return read(async (conn) => {
      const [[row]] = await conn.query(
        `SELECT u.id AS userId,u.alias,m.revision,m.state_json AS state,COALESCE(g.points,0) AS points
        FROM user u LEFT JOIN knowledge_manors m ON m.user_id=u.id LEFT JOIN user_growth g ON g.user_id=u.id
        WHERE u.id=? AND u.del_flag=0 AND u.role IN ('root','user','test') LIMIT 1`,
        [userId],
      );
      if (!row) throw new ManorError('MANOR_ADMIN_USER_NOT_FOUND', 404);
      const base = {
        userId: row.userId,
        alias: row.alias,
        points: Number(row.points),
        revision: Number(row.revision || 0),
        snapshotAt: now().toISOString(),
      };
      if (!row.state) return { ...base, state: null };
      let saved;
      try {
        saved = parsed(row.state);
        const ctx = await calendar(userId, { db: conn, now: now() });
        const s = projectManor(saved, { now: now(), points: Number(row.points), calendar: ctx });
        return {
          ...base,
          version: saved?.version,
          state: s,
          level: M.level(s),
          plots: s.plots.map((p, i) => ({ crop: p.crop, status: M.plotState(s, i), remaining: M.remaining(s, i) })),
          facilities: {
            workshop: M.workshopStatus(s),
            beehive: M.beehiveStatus(s),
            composter: M.composterStatus(s),
            purifier: M.purifierStatus(s),
          },
        };
      } catch (error) {
        if (!(error instanceof ManorError) && !(error instanceof TypeError) && !(error instanceof RangeError))
          throw error;
        return {
          ...base,
          version: saved?.version,
          state: null,
          unavailable: error instanceof ManorError ? error.code : 'MANOR_SAVE_UNREADABLE',
        };
      }
    });
  }
  async function updateRuntime(req) {
    const input = req.body || {};
    if (
      !['open', 'maintenance'].includes(input.mode) ||
      typeof input.message !== 'string' ||
      input.message.length > 120 ||
      typeof input.reason !== 'string' ||
      input.reason.trim().length < 6 ||
      input.reason.length > 500 ||
      input.confirmed !== true ||
      !Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision < 0 ||
      Object.keys(input).some((k) => !['mode', 'message', 'expectedRevision', 'reason', 'confirmed'].includes(k))
    )
      throw new ManorError('MANOR_ADMIN_INPUT_INVALID', 400);
    const audit = await beginAudit(req, {
      action: 'manor.runtime_update',
      targetId: '1',
      metadata: { mode: input.mode },
    });
    let conn;
    try {
      conn = await db.getConnection();
      await conn.beginTransaction();
      const [result] = await conn.query(
        'UPDATE knowledge_manor_runtime SET mode=?,message=?,revision=revision+1,updated_by=?,updated_at=NOW() WHERE id=1 AND revision=?',
        [input.mode, input.message.trim(), req.user.id, input.expectedRevision],
      );
      if (result.affectedRows !== 1) throw new ManorError('MANOR_RUNTIME_CONFLICT', 409);
      await finishAudit(audit, {
        outcome: 'succeeded',
        metadata: { mode: input.mode, revision: input.expectedRevision + 1 },
        db: conn,
      });
      const value = await status(conn);
      await conn.commit();
      return value;
    } catch (error) {
      if (conn) await conn.rollback();
      await finishAudit(audit, {
        outcome: 'failed',
        metadata: { code: error instanceof ManorError ? error.code : 'MANOR_ADMIN_FAILED' },
      });
      throw error;
    } finally {
      conn?.release();
    }
  }
  return { status, overview, players, player, operations, updateRuntime };
}

export const manorAdminService = createManorAdminService();
