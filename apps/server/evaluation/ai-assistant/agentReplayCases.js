/**
 * 开放的笔记产出表达必须走统一草稿协议。
 *
 * 这些说法在旧入口下一律漏判：NOTE_WRITE_PATTERN 与 note.create 的 actionPatterns
 * 都不含合并/汇总/归并类动词，请求会退化成全量工具 Semantic Planner，且因为
 * getPlannerMaxTokens 同样按写入词判断预算，长正文还会被 1200 token 截断。
 *
 * 这里验证的是“分类判定为产出笔记后主链是否进入草稿协议”；真实模型的分类准确率
 * 需要打真实 Provider 的用例覆盖，不在确定性回放范围内。
 */
const NOTE_DRAFT_SEMANTIC_ROUTE_CASES = Object.freeze(
  [
    ['merge-two-resources', '把这两个资源合并成一条笔记'],
    ['consolidate-materials', '把这些材料汇总进同一份记录'],
    ['organize-into-document', '综合上面的内容，整理成一篇文档'],
    ['combine-english', 'Combine these sources into one note'],
  ].map(([suffix, message]) => ({
    id: `note-draft-open-phrasing-${suffix}`,
    request: {
      message,
      stream: false,
      contexts: [],
      attachmentIds: [],
      selectedTools: ['create_note'],
    },
    providerSteps: [
      { task: { producesNote: true } },
      { draft: { title: '合成合并笔记', content: '这是完全合成的合并结果正文。' } },
    ],
    expected: {
      providerCalls: 2,
      requiredStages: ['note_draft_task', 'note_draft'],
      confirmations: 1,
      responseExcludes: ['已创建成功', '(ID:', '（ID:'],
    },
  })),
);

export const AGENT_REPLAY_CASES = Object.freeze([
  ...NOTE_DRAFT_SEMANTIC_ROUTE_CASES,
  {
    id: 'provider-missing-note-draft-protocol-then-repair',
    request: {
      message: '请创建一篇笔记，标题为合成网页摘要，正文为测试内容',
      stream: false,
      contexts: [],
      attachmentIds: [],
      selectedTools: ['create_note'],
    },
    providerSteps: [
      { task: { producesNote: true } },
      { content: '漏掉结构化草稿协议' },
      { draft: { title: '合成网页摘要', content: '这是完全合成的测试正文。' } },
    ],
    expected: {
      providerCalls: 3,
      requiredStages: ['note_draft_task', 'note_draft', 'note_draft_repair'],
      confirmations: 1,
      responseExcludes: ['已创建成功', '(ID:', '（ID:'],
    },
  },
  {
    id: 'provider-incomplete-note-draft-then-repair',
    request: {
      message: '请创建一篇笔记，标题为合成网页摘要，正文为测试内容',
      stream: false,
      contexts: [],
      attachmentIds: [],
      selectedTools: ['create_note'],
    },
    providerSteps: [
      { task: { producesNote: true } },
      { draft: { title: '只有标题' } },
      { draft: { title: '合成网页摘要', content: '这是修复后的完整合成测试正文。' } },
    ],
    expected: {
      providerCalls: 3,
      requiredStages: ['note_draft_task', 'note_draft', 'note_draft_repair'],
      confirmations: 1,
      responseExcludes: ['当前账号或访问模式不能使用', '已创建成功', '(ID:', '（ID:'],
    },
  },
  {
    id: 'note-draft-minimum-length-fails-closed-after-one-repair',
    request: {
      message: '请创建一篇至少 2000 字的笔记，主题是合成回归测试',
      stream: false,
      contexts: [],
      attachmentIds: [],
      selectedTools: ['create_note'],
    },
    providerSteps: [
      { task: { producesNote: true } },
      { draft: { title: '第一次短稿', content: '合成短稿。'.repeat(100) } },
      { draft: { title: '第二次短稿', content: '合成短稿仍不足。'.repeat(120) } },
    ],
    expected: {
      providerCalls: 3,
      requiredStages: ['note_draft_task', 'note_draft', 'note_draft_repair'],
      confirmations: 0,
      responseIncludes: ['没有生成完整可确认的笔记草稿'],
      turnContractTrace: {
        lengthMode: 'minimum',
        requiredMinChars: 2000,
        validationIssues: ['length_below_minimum'],
      },
    },
  },
  {
    id: 'explicit-url-read-with-web-disabled',
    request: {
      message: 'https://example.test/spec 这个链接是干嘛的？',
      stream: false,
      contexts: [],
      attachmentIds: [],
      scope: { mode: 'selected', externalWeb: false },
      selectedTools: ['read_url'],
    },
    providerSteps: [
      {
        plan: {
          requestClass: 'data_query',
          intents: [
            {
              kind: 'read',
              capabilityId: 'read.read_url',
              goal: '读取用户明确提供的网页',
              targetDescription: 'https://example.test/spec',
              dependsOn: [],
            },
          ],
          toolCalls: [{ toolName: 'read_url', arguments: { url: 'https://example.test/spec' } }],
        },
      },
      { content: '这是合成网页摘要。' },
    ],
    expected: {
      providerCalls: 2,
      requiredStages: ['planner', 'final'],
      requiredExecutedTools: ['read_url'],
      confirmations: 0,
      responseIncludes: ['合成网页摘要'],
    },
  },
]);
