import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/view/admin/components/actionCenter/ActionCenter.vue'), 'utf8');
const template = source.slice(0, source.indexOf('<script'));

describe('待处理中心批量操作契约', () => {
  it('只在异步任务区域提供批量动作和逐项选择', () => {
    expect(template).toContain('v-if="activeSection === \'jobs\'" class="action-center__batch"');
    expect(template).toContain("batchAction === 'dismiss'");
    expect(template).toContain('toggleAllBatchEligible');
    expect(template).toContain('toggleBatchItem(item, checked)');
    expect(template).toContain('class="action-center__item-select-slot"');
    expect(source).toMatch(/\.action-center__item-main \{[\s\S]*flex: 1 1 auto;/u);
    expect(source).toContain('.action-center__batch-actions :deep(.b_btn)');
    expect(source).toContain('.action-center__item :deep(.b_btn)');
  });

  it('全部来源请求同时读取两区汇总，Tab 数量使用独立快照', () => {
    expect(source).toContain("section: requestedSource === 'all' ? 'all' : activeSection.value");
    expect(source).toContain('badge: workTabTotal.value');
    expect(source).toContain('badge: jobTabAttention.value');
  });

  it('安全重试只选择 canRetry，移除只选择明确失败的书签图标任务', () => {
    expect(source).toContain("filteredItems.value.filter((item) => activeSection.value === 'jobs' && item.canRetry)");
    expect(source).toMatch(
      /item\.source === 'bookmark_icon'[\s\S]*item\.status === 'attention'[\s\S]*item\.rawStatus === 'failed'/u,
    );
  });

  it('复用单项安全接口并限制为三路并发，保留逐项事务和审计', () => {
    expect(source).toContain('concurrency = 3');
    expect(source).toContain('retryAdminAsyncJob({');
    expect(source).toContain('dismissAdminAsyncJob({');
    expect(source).toContain('adminActionCenter.batch.partial');
  });
});
