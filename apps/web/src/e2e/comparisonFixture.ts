import { comparisonTableMarkdown } from '@lightnote/shared/comparison-table';
export function createComparisonFixture(params: URLSearchParams) {
  let quoteInput: any;
  let artifact: any;
  let medium = 'ai_quota';
  const now = '2026-10-10T08:00:00Z';
  const response = (config: any, data: any, status = 200) => ({
    data: { status, msg: 'fixture', data },
    status,
    statusText: 'OK',
    headers: {},
    config,
  });
  return (config: any) => {
    const url = String(config.url || '');
    const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data || {};
    if (url === '/api/toolbox/quotes') {
      quoteInput = body.input;
      medium = body.billingMedium;
      return response(config, {
        id: 'comparison-quote',
        toolId: 'source_comparison',
        billingMedium: medium,
        quotedPoints: medium === 'points' ? 15 : 0,
        expiresAt: '2099-01-01T00:00:00Z',
        inputSummary: { itemCount: body.input.resourceRefs.length, totalBytes: 1000 },
      });
    }
    if (url === '/api/toolbox/jobs' && config.method === 'post') {
      const columns = quoteInput.options.columns;
      const table = columns
        ? {
            columns,
            rows: quoteInput.resourceRefs.map((ref: any, index: number) => ({
              sourceId: `${ref.type}:${ref.id}`,
              title: `材料 ${index + 1} · 对比方案`,
              cells: columns.map((_column: any, c: number) =>
                index === 1 && c === 0
                  ? { value: '', status: 'missing', quotes: [] }
                  : index === 2 && c === 0
                    ? {
                        value: '29 元；19 元',
                        status: 'conflict',
                        quotes: ['新版每月 29 元。', '附录旧版本每月 19 元。'],
                      }
                    : {
                        value: c === 0 ? '39 元 / 人 / 月' : '支持',
                        status: 'found',
                        quotes: [c === 0 ? '团队版价格为每人每月 39 元。' : '此方案支持该功能。'],
                      },
              ),
            })),
          }
        : null;
      artifact = {
        id: 'comparison-artifact',
        jobId: 'comparison-job',
        toolId: 'source_comparison',
        type: 'comparison',
        title: table ? '方案对比表' : '资料对比报告',
        version: 1,
        content: table
          ? comparisonTableMarkdown(table)
          : '# 资料对比报告\n\n| 维度 | 材料一 | 材料二 |\n| --- | --- | --- |\n| 定位 | 学习 | 协作 |\n\n## 共同点、差异与冲突\n两份材料关注不同使用场景。\n\n## 互补信息\n可以结合使用。\n\n## 覆盖限制\n仅依据所选材料。\n\n## 下一步建议\n进一步验证使用成本。',
        contentType: 'markdown',
        sources: quoteInput.resourceRefs.map((ref: any, i: number) => ({
          id: `${ref.type}:${ref.id}`,
          resourceId: ref.id,
          resourceType: ref.type,
          citationKey: String(i + 1),
          title: `材料 ${i + 1}`,
          excerpt: '虚构测试资料',
          coverage: { complete: true },
        })),
        coverage: { complete: true, warnings: [], requestedResources: quoteInput.resourceRefs.length },
        meta: table ? { comparisonTable: table } : {},
        save: { status: 'unsaved' },
        createdAt: now,
        expiresAt: '2099-01-01T00:00:00Z',
      };
      return response(config, { id: 'comparison-job' });
    }
    if (url === '/api/toolbox/jobs/comparison-job')
      return response(config, {
        id: 'comparison-job',
        toolId: 'source_comparison',
        status: 'succeeded',
        stage: 'completed',
        progress: 100,
        billing: { medium, status: 'settled', quotedPoints: 0, actualPoints: 0, refundedPoints: 0 },
        save: artifact.save,
        error: null,
        artifact: { id: artifact.id, type: 'comparison', title: artifact.title, version: artifact.version },
        artifactState: 'ready',
        canCancel: false,
        startedAt: now,
        createdAt: now,
        completedAt: now,
      });
    if (url === '/api/toolbox/artifacts/comparison-artifact') return response(config, artifact);
    if (url === '/api/toolbox/artifacts/comparison-artifact/comparison') {
      if (params.get('reviewError') === '1') return response(config, { code: 'TOOLBOX_COMPARISON_CONFLICT' }, 409);
      const cell = artifact.meta.comparisonTable.rows.find((r: any) => r.sourceId === body.sourceId).cells[
        body.columnIndex
      ];
      cell.originalValue ??= cell.value;
      cell.value = body.value.trim();
      cell.edited = cell.value !== cell.originalValue;
      cell.reviewed = true;
      artifact.content = comparisonTableMarkdown(artifact.meta.comparisonTable);
      artifact.version++;
      return response(config, { version: artifact.version });
    }
    if (url === '/api/toolbox/artifacts/comparison-artifact/save') {
      artifact.save = {
        status: 'saved',
        targetType: 'note',
        targetId: 'fixture-note',
        targetAvailability: 'available',
      };
      return response(config, { ...artifact.save, idempotent: false });
    }
    return null;
  };
}
