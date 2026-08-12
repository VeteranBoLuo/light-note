import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createAdminOpinionReceipt,
  normalizeAdminOpinionReturnTo,
  normalizeAdminOpinionStatus,
  parseAdminOpinionImages,
} from './useAdminUserOpinion';

const translate = (key: string, named: Record<string, string | number> = {}) => {
  const suffix = Object.entries(named)
    .map(([name, value]) => `${name}=${value}`)
    .join(',');
  return suffix ? `${key}(${suffix})` : key;
};

describe('后台用户反馈共享任务流', () => {
  it('只接受现有反馈状态和待处理中心本地返回路径', () => {
    expect(normalizeAdminOpinionStatus('replied')).toBe('replied');
    expect(normalizeAdminOpinionStatus('closed')).toBe('all');
    expect(
      normalizeAdminOpinionReturnTo('/admin/actionCenter?section=work&source=opinion&keyword=%E5%8F%8D%E9%A6%88'),
    ).toContain('/admin/actionCenter?');
    expect(normalizeAdminOpinionReturnTo('/actionCenter?section=work')).toBe('/actionCenter?section=work');
    expect(normalizeAdminOpinionReturnTo('https://example.com/admin/actionCenter')).toBe('');
    expect(normalizeAdminOpinionReturnTo('/admin/userMg')).toBe('');
  });

  it('容错解析反馈图片，不把无效 JSON 当作图片列表', () => {
    expect(parseAdminOpinionImages('["a.png", "", "b.png"]')).toEqual(['a.png', 'b.png']);
    expect(parseAdminOpinionImages(['a.png', '', 'b.png'])).toEqual(['a.png', 'b.png']);
    expect(parseAdminOpinionImages('{bad-json')).toEqual([]);
  });

  it('回复回执保留完整请求与审计编号，并显式披露通知失败', () => {
    const success = createAdminOpinionReceipt(
      'reply',
      {
        affectedRows: 1,
        requestId: 'request-opinion-full-id',
        auditId: 'audit-opinion-full-id',
        notificationCreated: true,
      },
      translate,
    );
    expect(success.tone).toBe('success');
    expect(success.content).toContain('request-opinion-full-id');
    expect(success.content).toContain('audit-opinion-full-id');

    const warning = createAdminOpinionReceipt(
      'reply',
      { affectedRows: 1, requestId: 'request-warning', auditId: null, notificationCreated: false },
      translate,
    );
    expect(warning.tone).toBe('warning');
    expect(warning.content).toContain('adminUserOpinion.receipt.auditUnavailable');
    expect(warning.content).toContain('adminUserOpinion.receipt.notificationFailed');
  });

  it('桌面与移动端共用同一业务状态，移动端只保留安全回复动作', () => {
    const base = resolve(process.cwd(), 'src/view/admin/components');
    const desktop = readFileSync(resolve(base, 'userOpinion/UserOpinion.vue'), 'utf8');
    const mobile = readFileSync(resolve(base, 'userOpinion/UserOpinionMobile.vue'), 'utf8');
    const actionCenter = readFileSync(resolve(base, 'actionCenter/ActionCenter.vue'), 'utf8');

    for (const source of [desktop, mobile]) {
      expect(source).toContain('useAdminUserOpinion');
      expect(source).toContain('AdminOpinionDetail');
      expect(source).toContain('saveAndReturn');
    }
    expect(mobile).toContain('MobileListSurface');
    expect(mobile).toContain('closeCurrentMobileOverlayThen');
    expect(mobile).not.toContain('requestDelete');
    expect(mobile).not.toContain('AdminRiskActionModal');
    expect(desktop).toContain('AdminRiskActionModal');
    expect(actionCenter).toContain('actionCenterReturnTo');
    expect(actionCenter).toContain("path: mobile ? '/userOpinion' : '/admin/userOpinion'");
  });
});
