import { recordOperation } from '@/api/commonApi';

/** Keep public-resource telemetry low sensitivity and outside the business success path. */
export function logPublicResourceOperation(operation: string) {
  try {
    void recordOperation({ module: '公开管理', operation }).catch(() => {});
  } catch {
    // Telemetry must not prevent navigation, preference updates or committed writes.
  }
}

export function publicResourceWriteLabel(path: string, body: Record<string, unknown>): string | null {
  if (path === 'submit') return '提交审核';
  if (/^own\/[^/]+\/withdraw$/.test(path)) return '取消公开';
  if (/^moderation\/reports\/[^/]+$/.test(path)) {
    return body.action === 'remove' ? '处理举报并下架' : body.action === 'dismiss' ? '驳回举报' : null;
  }
  if (/^moderation\/[^/]+\/decide$/.test(path)) {
    const labels: Record<string, string> = {
      approve: '审核通过',
      reject: '审核拒绝',
      remove: '下架公开资源',
      unlock: '解除下架',
    };
    return Object.hasOwn(labels, String(body.action)) ? labels[String(body.action)] : null;
  }
  if (/^[^/]+\/save$/.test(path)) return '保存公开资源副本';
  if (/^[^/]+\/report$/.test(path)) return '举报公开资源';
  return null;
}

export function logPublicResourceWrite(path: string, body: Record<string, unknown>, result: unknown) {
  const label = publicResourceWriteLabel(path, body);
  if (!label) return;
  const value = result as { reused?: boolean; existing?: boolean; inTrash?: boolean } | null;
  const outcome = value?.reused
    ? '已处理，无须重复操作'
    : value?.existing
      ? value.inTrash
        ? '已有副本在回收站'
        : '已有副本'
      : '成功';
  logPublicResourceOperation(`${label}【${outcome}】`);
}
