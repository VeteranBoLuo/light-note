import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const campaignSource = readFileSync(
  resolve(process.cwd(), 'src/view/admin/components/supportManagement/SupportCampaignManagement.vue'),
  'utf8',
);
const managementSource = readFileSync(
  resolve(process.cwd(), 'src/view/admin/components/supportManagement/SupportManagement.vue'),
  'utf8',
);

describe('Root 限时套餐管理契约', () => {
  it('使用 B 系列组件创建版本化草稿、成本预览、发布、暂停和查看领取记录', () => {
    for (const component of ['BButton', 'BCard', 'BChip', 'BInput', 'BLoading', 'BModal', 'BTable']) {
      expect(campaignSource).toContain(`<${component}`);
    }
    expect(campaignSource).not.toMatch(/<button\b|<input\b|<select\b|<a-(?:modal|table|input)/u);
    expect(campaignSource).toContain('previewAdminSupportCampaignCosts');
    expect(campaignSource).toContain('createAdminSupportCampaign');
    expect(campaignSource).toContain('publishAdminSupportCampaign');
    expect(campaignSource).toContain('suspendAdminSupportCampaign');
    expect(campaignSource).toContain('getAdminSupportCampaignGrants');
    expect(campaignSource).toContain('Alert.alert');
    expect(campaignSource).toContain('v-else-if="grantsError"');
    expect(campaignSource).toContain('theme="al-day"');
    expect(campaignSource).toContain('campaign-admin__grant-cards');
    expect(campaignSource).toContain('grantStatusLabel(record.status)');
  });

  it('明确显示 40% 成本门禁、已发布不可修改和活动结束状态', () => {
    expect(campaignSource).toContain("sku.marginBps >= 4000 ? 'success' : 'danger'");
    expect(campaignSource).toContain(':disabled="!campaignPassesCostGate(campaign)"');
    expect(campaignSource).toContain("t('adminSupport.campaigns.publishCostBlocked')");
    expect(campaignSource).toContain("campaign.status === 'draft'");
    expect(campaignSource).toContain('campaignIsEnded(campaign)');
    expect(campaignSource).toContain("const status = campaignIsEnded(campaign) ? 'ended' : campaign.status");
    expect(campaignSource).toContain("t('adminSupport.campaigns.immutable')");
  });

  it('赞助管理总览展示永久 AI、永久空间并提供独立活动标签页', () => {
    expect(managementSource).toContain("t('adminSupport.metrics.grantedTokens')");
    expect(managementSource).toContain("t('adminSupport.metrics.grantedStorage')");
    expect(managementSource).toContain("t('adminSupport.rewardGrantedStorage'");
    expect(managementSource).toContain("t('adminSupport.rewardGrantedCombo'");
    expect(managementSource).toContain("{ key: 'campaigns', label: t('adminSupport.tabs.campaigns') }");
    expect(managementSource).toContain("<SupportCampaignManagement v-else-if=\"activeTab === 'campaigns'\" />");
  });
});
