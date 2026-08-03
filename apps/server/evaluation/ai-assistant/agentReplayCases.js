const createNotePlan = {
  requestClass: 'data_action',
  intents: [
    {
      kind: 'write',
      capabilityId: 'note.create',
      goal: '创建合成测试笔记',
      targetDescription: '合成网页摘要',
      dependsOn: [],
    },
  ],
  toolCalls: [
    {
      toolName: 'create_note',
      arguments: { title: '合成网页摘要', content: '这是完全合成的测试正文。' },
    },
  ],
};

export const AGENT_REPLAY_CASES = Object.freeze([
  {
    id: 'provider-missing-plan-then-create-note',
    request: {
      message: '请创建一篇笔记，标题为合成网页摘要，正文为测试内容',
      stream: false,
      contexts: [],
      attachmentIds: [],
      selectedTools: ['create_note'],
    },
    providerSteps: [{ content: '漏掉结构化计划' }, { plan: createNotePlan }],
    expected: {
      providerCalls: 2,
      requiredStages: ['planner', 'planner_semantic_repair_1'],
      confirmations: 1,
      responseExcludes: ['已创建成功', '(ID:', '（ID:'],
    },
  },
  {
    id: 'provider-wrong-capability-then-create-note',
    request: {
      message: '请创建一篇笔记，标题为合成网页摘要，正文为测试内容',
      stream: false,
      contexts: [],
      attachmentIds: [],
      selectedTools: ['create_note'],
    },
    providerSteps: [
      { content: '漏掉结构化计划' },
      {
        plan: {
          requestClass: 'data_action',
          intents: [
            {
              kind: 'write',
              capabilityId: 'todo.status.set',
              goal: '误选不可用能力',
              targetDescription: '合成目标',
              dependsOn: [],
            },
          ],
        },
      },
      { plan: createNotePlan },
    ],
    expected: {
      providerCalls: 3,
      requiredStages: ['planner', 'planner_semantic_repair_1', 'planner_semantic_repair_2'],
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
