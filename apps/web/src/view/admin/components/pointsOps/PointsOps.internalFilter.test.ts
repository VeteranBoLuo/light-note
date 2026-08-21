import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(resolve(process.cwd(), `src/view/admin/components/pointsOps/${file}`), 'utf8');

describe('积分治理内部账号口径', () => {
  it('默认使用 BSwitch 隐藏内部账号，并把开关传给所有聚合页签', () => {
    const source = read('PointsOps.vue');
    expect(source).toContain("import BSwitch from '@/components/base/BasicComponents/BSwitch.vue'");
    expect(source).toContain('const hideInternal = ref(true)');
    expect(source).toContain('v-model:checked="hideInternal"');
    expect(source).toContain('@change="handleInternalFilterChange"');
    expect(source).toMatch(/async function handleInternalFilterChange\(\)[\s\S]*?await nextTick\(\)[\s\S]*?await refreshActive\(\)/);
    expect(source.match(/:hide-internal="hideInternal"/g)).toHaveLength(3);
    expect(source).toContain('growthApi.adminPointsOverview(hideInternal.value)');
  });

  it('健康、来源、异常和对账请求共享同一开关', () => {
    const health = read('PointsGovernanceOverview.vue');
    const sources = read('PointsSourcesPanel.vue');
    const reconciliation = read('PointsReconciliationPanel.vue');
    expect(health).toContain('{ hideInternal: props.hideInternal }');
    expect(sources).toContain('hideInternal: props.hideInternal');
    expect(reconciliation.match(/hideInternal: props\.hideInternal/g)).toHaveLength(3);
  });
});
