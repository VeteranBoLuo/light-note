import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function read(name: string) {
  return readFileSync(resolve(process.cwd(), `src/view/serverManagement/${name}`), 'utf8');
}

const overview = read('ServerManagement.vue');
const services = read('ServerServices.vue');
const events = read('ServerEvents.vue');

describe('服务器管理信息架构', () => {
  it('运行概览只负责主机指标、运行事实与趋势，不复制服务列表、日志或写操作', () => {
    expect(overview).toContain("t('serverManagement.metricsTitle')");
    expect(overview).toContain("t('serverManagement.runtimeTitle')");
    expect(overview).toContain("t('serverManagement.historyTitle')");
    expect(overview).not.toContain('getInfraLogs');
    expect(overview).not.toContain('AdminRiskActionModal');
    expect(overview).not.toContain("t('serverManagement.servicesTitle')");
    expect(overview).not.toContain('<BTable');
  });

  it('服务进程是服务状态、受限日志和白名单写操作的唯一入口', () => {
    expect(services).toContain('getInfraServices');
    expect(services).toContain('getInfraLogs');
    expect(services).toContain('useInfraActions');
    expect(services).toContain('AdminRiskActionModal');
    expect(services).toContain('class="service-log-viewer"');
    expect(services).toContain('record.actions');
  });

  it('操作审计页只读取写操作审计，不再维护第二套固定服务日志', () => {
    expect(events).toContain('getAdminOperationAudits');
    expect(events).toContain("actionScope: 'infra'");
    expect(events).not.toContain('getInfraLogs');
    expect(events).not.toContain('events-log-grid');
    expect(events).not.toContain('logsTitle');
    expect(events).not.toContain('<BModal');
  });
});
