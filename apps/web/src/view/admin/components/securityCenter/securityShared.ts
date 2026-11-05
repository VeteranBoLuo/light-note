export type SecurityHandledStatus = 'unhandled' | 'processed' | 'false_positive' | 'authorized_test';

export type SecurityReviewDisposition = 'benign_anomaly' | 'authorized_test' | 'false_positive' | 'confirmed_attack';

const securityReviewDefaultReasonKeys: Record<SecurityReviewDisposition, string> = {
  benign_anomaly: 'securityV2.review.benignAnomalyReason',
  authorized_test: 'securityV2.review.authorizedTestReason',
  false_positive: 'securityV2.review.falsePositiveReason',
  confirmed_attack: 'securityV2.review.confirmedAttackReason',
};

export function securityReviewDefaultReasonKey(disposition: unknown) {
  if (typeof disposition !== 'string') return '';
  return securityReviewDefaultReasonKeys[disposition as SecurityReviewDisposition] || '';
}

export const securityHandledStatusOptions: Array<{ value: SecurityHandledStatus; label: string }> = [
  { value: 'unhandled', label: '未处理' },
  { value: 'processed', label: '已处理' },
  { value: 'false_positive', label: '误报' },
  { value: 'authorized_test', label: '授权测试' },
];

export function excludesSecurityEventRisk(status: string) {
  return status === 'false_positive' || status === 'authorized_test';
}

export function securityHandledStatusConfirmText(status: SecurityHandledStatus, total = 1) {
  const target = total > 1 ? `选中的 ${total} 条攻击日志` : '这条攻击日志';
  if (status === 'false_positive') {
    return `确认将${target}标记为误报？日志证据会保留，对应的 IP 和账号风险影响会被回滚。`;
  }
  if (status === 'authorized_test') {
    return `确认将${target}标记为授权测试？日志证据和拦截结果会保留，但不会计入 IP 和账号风险。`;
  }
  if (status === 'unhandled') {
    return `确认将${target}改为未处理？如果此前标记为误报或授权测试，对应风险将重新计入。`;
  }
  return `确认将${target}标记为已处理？如果此前标记为误报或授权测试，对应风险将重新计入。`;
}

export function securityHandledStatusBatchRemark(status: SecurityHandledStatus) {
  return `管理员批量标记为${statusText(status)}`;
}

export function statusText(status: string) {
  return (
    {
      unhandled: '未处理',
      processed: '已处理',
      confirmed: '已处理',
      false_positive: '误报',
      authorized_test: '授权测试',
      ignored: '已处理',
      resolved: '已处理',
    }[status] || status
  );
}

export function statusPillClass(status: string) {
  return (
    {
      unhandled: 'is-unhandled',
      processed: 'is-processed',
      confirmed: 'is-processed',
      false_positive: 'is-false-positive',
      authorized_test: 'is-authorized-test',
      ignored: 'is-processed',
      resolved: 'is-processed',
    }[status] || 'is-neutral'
  );
}
