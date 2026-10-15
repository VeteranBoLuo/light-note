import pool from '../db/index.js';
import { getAdminWorkItemPolicy } from './adminWorkItemPolicy.js';
import { CARD_IMAGE_PROFILE } from '@lightnote/shared';
import { ACCOUNT_DELETION_STALE_PROCESSING_MINUTES } from './accountDeletionPolicy.js';

const regularState = (processing = 'processing') => `CASE
  WHEN j.status='failed' OR (j.status='${processing}' AND j.locked_at<DATE_SUB(NOW(),INTERVAL 10 MINUTE)) THEN 'attention'
  WHEN j.status='${processing}' THEN 'running' ELSE 'waiting' END`;

const specs = {
  ai_document: {
    table: 'ai_document_jobs',
    active: "j.status IN ('queued','processing','failed')",
    state: regularState(),
    completed: "j.status='completed' AND j.update_time>=DATE_SUB(NOW(),INTERVAL 1 DAY)",
    valid: `EXISTS (SELECT 1 FROM ai_document_sources source WHERE source.id=j.source_id
      AND (source.expires_at IS NULL OR source.expires_at>NOW())
      AND (source.source_type<>'cloud' OR EXISTS (SELECT 1 FROM files f WHERE f.id=source.file_id
        AND f.create_by=source.user_id AND f.del_flag=0)))`,
  },
  bookmark_icon: {
    table: 'bookmark_icon_jobs',
    active: "j.status IN ('queued','processing','retry_wait','failed')",
    state: regularState(),
    completed: "j.status IN ('success','not_found') AND j.update_time>=DATE_SUB(NOW(),INTERVAL 1 DAY)",
    // 历史书签主键为 utf8，队列为 utf8mb4。只转换队列侧以保留主键索引，另复核无损等值。
    valid: `EXISTS (SELECT 1 FROM bookmark b WHERE b.id=CONVERT(j.bookmark_id USING utf8)
      AND b.user_id=CONVERT(j.user_id USING utf8) AND b.del_flag=0
      AND CONVERT(b.id USING utf8mb4) COLLATE utf8mb4_unicode_ci=CONVERT(j.bookmark_id USING utf8mb4) COLLATE utf8mb4_unicode_ci
      AND CONVERT(b.user_id USING utf8mb4) COLLATE utf8mb4_unicode_ci=CONVERT(j.user_id USING utf8mb4) COLLATE utf8mb4_unicode_ci)`,
  },
  todo_reminder: {
    table: 'todo_reminder_jobs',
    active: "j.status IN ('pending','processing','failed','unknown')",
    state: `CASE WHEN j.status IN ('failed','unknown') OR (j.status='processing' AND j.lease_until<UTC_TIMESTAMP())
      OR (j.status='pending' AND j.scheduled_at_utc<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 10 MINUTE)) THEN 'attention'
      WHEN j.status='processing' THEN 'running' ELSE 'waiting' END`,
    completed: "j.status='sent' AND j.sent_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY)",
    waitingAnchor: "TIMESTAMPDIFF(SECOND,'1970-01-01 00:00:00',j.scheduled_at_utc)",
  },
  account_deletion: {
    table: 'account_deletion_requests',
    active: "j.status IN ('pending','processing','retry_wait')",
    state: `CASE WHEN j.status='retry_wait' OR (j.status='processing' AND (j.processing_started_at IS NULL
      OR j.processing_started_at<DATE_SUB(NOW(),INTERVAL ${ACCOUNT_DELETION_STALE_PROCESSING_MINUTES} MINUTE))) THEN 'attention'
      WHEN j.status='processing' THEN 'running' ELSE 'waiting' END`,
    completed: "j.status='completed' AND j.completed_at>=DATE_SUB(NOW(),INTERVAL 1 DAY)",
    anchor: 'UNIX_TIMESTAMP(COALESCE(j.update_time,j.requested_at))',
  },
  email_delivery: {
    table: 'email_delivery_logs',
    active: "j.status IN ('sending','failed')",
    state: `CASE WHEN j.status='failed' OR j.update_time<DATE_SUB(NOW(),INTERVAL 10 MINUTE)
      THEN 'attention' ELSE 'running' END`,
    completed: "j.status='accepted' AND j.accepted_at>=DATE_SUB(NOW(),INTERVAL 1 DAY)",
    // 同一次提醒投递由提醒队列承接，不再把投递日志算作第二个待处理任务。
    valid: `NOT (COALESCE(j.business_type,'')='todo_reminder_job' AND EXISTS
      (SELECT 1 FROM todo_reminder_jobs reminder WHERE reminder.id=j.business_id))`,
  },
  file_preview: {
    table: 'file_preview_jobs',
    active: "j.status IN ('queued','processing','failed')",
    state: regularState(),
    completed: "j.status='completed' AND j.update_time>=DATE_SUB(NOW(),INTERVAL 1 DAY)",
    valid: `EXISTS (SELECT 1 FROM file_preview_artifacts artifact WHERE artifact.id=j.artifact_id AND (
      (artifact.source_type='image_asset' AND artifact.strategy_version=${CARD_IMAGE_PROFILE.version}
        AND EXISTS (SELECT 1 FROM image_assets asset WHERE asset.id=artifact.file_id
          AND asset.status='active' AND asset.source_version=artifact.source_revision))
      OR (artifact.source_type='cloud_file' AND EXISTS (SELECT 1 FROM files f WHERE f.id=artifact.file_id
        AND f.create_by=artifact.owner_user_id AND f.del_flag=0))))`,
  },
  resource_cleanup: {
    table: 'resource_cleanup_jobs',
    active: "j.status IN ('pending','running','completed_with_errors')",
    state: `CASE WHEN j.status='completed_with_errors' OR (j.status='running' AND j.lease_expires_at<NOW())
      THEN 'attention' WHEN j.status='running' THEN 'running' ELSE 'waiting' END`,
    completed: "j.status IN ('completed','completed_with_errors') AND j.finished_at>=DATE_SUB(NOW(),INTERVAL 1 DAY)",
  },
};

export function asyncJobSpec(source) {
  if (!Object.hasOwn(specs, source))
    throw Object.assign(new Error('Unsupported async source'), { code: 'ASYNC_JOB_SOURCE_INVALID' });
  return specs[source];
}

export function visibleAsyncJobSql(source) {
  const spec = asyncJobSpec(source);
  return `(${spec.valid || 'TRUE'}) AND NOT EXISTS (SELECT 1 FROM admin_async_job_archives archived
    WHERE archived.source='${source}' AND archived.job_id=CAST(j.id AS CHAR CHARACTER SET ascii)
      AND archived.job_status=j.status AND archived.job_updated_at_epoch=UNIX_TIMESTAMP(j.update_time))`;
}

export function loadAsyncJobSummary(source, { db = pool } = {}) {
  const spec = asyncJobSpec(source);
  const policy = getAdminWorkItemPolicy(source);
  const minutes = (status) => Number(policy.statusMinutes?.[status] ?? policy.defaultMinutes);
  const sla = `CASE health WHEN 'attention' THEN ${minutes('attention')} WHEN 'running' THEN ${minutes('running')}
    ELSE ${minutes('waiting')} END`;
  const anchor = spec.waitingAnchor ? `CASE WHEN health='waiting' THEN waiting_anchor ELSE anchor END` : 'anchor';
  return db.query(`SELECT COUNT(*) AS total,
      COALESCE(SUM(health='attention'),0) AS attention,
      COALESCE(SUM(health='running'),0) AS running,
      COALESCE(SUM(health='waiting'),0) AS waiting,
      COALESCE(SUM(completed_24h),0) AS completed_24h,
      COALESCE(SUM(health<>'completed'),0) AS sla_total,
      COALESCE(SUM(health<>'completed' AND due_epoch<UNIX_TIMESTAMP()),0) AS overdue,
      COALESCE(SUM(health<>'completed' AND due_epoch>=UNIX_TIMESTAMP()
        AND due_epoch-UNIX_TIMESTAMP()<(LEAST(240,GREATEST(15,CEIL(sla_minutes*0.2)))+1)*60),0) AS due_soon,
      COALESCE(SUM(health<>'completed' AND due_epoch IS NULL),0) AS sla_unavailable,
      COALESCE(GREATEST(0,FLOOR((UNIX_TIMESTAMP()-MIN(CASE WHEN health<>'completed' THEN anchor_epoch END))/60)),0) AS oldest_age_minutes
    FROM (SELECT snapshot.*, ${anchor} AS anchor_epoch, ${sla} AS sla_minutes,
        ${anchor}+(${sla})*60 AS due_epoch
      FROM (SELECT CASE WHEN ${spec.active} THEN ${spec.state} ELSE 'completed' END AS health,
          ${spec.anchor || 'UNIX_TIMESTAMP(COALESCE(j.update_time,j.create_time))'} AS anchor,
          ${spec.waitingAnchor || 'NULL'} AS waiting_anchor, (${spec.completed}) AS completed_24h
        FROM ${spec.table} j WHERE ((${spec.active}) OR (${spec.completed}))
          AND ${visibleAsyncJobSql(source)}) snapshot) health_summary`);
}
