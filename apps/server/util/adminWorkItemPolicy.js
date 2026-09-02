const ADMIN_WORK_ITEM_POLICY_VERSION = '2026-09-02.1';

const ADMIN_WORK_ITEM_POLICIES = Object.freeze({
  opinion: {
    section: 'work',
    ownerTeam: '用户服务',
    defaultMinutes: 48 * 60,
    severityMinutes: { critical: 8 * 60, high: 24 * 60, normal: 48 * 60 },
  },
  security: {
    section: 'work',
    ownerTeam: '安全与合规',
    defaultMinutes: 4 * 60,
    severityMinutes: { critical: 60, high: 4 * 60, normal: 8 * 60 },
  },
  community_report: {
    section: 'work',
    ownerTeam: '内容安全',
    defaultMinutes: 8 * 60,
    severityMinutes: { critical: 2 * 60, high: 8 * 60, normal: 24 * 60 },
  },
  ai_feedback: {
    section: 'work',
    ownerTeam: 'AI 产品运营',
    defaultMinutes: 72 * 60,
    severityMinutes: { critical: 8 * 60, high: 24 * 60, normal: 72 * 60 },
  },
  feature_request: {
    section: 'work',
    ownerTeam: '产品共建',
    defaultMinutes: 48 * 60,
    severityMinutes: { critical: 8 * 60, high: 24 * 60, normal: 48 * 60 },
  },
  resource_governance: {
    section: 'work',
    ownerTeam: '资源治理',
    defaultMinutes: 24 * 60,
    severityMinutes: { critical: 4 * 60, high: 24 * 60, normal: 72 * 60 },
  },
  ai_document: {
    section: 'jobs',
    ownerTeam: 'AI 与文件服务',
    defaultMinutes: 2 * 60,
    statusMinutes: { attention: 30, running: 15, waiting: 2 * 60 },
  },
  bookmark_icon: {
    section: 'jobs',
    ownerTeam: '书签服务',
    defaultMinutes: 12 * 60,
    statusMinutes: { attention: 2 * 60, running: 15, waiting: 12 * 60 },
  },
  todo_reminder: {
    section: 'jobs',
    ownerTeam: '待办与通知服务',
    defaultMinutes: 10,
    statusMinutes: { attention: 30, running: 10, waiting: 10 },
    waitingAnchor: 'scheduledAt',
  },
  account_deletion: {
    section: 'jobs',
    ownerTeam: '账号与隐私',
    defaultMinutes: 24 * 60,
    statusMinutes: { attention: 60, running: 15, waiting: 24 * 60 },
  },
  email_delivery: {
    section: 'jobs',
    ownerTeam: '通知服务',
    defaultMinutes: 60,
    statusMinutes: { attention: 60, running: 15, waiting: 60 },
  },
  file_preview: {
    section: 'jobs',
    ownerTeam: '文件预览服务',
    defaultMinutes: 2 * 60,
    statusMinutes: { attention: 60, running: 15, waiting: 2 * 60 },
  },
  resource_cleanup: {
    section: 'jobs',
    ownerTeam: '资源治理',
    defaultMinutes: 60,
    statusMinutes: { attention: 60, running: 15, waiting: 60 },
  },
});

function validTime(value) {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function getAdminWorkItemPolicy(source) {
  const policy = ADMIN_WORK_ITEM_POLICIES[source];
  return policy ? { ...policy } : null;
}

function resolveAdminWorkItemSlaMinutes(item) {
  const policy = ADMIN_WORK_ITEM_POLICIES[item?.source];
  if (!policy) return null;
  const severityMinutes = policy.severityMinutes?.[item?.severity];
  const statusMinutes = policy.statusMinutes?.[item?.status];
  return Number(severityMinutes ?? statusMinutes ?? policy.defaultMinutes);
}

function resolveAnchorTime(item, policy) {
  if (item?.status === 'waiting' && policy.waitingAnchor === 'scheduledAt') {
    return validTime(item.scheduledAtUtc || item.scheduledAt) ?? validTime(item.createdAt) ?? validTime(item.updatedAt);
  }
  if (policy.section === 'jobs' && item?.status === 'attention') {
    return validTime(item.updatedAt) ?? validTime(item.createdAt) ?? validTime(item.scheduledAt);
  }
  if (policy.section === 'jobs') {
    return validTime(item.updatedAt) ?? validTime(item.createdAt) ?? validTime(item.scheduledAt);
  }
  return validTime(item.createdAt) ?? validTime(item.updatedAt) ?? validTime(item.scheduledAt);
}

function enrichAdminWorkItem(item, { now = new Date() } = {}) {
  const policy = ADMIN_WORK_ITEM_POLICIES[item?.source];
  if (!policy) {
    return {
      ...item,
      ownerTeam: null,
      assignee: null,
      slaMinutes: null,
      dueAt: null,
      slaState: 'unavailable',
      ageMinutes: null,
      overdueMinutes: 0,
    };
  }
  const nowTime = now instanceof Date ? now.getTime() : Date.parse(now);
  const anchorTime = resolveAnchorTime(item, policy);
  const slaMinutes = resolveAdminWorkItemSlaMinutes(item);
  const fixedDueTime = validTime(item?.fixedDueAt);
  if (!Number.isFinite(nowTime) || anchorTime === null || (!Number.isFinite(slaMinutes) && fixedDueTime === null)) {
    return {
      ...item,
      ownerTeam: policy.ownerTeam,
      assignee: null,
      slaMinutes,
      dueAt: null,
      slaState: 'unavailable',
      ageMinutes: null,
      overdueMinutes: 0,
    };
  }
  const dueTime = fixedDueTime ?? anchorTime + slaMinutes * 60_000;
  const remainingMinutes = Math.floor((dueTime - nowTime) / 60_000);
  const dueSoonThreshold = Math.min(4 * 60, Math.max(15, Math.ceil(slaMinutes * 0.2)));
  const slaState = remainingMinutes < 0 ? 'overdue' : remainingMinutes <= dueSoonThreshold ? 'due_soon' : 'within_sla';
  return {
    ...item,
    ownerTeam: policy.ownerTeam,
    assignee: null,
    slaMinutes,
    dueAt: new Date(dueTime).toISOString(),
    slaState,
    ageMinutes: Math.max(0, Math.floor((nowTime - anchorTime) / 60_000)),
    overdueMinutes: slaState === 'overdue' ? Math.abs(remainingMinutes) : 0,
  };
}

function enrichAdminWorkItems(items, options) {
  return (Array.isArray(items) ? items : []).map((item) => enrichAdminWorkItem(item, options));
}

function summarizeAdminWorkItems(items) {
  const available = (Array.isArray(items) ? items : []).filter((item) => item.slaState !== 'unavailable');
  const oldestAgeMinutes = available.reduce((oldest, item) => Math.max(oldest, Number(item.ageMinutes || 0)), 0);
  return {
    overdue: available.filter((item) => item.slaState === 'overdue').length,
    dueSoon: available.filter((item) => item.slaState === 'due_soon').length,
    withinSla: available.filter((item) => item.slaState === 'within_sla').length,
    slaUnavailable: (Array.isArray(items) ? items.length : 0) - available.length,
    oldestAgeMinutes,
  };
}

export {
  ADMIN_WORK_ITEM_POLICIES,
  ADMIN_WORK_ITEM_POLICY_VERSION,
  enrichAdminWorkItem,
  enrichAdminWorkItems,
  getAdminWorkItemPolicy,
  resolveAdminWorkItemSlaMinutes,
  summarizeAdminWorkItems,
};
