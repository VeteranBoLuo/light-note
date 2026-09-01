import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

const component = source('src/view/admin/components/aiOperations/AiOperationsCenter.vue');
const moduleCatalog = source('src/components/aiSkills/aiUsageModules.ts');
const routes = source('src/router/modules/admin.ts');
const nav = source('src/view/admin/admin/adminNav.ts');

describe('AiOperationsCenter 页面契约', () => {
  it('桌面和移动路由共用一个运行中心，不再进入旧助手日志页面', () => {
    expect(routes.match(/aiOperations\/AiOperationsCenter\.vue/gu)).toHaveLength(2);
    expect(routes).not.toContain("import('@/view/admin/components/agentLog/AgentLog.vue')");
    expect(routes).not.toContain("import('@/view/admin/components/agentLog/AgentLogMobile.vue')");
    expect(nav).toContain("{ id: 'agentLog', title: 'AI 运行中心' }");
  });

  it('只调用统一执行账本接口，并明确不提供问题、正文或工具搜索', () => {
    expect(component).toContain("'/api/admin/ai-operations/overview'");
    expect(component).toContain("'/api/admin/ai-operations/executions/query'");
    expect(component).toContain('detail-endpoint="/api/admin/ai-operations/executions/detail"');
    expect(component).not.toContain('/api/common/getAgentLogs');
    expect(component).not.toContain('/api/common/getAgentLogChain');
    expect(component).not.toContain('requestPreview');
    expect(component).not.toContain('toolsUsed');
  });

  it('筛选、列表、弹框和移动高频列表全部使用既有 B 组件与共享移动表面', () => {
    for (const required of [
      '<BSelect',
      '<BInput',
      '<BSwitch',
      '<BTable',
      '<BChip',
      '<AiUsageDetailModal',
      '<MobileListSurface',
      '<MobileListRow',
    ]) {
      expect(component).toContain(required);
    }
    expect(component).not.toMatch(/<(?:input|select|button)\b/iu);
    expect(component).not.toMatch(/<svg\b|<path\b/iu);
    expect(moduleCatalog).toContain("'toolbox'");
  });

  it('覆盖加载、全量错误、保留旧数据、空态、更多分页和选中详情状态', () => {
    for (const state of [
      'initialLoading',
      'initialError',
      'partialData',
      'staleData',
      'listLoading',
      'listError',
      'hasMore',
      'detailVisible',
      'selectedExecution',
    ]) {
      expect(component).toContain(state);
    }
    expect(component).toContain("{ value: 'attention'");
    expect(component).toContain('summary.staleRunning');
    expect(component).toContain('summary.usageMissing');
    expect(component).toContain('summary.settlementAttention');
    expect(component).toContain('executionAttentionLabels');
    expect(component).toContain('usageAttention');
    expect(component).toContain('settlementAttention');
    expect(component).toContain('hasMore.value = false;');
    expect(component).toContain('operations-list-retry');
  });
});
