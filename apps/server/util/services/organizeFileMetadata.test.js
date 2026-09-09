import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../aiSkill/structuredModel.js', () => ({
  callStructuredSkillModel: vi.fn(),
  estimateStructuredSkillModelTokens: ({ messages }) => JSON.stringify(messages).length + 1200,
}));
import { callStructuredSkillModel } from '../aiSkill/structuredModel.js';
import { fileEvidenceBatches, compileFileMetadataPlan, suggestResourceMetadata } from './organizeSuggestionModel.js';
const snapshot = (text, title = '项目面试准备.md') => ({
  type: 'file',
  title,
  tags: [],
  source: { title, text, evidenceSegments: [{ id: 'text:0', locator: '项目说明', kind: 'text', content: text }] },
  reading: { complete: true, state: 'text' },
});
const noTitle = { name: '', evidence: '', confidence: 0 };
beforeEach(() => vi.clearAllMocks());
it('7500字 Markdown 全文进入单次调用，按真实片段归纳主题并复用标签', async () => {
  const text = '项目面试准备，数据可视化。' + '正文'.repeat(3740);
  callStructuredSkillModel.mockImplementation(async (request) => {
    const resource = JSON.parse(request.messages[1].content).resource;
    expect(resource.evidence.map((e) => e.content).join('')).toBe(text);
    return request.validateArguments({
      title: noTitle,
      tags: [{ name: '数据可视化', evidence: '数据可视化', confidence: 0.95, evidenceRef: resource.evidence[0].id }],
    });
  });
  const result = await suggestResourceMetadata(snapshot(text), ['tags'], [{ id: 'tag', name: '数据可视化' }]);
  expect(result.tags[0]).toMatchObject({ id: 'tag', evidenceType: 'text', locator: '项目说明' });
  expect(callStructuredSkillModel).toHaveBeenCalledTimes(1);
});
it('长文档每字进入分析，末尾主题不会被前五块或6000字限制丢弃', async () => {
  const text = '前文'.repeat(15000) + '\n末尾主题：门窗设计';
  const seen = [];
  callStructuredSkillModel.mockImplementation(async (request) => {
    const evidence = JSON.parse(request.messages[1].content).resource.evidence;
    seen.push(...evidence.map((e) => e.content));
    return request.validateArguments({
      title: noTitle,
      tags: evidence.some((e) => e.content.includes('门窗设计'))
        ? [
            {
              name: '门窗',
              evidence: '门窗设计',
              evidenceRef: evidence.find((e) => e.content.includes('门窗设计')).id,
              confidence: 0.97,
            },
          ]
        : [],
    });
  });
  const result = await suggestResourceMetadata(snapshot(text), ['tags'], []);
  expect(seen.join('')).toBe(text);
  expect(result.tags[0].name).toBe('门窗');
  expect(
    fileEvidenceBatches(snapshot(text)).every((batch) => batch.reduce((n, e) => n + e.content.length, 0) <= 12000),
  ).toBe(true);
});
it('文件名可作保守主题依据；虚构证据、格式标签和低置信候选被拒绝', async () => {
  callStructuredSkillModel.mockImplementation(async (request) =>
    request.validateArguments({
      title: noTitle,
      tags: [
        { name: '灯具', evidence: '主卧灯', evidenceRef: 'filename', confidence: 0.96 },
        { name: 'PDF', evidence: '主卧灯', evidenceRef: 'filename', confidence: 0.96 },
        { name: '虚构', evidence: '主卧灯', evidenceRef: 'text:wrong', confidence: 0.96 },
        { name: '低置信', evidence: '主卧灯', evidenceRef: 'filename', confidence: 0.2 },
      ],
    }),
  );
  const result = await suggestResourceMetadata(snapshot('', '主卧灯.jpg'), ['tags'], []);
  expect(result.tags.map((t) => t.name)).toEqual(['灯具']);
});
it('自动文件名且无内容时不调用模型', async () => {
  const result = await suggestResourceMetadata(snapshot('', '2026-7-13.png'), ['tags'], []);
  expect(callStructuredSkillModel).not.toHaveBeenCalled();
  expect(result.tagOutcome).toBe('no_evidence');
});
it('无文字图片可用视觉主体推荐，并绑定视觉来源', async () => {
  const item = snapshot('', 'paste_1234567890.jpg');
  item.source.visualEvidence = [{ id: 'visual:1', kind: 'visual', locator: '第 1 页', content: '狗狗吐舌的表情包' }];
  callStructuredSkillModel.mockImplementation(async (request) =>
    request.validateArguments({
      title: noTitle,
      tags: [{ name: '表情包', evidence: '狗狗吐舌', evidenceRef: 'visual:1:0', confidence: 0.97 }],
    }),
  );
  expect((await suggestResourceMetadata(item, ['tags'], [])).tags[0]).toMatchObject({
    name: '表情包',
    evidenceType: 'visual',
  });
});
it('预先编译识图、全部分批、汇总和平台修复预算', () => {
  const plan = compileFileMetadataPlan(snapshot('长文'.repeat(16000)), [], 4);
  expect(plan.providerPlan.stages.image_recognition.maxCalls).toBe(4);
  expect(plan.providerPlan.stages.model_generation.maxCalls).toBeGreaterThan(3);
  expect(plan.providerPlan.stages.output_repair.billingScope).toBe('platform');
  expect(plan.reservationTokens).toBeGreaterThan(64000);
});
it('最终汇总只能选择校验过的候选，不能生成新事实', async () => {
  let index = 0;
  callStructuredSkillModel.mockImplementation(async (request) => {
    if (request.structuredTool.name === 'select_file_topics') return request.validateArguments({ indexes: [2, 0, 1] });
    const evidence = JSON.parse(request.messages[1].content).resource.evidence[0];
    return request.validateArguments({
      title: noTitle,
      tags: [0, 1].map((n) => ({
        name: `主题${index++}`,
        evidence: '内容',
        confidence: 0.95,
        evidenceRef: evidence.id,
      })),
    });
  });
  const result = await suggestResourceMetadata(snapshot('内容'.repeat(12000)), ['tags'], []);
  expect(result.tags.map((t) => t.name)).toEqual(['主题2', '主题0', '主题1']);
});
it.each(['filename', 'text', 'visual'])('行驶证的%s依据允许推荐标签库中不存在的新主题', async (kind) => {
  const current = snapshot(kind === 'text' ? '中华人民共和国机动车行驶证' : '', '行驶证主页.jpg');
  if (kind === 'visual') current.source.visualEvidence = [{ id: 'visual:1', kind: 'visual', locator: '第1页', content: '主体：机动车行驶证' }];
  callStructuredSkillModel.mockImplementation(async request => {
    const resource = JSON.parse(request.messages[1].content).resource;
    return request.validateArguments({ title: noTitle, tags: [{ name: '行驶证', evidence: '行驶证', evidenceRef: kind === 'filename' ? 'filename' : resource.evidence.find(e => e.kind === kind).id, confidence: 0.95 }] });
  });
  const result = await suggestResourceMetadata(current, ['tags'], [{ id: 'unrelated', name: '网络安全' }]);
  expect(result.tags).toEqual([expect.objectContaining({ name: '行驶证', id: null, source: 'new', evidenceType: kind })]);
});
