import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pool from '../db/index.js';
import { createNotification } from './notification.js';
import { sendTrackedEmail } from './emailDelivery.js';
import { loadInfraDiagnostics } from './infraDiagnostics.js';
import { evaluateSilenceLifecycle, loadInfraAlertSilences } from './infraAlertSilences.js';
import { notificationSchedulerEnabled } from './notificationSchedulerPolicy.js';
import { formatDateTime } from './dateTime.js';
import { stableAgentErrorCode } from './agent/logSafety.js';

export const INFRA_ALERT_POLICY = Object.freeze({
  intervalMs: 60_000,
  // 部署重启后先让 Worker 与 Agent 就位，再开始评估。
  startDelayMs: 90_000,
  // 连续 3 次异常（约 3 分钟）才告警，部署时进程重启的几秒不会误报；恢复同样要连续 3 次，避免抖动反复通知。
  openAfter: 3,
  resolveAfter: 3,
});

const DIAGNOSTICS_LINK = '/serverManagement/diagnostics';

// deploy-server.sh 停文档 Worker 前写入、全部重启后删除；脚本给 15 分钟，超过 30 分钟的截止时刻视为异常标记不予采信。
const DEPLOY_WINDOW_FILE = fileURLToPath(new URL('../.runtime/deploy-window.json', import.meta.url));
const DEPLOY_WINDOW_MAX_MS = 30 * 60_000;

/** 部署窗口内服务进程按计划停止，服务告警暂停评估；标记缺失、损坏或过期都按不在部署中处理。 */
export async function readDeployWindow(now, file = DEPLOY_WINDOW_FILE) {
  try {
    const until = Number(JSON.parse(await readFile(file, 'utf8'))?.until) * 1000;
    const remaining = until - now.getTime();
    return Number.isFinite(remaining) && remaining > 0 && remaining <= DEPLOY_WINDOW_MAX_MS;
  } catch {
    return false;
  }
}

// 只有诊断判为“异常”的检查项才会告警；预警、采集错误与未知状态不打扰。
const CHECK_TITLES = Object.freeze({
  'system.cpu': 'CPU 使用率过高',
  'system.memory': '内存使用率过高',
  'storage.capacity': '磁盘空间不足',
  'storage.inodes': 'inode 即将耗尽',
  'storage.ioBusy': '磁盘 IO 持续繁忙',
  'security.ssh-root-login': 'SSH 允许 Root 直接登录',
  'security.ssh-password-authentication': 'SSH 密码认证已开启',
  'security.ssh-public-key-authentication': 'SSH 公钥认证不可用',
  'security.firewall': '主机防火墙未启用',
  'security.fail2ban': 'Fail2ban 未启用',
  'security.security-updates': '有待安装的安全更新',
  'security.unexpected-public-ports': '出现非预期的公网监听端口',
  'security.ssh-login-failures': 'SSH 失败登录尝试过多',
  'security.database-backup': '数据库备份中断',
});

// 备份中断关系到数据能否恢复，虽归在安全检查里，也和服务故障一样发邮件。
const URGENT_SECURITY_CHECKS = new Set(['security.database-backup']);

const SERVICE_NAMES = Object.freeze({
  'lightnote-api': '轻笺 API',
  'lightnote-document-worker': '文档处理 Worker',
  'lightnote-bookmark-icon-worker': '书签图标 Worker',
  'lightnote-resource-governance-worker': '资源治理 Worker',
  'lightnote-browser-push-worker': '浏览器推送 Worker',
  'lightnote-note-import-worker': '笔记导入 Worker',
  'lightnote-data-export-worker': '数据导出 Worker',
  nginx: 'Nginx',
  mysql: 'MySQL',
  redis: 'Redis',
});

function percentText(value) {
  return Number.isFinite(value) ? `${Math.round(value * 10) / 10}%` : '—';
}

function checkDetail(check) {
  const evidence = check.evidence || {};
  switch (check.id) {
    case 'system.cpu':
    case 'storage.ioBusy':
      return `当前 ${percentText(evidence.percent)}`;
    case 'system.memory':
      return `已用 ${percentText(evidence.percent)}`;
    case 'storage.capacity':
      return `${evidence.mountPoint || '/'} 已用 ${percentText(evidence.percent)}`;
    case 'storage.inodes':
      return `${evidence.mountPoint || '/'} inode 已用 ${percentText(evidence.percent)}`;
    case 'security.security-updates':
      return `待更新 ${evidence.pending ?? '—'} 项，其中安全更新 ${evidence.security ?? '—'} 项`;
    case 'security.unexpected-public-ports':
      return `端口：${(evidence.ports || []).join('、') || '—'}`;
    case 'security.ssh-login-failures':
      return `24 小时内失败 ${evidence.failures24h ?? '—'} 次`;
    case 'security.database-backup':
      return [
        // 详情按整小时变化，告警开启期间不会每分钟改写一次状态行。
        evidence.ageHours == null ? '没有找到成功的备份' : `最近一次成功备份在 ${Math.floor(evidence.ageHours)} 小时前`,
        evidence.lastRunOk === false && evidence.errorCode ? `最近一次运行失败：${evidence.errorCode}` : null,
      ]
        .filter(Boolean)
        .join('，');
    default:
      return null;
  }
}

/**
 * 把诊断结果转成告警信号。服务按 ID 拆成独立告警，避免多个服务先后故障被同一条告警吞掉；
 * Agent 整体不可达时其他检查都是未知，由 agent.offline 单独告警。
 */
export function deriveAlertSignals(diagnostics, { servicesPaused = false } = {}) {
  const signals = new Map();
  const sources = diagnostics?.sources || [];
  signals.set('agent.offline', {
    state: sources.length && sources.every((source) => source.state !== 'available') ? 'fail' : 'pass',
    title: 'Host Agent 无法连接',
    detail: '服务器管理拿不到主机数据，请检查 Agent 进程与 Socket。',
    channel: 'urgent',
  });
  let servicesKnown = false;
  for (const check of diagnostics?.checks || []) {
    if (check.id === 'services.health') {
      // 部署窗口内与采集未知同样处理：服务告警既不开启也不恢复，窗口结束后按实际状态继续。
      if (check.state === 'unknown' || servicesPaused) continue;
      servicesKnown = true;
      for (const id of check.evidence?.unhealthy || []) {
        signals.set(`service.${id}`, {
          state: 'fail',
          title: `${SERVICE_NAMES[id] || id} 未运行`,
          detail: null,
          channel: 'urgent',
        });
      }
      continue;
    }
    const title = CHECK_TITLES[check.id];
    if (!title) continue;
    signals.set(check.id, {
      state: check.state === 'fail' ? 'fail' : check.state === 'unknown' ? 'unknown' : 'pass',
      title,
      detail: checkDetail(check),
      // 安全态势变化只发站内通知与推送；服务、资源、Agent 故障和备份中断同时发邮件。
      channel: check.domain === 'security' && !URGENT_SECURITY_CHECKS.has(check.id) ? 'notice' : 'urgent',
    });
  }
  return { signals, servicesKnown };
}

/**
 * 纯状态机：clear → pending（首次异常）→ open（连续异常达阈值，通知）→ clear（连续正常达阈值，通知恢复）。
 * 未知状态不改变任何计数，Agent 短暂不可用时既不误报恢复也不误报异常。
 */
export function evaluateInfraAlerts(rows, { signals, servicesKnown }, now, policy = INFRA_ALERT_POLICY) {
  const current = new Map(rows.map((row) => [row.alertKey, row]));
  const effective = new Map(signals);
  if (servicesKnown) {
    for (const key of current.keys()) {
      if (key.startsWith('service.') && !effective.has(key)) effective.set(key, { state: 'pass' });
    }
  }
  const changed = [];
  const opened = [];
  const resolved = [];
  for (const [alertKey, signal] of effective) {
    if (signal.state === 'unknown') continue;
    const previous = current.get(alertKey);
    if (signal.state === 'pass' && (!previous || previous.state === 'clear')) continue;
    const row = previous
      ? { ...previous }
      : {
          alertKey,
          state: 'clear',
          channel: signal.channel,
          failStreak: 0,
          passStreak: 0,
          title: signal.title,
          detail: signal.detail,
          firstFailedAt: null,
          openedAt: null,
          resolvedAt: null,
        };
    if (signal.state === 'fail') {
      if (row.state === 'open' && row.detail === signal.detail && row.passStreak === 0) continue;
      row.failStreak += 1;
      row.passStreak = 0;
      Object.assign(row, { title: signal.title, detail: signal.detail, channel: signal.channel });
      if (row.state === 'clear') Object.assign(row, { state: 'pending', firstFailedAt: now });
      if (row.state === 'pending' && row.failStreak >= policy.openAfter) {
        Object.assign(row, { state: 'open', openedAt: now, resolvedAt: null });
        opened.push(row);
      }
    } else {
      row.passStreak += 1;
      row.failStreak = 0;
      if (row.state === 'pending') Object.assign(row, { state: 'clear', firstFailedAt: null });
      if (row.state === 'open' && row.passStreak >= policy.resolveAfter) {
        Object.assign(row, { state: 'clear', resolvedAt: now });
        resolved.push(row);
      }
    }
    changed.push(row);
  }
  return { changed, opened, resolved };
}

function fromDatabaseRow(row) {
  return {
    alertKey: row.alert_key,
    state: row.state,
    channel: row.channel,
    failStreak: Number(row.fail_streak || 0),
    passStreak: Number(row.pass_streak || 0),
    title: row.title,
    detail: row.detail,
    firstFailedAt: row.first_failed_at,
    openedAt: row.opened_at,
    resolvedAt: row.resolved_at,
  };
}

const UPSERT_ALERT_SQL = `INSERT INTO infra_alerts
  (alert_key, state, channel, fail_streak, pass_streak, title, detail, first_failed_at, opened_at, resolved_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON DUPLICATE KEY UPDATE state=VALUES(state), channel=VALUES(channel), fail_streak=VALUES(fail_streak),
    pass_streak=VALUES(pass_streak), title=VALUES(title), detail=VALUES(detail),
    first_failed_at=VALUES(first_failed_at), opened_at=VALUES(opened_at), resolved_at=VALUES(resolved_at)`;

const epochSeconds = (date) => Math.floor(new Date(date).getTime() / 1000);

async function deliverAlert(row, kind, recipients, { notify, sendEmail, siteUrl }) {
  const isOpen = kind === 'open';
  const title = isOpen ? `服务器告警：${row.title}` : `已恢复：${row.title}`;
  const content = isOpen
    ? row.detail || '请到服务器管理查看诊断详情。'
    : `已连续 ${INFRA_ALERT_POLICY.resolveAfter} 分钟恢复正常。`;
  // 来源键带上开启/恢复时刻：同一次告警重试不会重复通知，下一次再出现仍会通知。
  const sourceId = `${row.alertKey}${isOpen ? '@' : '~'}${epochSeconds(isOpen ? row.openedAt : row.resolvedAt)}`;
  for (const recipient of recipients) {
    try {
      await notify(recipient.id, {
        type: 'system',
        title,
        content,
        link: DIAGNOSTICS_LINK,
        meta: { alertKey: row.alertKey, state: kind },
        sourceType: 'infra_alert',
        sourceId,
      });
    } catch (error) {
      console.error('[infra-alerts] notification failed key=%s code=%s', row.alertKey, stableAgentErrorCode(error));
    }
    if (!isOpen || row.channel !== 'urgent' || !recipient.email) continue;
    try {
      await sendEmail({
        emailType: 'infra_alert',
        userId: recipient.id,
        recipient: recipient.email,
        subject: `【轻笺服务器告警】${row.title}`,
        businessType: 'infra_alert',
        businessId: sourceId,
        text: [
          row.title,
          row.detail,
          `首次发现：${formatDateTime(new Date(row.firstFailedAt || row.openedAt))}`,
          `查看诊断：${siteUrl}${DIAGNOSTICS_LINK}`,
        ]
          .filter(Boolean)
          .join('\n'),
      });
    } catch (error) {
      console.error('[infra-alerts] email failed key=%s code=%s', row.alertKey, stableAgentErrorCode(error));
    }
  }
}

async function deliverSilenceReminder(silence, check, recipients, notify) {
  const title = CHECK_TITLES[silence.checkId] || silence.checkId;
  for (const recipient of recipients) {
    try {
      await notify(recipient.id, {
        type: 'system',
        title: `静默已到期，仍未恢复：${title}`,
        content: [`静默原因：${silence.reason}`, check ? checkDetail(check) : null, '可再次静默或尽快处理。']
          .filter(Boolean)
          .join('\n'),
        link: DIAGNOSTICS_LINK,
        meta: { alertKey: silence.checkId, state: 'silence_expired' },
        sourceType: 'infra_alert',
        sourceId: `${silence.checkId}#${epochSeconds(silence.silencedUntil)}`,
      });
    } catch (error) {
      console.error(
        '[infra-alerts] silence reminder failed key=%s code=%s',
        silence.checkId,
        stableAgentErrorCode(error),
      );
    }
  }
}

async function loadSilencesForCycle(db) {
  try {
    return await loadInfraAlertSilences(db);
  } catch (error) {
    // 静默表未就绪时照常告警，宁可多提醒也不漏报。
    if (error?.code === 'ER_NO_SUCH_TABLE') return [];
    throw error;
  }
}

/**
 * 单轮评估：采集诊断 → 推进状态 → 先落库再通知，通知失败不回滚状态，来源键保证重试不重复。
 * 静默项照常推进状态机，只是不投递；到期后若告警已开启，不会再补发开启通知，改由到期提醒告知。
 */
export async function runInfraAlertCycle({
  db = pool,
  loadDiagnostics = loadInfraDiagnostics,
  notify = createNotification,
  sendEmail = sendTrackedEmail,
  now = new Date(),
  siteUrl = String(process.env.SITE_URL || 'https://boluo66.top').replace(/\/$/u, ''),
  deployWindow = readDeployWindow,
} = {}) {
  const diagnostics = await loadDiagnostics();
  const servicesPaused = await deployWindow(now);
  const [rows] = await db.query(
    'SELECT alert_key, state, channel, fail_streak, pass_streak, title, detail, first_failed_at, opened_at, resolved_at FROM infra_alerts',
  );
  const silences = await loadSilencesForCycle(db);
  const result = evaluateInfraAlerts(
    rows.map(fromDatabaseRow),
    deriveAlertSignals(diagnostics, { servicesPaused }),
    now,
  );
  const lifecycle = evaluateSilenceLifecycle(silences, diagnostics, now, INFRA_ALERT_POLICY);
  for (const row of result.changed) {
    await db.query(UPSERT_ALERT_SQL, [
      row.alertKey,
      row.state,
      row.channel,
      row.failStreak,
      row.passStreak,
      String(row.title || '').slice(0, 120),
      row.detail ? String(row.detail).slice(0, 500) : null,
      row.firstFailedAt,
      row.openedAt,
      row.resolvedAt,
    ]);
  }
  // 按静默截止时刻做条件写入，评估期间被重新静默的记录不会被这一轮覆盖或删除。
  for (const { silence, passStreak } of lifecycle.streakUpdates) {
    await db.query('UPDATE infra_alert_silences SET pass_streak=? WHERE check_id=? AND silenced_until=?', [
      passStreak,
      silence.checkId,
      silence.silencedUntil,
    ]);
  }
  const reminders = [];
  for (const removal of lifecycle.removals) {
    const [deleted] = await db.query('DELETE FROM infra_alert_silences WHERE check_id=? AND silenced_until=?', [
      removal.silence.checkId,
      removal.silence.silencedUntil,
    ]);
    // 同一轮刚开启的告警已经会通知，不再叠加到期提醒。
    if (
      removal.remind &&
      Number(deleted?.affectedRows || 0) > 0 &&
      !result.opened.some((row) => row.alertKey === removal.silence.checkId)
    ) {
      reminders.push(removal.silence);
    }
  }
  const opened = result.opened.filter((row) => !lifecycle.suppressed.has(row.alertKey));
  const resolved = result.resolved.filter((row) => !lifecycle.suppressed.has(row.alertKey));
  if (opened.length || resolved.length || reminders.length) {
    const [recipients] = await db.query("SELECT id, email FROM user WHERE role='root' AND del_flag=0");
    for (const row of opened) await deliverAlert(row, 'open', recipients, { notify, sendEmail, siteUrl });
    for (const row of resolved) await deliverAlert(row, 'resolved', recipients, { notify, sendEmail, siteUrl });
    const checks = new Map((diagnostics?.checks || []).map((check) => [check.id, check]));
    for (const silence of reminders)
      await deliverSilenceReminder(silence, checks.get(silence.checkId), recipients, notify);
  }
  return { ...result, silences: lifecycle };
}

let schedulerTimer = null;
let cycleRunning = false;
let missingSchemaWarned = false;

async function runScheduledCycle() {
  if (cycleRunning) return;
  cycleRunning = true;
  try {
    await runInfraAlertCycle();
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      if (!missingSchemaWarned) console.warn('[infra-alerts] INFRA_ALERT_SCHEMA_NOT_READY：等待 infra_alerts 表初始化');
      missingSchemaWarned = true;
    } else {
      console.error('[infra-alerts] cycle failed code=%s', stableAgentErrorCode(error));
    }
  } finally {
    cycleRunning = false;
  }
}

// 告警与周报等通知调度共用生产开关：本地连远程库时不能替生产评估或发通知。
export function startInfraAlertScheduler() {
  if (schedulerTimer || !notificationSchedulerEnabled()) return;
  schedulerTimer = setTimeout(() => {
    void runScheduledCycle();
    schedulerTimer = setInterval(() => void runScheduledCycle(), INFRA_ALERT_POLICY.intervalMs);
    schedulerTimer.unref?.();
  }, INFRA_ALERT_POLICY.startDelayMs);
  schedulerTimer.unref?.();
  console.log('[infra-alerts] 服务器告警已注册，每分钟评估一次');
}
