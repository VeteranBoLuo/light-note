export const AGENT_REPLAY_CASES = Object.freeze([
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
      { content: '漏掉结构化草稿协议' },
      { draft: { title: '合成网页摘要', content: '这是完全合成的测试正文。' } },
    ],
    expected: {
      providerCalls: 2,
      requiredStages: ['note_draft', 'note_draft_repair'],
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
      { draft: { title: '只有标题' } },
      { draft: { title: '合成网页摘要', content: '这是修复后的完整合成测试正文。' } },
    ],
    expected: {
      providerCalls: 2,
      requiredStages: ['note_draft', 'note_draft_repair'],
      confirmations: 1,
      responseExcludes: ['当前账号或访问模式不能使用', '已创建成功', '(ID:', '（ID:'],
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
