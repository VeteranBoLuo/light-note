import pool from '../db/index.js';
import { resultData } from '../util/common.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';
import { getDeclaredAdminRoutePolicies } from '../util/adminRoutePolicy.js';
import { getOperationalLogRetentionConfig } from '../util/operationalLogRetention.js';
import { getAiArtifactRetentionConfig } from '../util/aiArtifactRetention.js';
import { getCommunityChatFeatureState } from '../util/communityChatFeature.js';
import { bookmarkIconBackgroundJobsEnabled } from '../util/bookmarkIconBatchService.js';
import { SECURITY_CONFIG } from '../util/security/rules.js';

const PERIOD_DAYS = new Set([7, 30, 90]);
const COHORT_WEEKS = new Set([8, 12, 16]);
const DEFAULT_AI_PRODUCT_EVENT_RETENTION_DAYS = 180;

function normalizePeriodDays(value) {
  const normalized = Number(value);
  return PERIOD_DAYS.has(normalized) ? normalized : 30;
}

function normalizeCohortWeeks(value) {
  const normalized = Number(value);
  return COHORT_WEEKS.has(normalized) ? normalized : 8;
}

function number(value) {
  return Number(value || 0);
}

function percent(numerator, denominator) {
  const total = number(denominator);
  if (total <= 0) return 0;
  return Math.round((number(numerator) / total) * 1000) / 10;
}

async function optionalQuery(source, sql, params = []) {
  try {
    const [rows] = await pool.query(sql, params);
    return { source, available: true, rows };
  } catch (error) {
    console.warn('[admin-product-insights] source=%s unavailable code=%s', source, stableAgentErrorCode(error));
    return { source, available: false, rows: [] };
  }
}

function adoptionResult(source, result, activeUsers) {
  const row = result.rows[0] || {};
  const users = number(row.users);
  return {
    source,
    available: result.available,
    users,
    events: number(row.events),
    rate: percent(users, activeUsers),
  };
}

function parseAiProductEventRetention(environment = process.env) {
  const raw = environment.AI_PRODUCT_EVENT_RETENTION_DAYS;
  if (raw == null || String(raw).trim() === '') {
    return { retentionDays: DEFAULT_AI_PRODUCT_EVENT_RETENTION_DAYS, state: 'default' };
  }
  const configured = Number(raw);
  if (Number.isSafeInteger(configured) && configured >= 30 && configured <= 730) {
    return { retentionDays: configured, state: 'configured' };
  }
  return { retentionDays: DEFAULT_AI_PRODUCT_EVENT_RETENTION_DAYS, state: 'invalid' };
}

function ensureAdminActor(req, res) {
  if (req.user?.role === 'root' && !req.adminContext) return true;
  res.send(resultData(null, 403, '仅管理员本人可查看后台运营与治理数据'));
  return false;
}

/**
 * 后台产品洞察：只返回聚合计数，不返回用户 ID、资源标题、AI 问答或社区正文。
 * 各可选功能表独立降级，某个尚未迁移的模块不会拖垮整张看板。
 */
export async function getAdminProductInsights(req, res) {
  if (!ensureAdminActor(req, res)) return;
  const periodDays = normalizePeriodDays(req.body?.periodDays);
  const cohortWeeks = normalizeCohortWeeks(req.body?.cohortWeeks);

  try {
    const [activeResult, newUserResult, activationResult, cohortResult, ...featureResults] = await Promise.all([
      optionalQuery(
        'active_users',
        `SELECT COUNT(DISTINCT l.user_id) AS users
           FROM api_logs l
           JOIN user u ON u.id = l.user_id AND u.role = 'user' AND u.del_flag = '0'
          WHERE l.del_flag = '0'
            AND l.request_time >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
        [periodDays],
      ),
      optionalQuery(
        'new_users',
        `SELECT COUNT(*) AS users
           FROM user
          WHERE role = 'user' AND del_flag = '0'
            AND create_time >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
        [periodDays],
      ),
      optionalQuery(
        'activation',
        `SELECT COUNT(DISTINCT u.id) AS new_users,
                COUNT(DISTINCT f.user_id) AS activated_users
           FROM user u
           LEFT JOIN conversion_events f
             ON f.user_id = u.id
            AND f.event = 'first_own_resource'
            AND f.create_time >= u.create_time
            AND f.create_time < DATE_ADD(u.create_time, INTERVAL 7 DAY)
          WHERE u.role = 'user' AND u.del_flag = '0'
            AND u.create_time >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
        [periodDays],
      ),
      optionalQuery(
        'cohort_retention',
        `SELECT DATE_FORMAT(
                  DATE_SUB(DATE(u.create_time), INTERVAL WEEKDAY(u.create_time) DAY),
                  '%Y-%m-%d'
                ) AS cohort_start,
                COUNT(DISTINCT u.id) AS registered,
                COUNT(DISTINCT CASE
                  WHEN u.create_time <= DATE_SUB(NOW(), INTERVAL 1 DAY) THEN u.id
                END) AS d1_eligible,
                COUNT(DISTINCT CASE
                  WHEN l.request_time >= DATE_ADD(u.create_time, INTERVAL 1 DAY)
                   AND l.request_time < DATE_ADD(u.create_time, INTERVAL 2 DAY) THEN u.id
                END) AS d1_retained,
                COUNT(DISTINCT CASE
                  WHEN u.create_time <= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN u.id
                END) AS d7_eligible,
                COUNT(DISTINCT CASE
                  WHEN l.request_time >= DATE_ADD(u.create_time, INTERVAL 7 DAY)
                   AND l.request_time < DATE_ADD(u.create_time, INTERVAL 8 DAY) THEN u.id
                END) AS d7_retained,
                COUNT(DISTINCT CASE
                  WHEN u.create_time <= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN u.id
                END) AS d30_eligible,
                COUNT(DISTINCT CASE
                  WHEN l.request_time >= DATE_ADD(u.create_time, INTERVAL 30 DAY)
                   AND l.request_time < DATE_ADD(u.create_time, INTERVAL 31 DAY) THEN u.id
                END) AS d30_retained
           FROM user u
           LEFT JOIN api_logs l
             ON l.user_id = u.id
            AND l.del_flag = '0'
            AND l.request_time >= u.create_time
            AND l.request_time < DATE_ADD(u.create_time, INTERVAL 31 DAY)
          WHERE u.role = 'user' AND u.del_flag = '0'
            AND u.create_time >= DATE_SUB(CURDATE(), INTERVAL ? WEEK)
          GROUP BY cohort_start
          ORDER BY cohort_start DESC`,
        [cohortWeeks],
      ),
      optionalQuery(
        'bookmark',
        `SELECT COUNT(DISTINCT b.user_id) AS users, COUNT(*) AS events
           FROM bookmark b
           JOIN user u ON u.id = b.user_id AND u.role = 'user' AND u.del_flag = '0'
          WHERE b.del_flag = 0 AND b.create_time >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
        [periodDays],
      ),
      optionalQuery(
        'note',
        `SELECT COUNT(DISTINCT n.create_by) AS users, COUNT(*) AS events
           FROM note n
           JOIN user u ON u.id = n.create_by AND u.role = 'user' AND u.del_flag = '0'
          WHERE n.del_flag = '0' AND n.update_time >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
        [periodDays],
      ),
      optionalQuery(
        'file',
        `SELECT COUNT(DISTINCT f.create_by) AS users, COUNT(*) AS events
           FROM files f
           JOIN user u ON u.id = f.create_by AND u.role = 'user' AND u.del_flag = '0'
          WHERE f.del_flag = 0 AND f.create_time >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
        [periodDays],
      ),
      optionalQuery(
        'todo',
        `SELECT COUNT(DISTINCT t.user_id) AS users, COUNT(*) AS events
           FROM todo_items t
           JOIN user u ON u.id = t.user_id AND u.role = 'user' AND u.del_flag = '0'
          WHERE t.del_flag = 0 AND t.update_time >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
        [periodDays],
      ),
      optionalQuery(
        'ai',
        `SELECT COUNT(DISTINCT e.subject_user_id) AS users, COUNT(*) AS events
           FROM ai_product_events e
           JOIN user u ON u.id = e.subject_user_id AND u.role = 'user' AND u.del_flag = '0'
          WHERE e.admin_context_mode = 'normal'
            AND e.event_name IN ('ai_prompt_submitted', 'ai_completed', 'ai_change_succeeded')
            AND e.create_time >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
        [periodDays],
      ),
      optionalQuery(
        'community',
        `SELECT COUNT(DISTINCT m.user_id) AS users, COUNT(*) AS events
           FROM community_chat_messages m
           JOIN user u ON u.id = m.user_id AND u.role = 'user' AND u.del_flag = '0'
          WHERE m.status = 'active' AND m.create_time >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
        [periodDays],
      ),
    ]);

    const activeUsers = number(activeResult.rows[0]?.users);
    const newUsers = number(newUserResult.rows[0]?.users);
    const activationRow = activationResult.rows[0] || {};
    const activatedUsers = number(activationRow.activated_users);
    const activationBase = number(activationRow.new_users) || newUsers;
    const features = ['bookmark', 'note', 'file', 'todo', 'ai', 'community'].map((source, index) =>
      adoptionResult(source, featureResults[index], activeUsers),
    );
    const cohorts = cohortResult.rows.map((row) => ({
      cohortStart: row.cohort_start,
      registered: number(row.registered),
      d1: {
        eligible: number(row.d1_eligible),
        retained: number(row.d1_retained),
        rate: percent(row.d1_retained, row.d1_eligible),
      },
      d7: {
        eligible: number(row.d7_eligible),
        retained: number(row.d7_retained),
        rate: percent(row.d7_retained, row.d7_eligible),
      },
      d30: {
        eligible: number(row.d30_eligible),
        retained: number(row.d30_retained),
        rate: percent(row.d30_retained, row.d30_eligible),
      },
    }));
    const allResults = [activeResult, newUserResult, activationResult, cohortResult, ...featureResults];

    return res.send(
      resultData({
        generatedAt: new Date(),
        periodDays,
        cohortWeeks,
        summary: {
          activeUsers,
          newUsers,
          activatedUsers,
          activationRate: percent(activatedUsers, activationBase),
          aiAdoptionRate: features.find((item) => item.source === 'ai')?.rate || 0,
        },
        features,
        cohorts,
        unavailableSources: allResults.filter((item) => !item.available).map((item) => item.source),
        privacy: {
          aggregateOnly: true,
          excludesInternalRoles: true,
          contentStored: false,
        },
      }),
    );
  } catch (error) {
    console.error('[admin-product-insights] load failed code=%s', stableAgentErrorCode(error));
    return res.send(resultData(null, 500, '产品洞察加载失败'));
  }
}

function policySummary() {
  const declared = getDeclaredAdminRoutePolicies();
  const counts = {};
  const resources = {};
  for (const capability of declared.values()) {
    counts[capability.policy] = number(counts[capability.policy]) + 1;
    const resource = capability.resourceType || 'unknown';
    resources[resource] = number(resources[resource]) + 1;
  }
  return { total: declared.size, counts, resources };
}

function roleCapabilities() {
  return [
    {
      role: 'visitor',
      authenticated: false,
      ownContent: 'preview',
      adminConsole: false,
      userPreview: false,
      contentMaintenance: false,
      highRiskOperations: false,
      analyticsIncluded: false,
    },
    {
      role: 'user',
      authenticated: true,
      ownContent: 'full',
      adminConsole: false,
      userPreview: false,
      contentMaintenance: false,
      highRiskOperations: false,
      analyticsIncluded: true,
    },
    {
      role: 'test',
      authenticated: true,
      ownContent: 'full',
      adminConsole: false,
      userPreview: false,
      contentMaintenance: false,
      highRiskOperations: false,
      analyticsIncluded: false,
    },
    {
      role: 'root',
      authenticated: true,
      ownContent: 'full',
      adminConsole: true,
      userPreview: true,
      contentMaintenance: process.env.ADMIN_MAINTENANCE_ENABLED === 'true',
      highRiskOperations: true,
      analyticsIncluded: false,
    },
  ];
}

/**
 * 运行策略与权限快照。只暴露经过显式挑选的布尔值、阈值和保留期，禁止枚举环境变量。
 */
export async function getAdminGovernance(req, res) {
  if (!ensureAdminActor(req, res)) return;
  try {
    const operationalRetention = getOperationalLogRetentionConfig();
    const aiArtifactRetention = getAiArtifactRetentionConfig();
    const aiProductRetention = parseAiProductEventRetention();
    const community = getCommunityChatFeatureState();
    const adminPreviewEnabled =
      process.env.ADMIN_CONTEXT_ENABLED !== 'false' && process.env.ADMIN_PREVIEW_ENABLED !== 'false';
    const maintenanceEnabled = process.env.ADMIN_MAINTENANCE_ENABLED === 'true';
    const warnings = [];

    if (!SECURITY_CONFIG.blockEnabled) warnings.push({ code: 'security_block_disabled', severity: 'danger' });
    if (maintenanceEnabled) warnings.push({ code: 'maintenance_enabled', severity: 'warning' });
    if (!adminPreviewEnabled) warnings.push({ code: 'admin_preview_disabled', severity: 'neutral' });
    if (community.emergencyReadOnly) warnings.push({ code: 'community_readonly', severity: 'warning' });
    if (aiArtifactRetention.invalidDomains.length) {
      warnings.push({ code: 'ai_artifact_retention_invalid', severity: 'danger' });
    }
    if (aiProductRetention.state === 'invalid') {
      warnings.push({ code: 'ai_product_retention_invalid', severity: 'danger' });
    }

    return res.send(
      resultData({
        generatedAt: new Date(),
        roles: roleCapabilities(),
        routePolicies: policySummary(),
        runtime: {
          adminContext: {
            previewEnabled: adminPreviewEnabled,
            maintenanceEnabled,
            readonlyTtlMinutes: 20,
            maintenanceTtlMinutes: 10,
            source: 'environment_and_code',
          },
          security: {
            requestBlockingEnabled: Boolean(SECURITY_CONFIG.blockEnabled),
            reputationDecisionEnabled: Boolean(SECURITY_CONFIG.reputationDecisionEnabled),
            ipAutoBanEnabled: Boolean(SECURITY_CONFIG.ipAutoBanEnabled),
            blockThreshold: number(SECURITY_CONFIG.blockThreshold),
            logThreshold: number(SECURITY_CONFIG.logThreshold),
            eventRetentionDays: number(SECURITY_CONFIG.eventRetentionDays),
            source: 'environment_and_code',
          },
          community: { ...community, source: 'environment' },
          jobs: {
            bookmarkIconBackgroundEnabled: bookmarkIconBackgroundJobsEnabled(),
            source: 'environment',
          },
          retention: {
            operationalLogs: { ...operationalRetention, source: 'environment_with_defaults' },
            aiProductEvents: { ...aiProductRetention, source: 'environment_with_defaults' },
            aiArtifacts: { ...aiArtifactRetention, source: 'environment' },
          },
        },
        warnings,
        safety: {
          readOnlySnapshot: true,
          secretsExposed: false,
          arbitraryConfigWriteEnabled: false,
        },
      }),
    );
  } catch (error) {
    console.error('[admin-governance] load failed code=%s', stableAgentErrorCode(error));
    return res.send(resultData(null, 500, '运行策略与权限加载失败'));
  }
}

export const adminInsightsHandleInternals = {
  normalizePeriodDays,
  normalizeCohortWeeks,
  percent,
  parseAiProductEventRetention,
  policySummary,
  roleCapabilities,
};
