import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'src/view/admin/components/resourceGovernance/ResourceGovernance.vue'),
  'utf8',
);
const template = source.slice(0, source.indexOf('<script'));

describe('资源治理批量操作', () => {
  it('为两类执行器分别提供本页全选，避免混入同一个批次', () => {
    expect(template).toContain("isPageKindSelected('cleanup')");
    expect(template).toContain("togglePageKind('cleanup', checked)");
    expect(template).toContain("isPageKindSelected('cleanup_invalid_owner')");
    expect(template).toContain("togglePageKind('cleanup_invalid_owner', checked)");
    expect(source).toMatch(/function togglePageKind[\s\S]*selectedIds\.value = candidateIds;/u);
  });

  it('集中展示选择结果，并复用原有预览和二次确认流程', () => {
    expect(template).toContain('batchSelectedSummary');
    expect(template).toContain('selectedEstimatedBytes');
    expect(template).toContain('@click="clearSelection"');
    expect(template).toContain('@click="reviewCleanup"');
    expect(source).toContain('previewGovernanceCleanup(selectedIds.value)');
    expect(source).toContain('createGovernanceCleanupJob(preview.previewToken');
  });

  it('仍只允许服务端声明可执行且处于 open 状态的候选被选择', () => {
    expect(source).toMatch(/if \(!finding\.actionEligible \|\| finding\.state !== 'open'\) return false;/u);
    expect(source).toContain("finding.actionKind === 'cleanup' && capabilities.cleanupEnabled");
    expect(source).toContain('capabilities.reviewCleanupEnabled');
    expect(source).toContain('.governance-batch-bar__actions :deep(.b_btn)');
  });

  it('按服务端实时账号状态解释候选，并明确阻断仅停用账号', () => {
    expect(source).toContain("finding.ownerCleanupState === 'formally_deleted'");
    expect(source).toContain("finding.ownerCleanupState === 'disabled'");
    expect(source).toContain("t('resourceGovernance.guardOwnerNotDeleted')");
  });
});
