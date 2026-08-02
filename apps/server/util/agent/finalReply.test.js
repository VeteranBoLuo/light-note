import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  stream: vi.fn(),
  looksLikeLeakedToolCall: vi.fn(() => false),
}));

vi.mock('./deepseekClient.js', () => ({
  requestDeepSeek: mocks.request,
  requestDeepSeekStream: mocks.stream,
  looksLikeLeakedToolCall: mocks.looksLikeLeakedToolCall,
}));

const { generateFinalReply, inspectFinalReplyProgress, inspectFinalReplyQuality } = await import('./finalReply.js');

const RUNAWAY_CHINESE_SAMPLE = `
前半段仍然可以正常阅读。深圳适合短途城市和海滨体验，四川更适合时间充裕、偏好自然与人文的旅行者。你可以先按假期长度、预算和同行人来选择，三天左右优先深圳，一周以上优先四川。
如果你的核心诉求仍旧是可以换个干并且省内在短三走点悠闲这种顺手就跑深圳基本解决走动不烦劲你不需要多思路就可以马上登飞重庆那连向全需要连特外现做场单独行程预留不用交给思考怎么插出来就行
所以说这道终极判择回头是去十你到底走几个月成都线进去要把八九划给随调人是不是稳答答个跟位喜欢扎空墙老干子江涛灯火街散步关扶拿午华快转当能走路不行只能动手买张两回到场适合你自己轻户车立刻迁着配合十月底该不该往深往下住换不过放心只管要更牢顺着错一条也行问出门不过也就说不必要来拉一张精确的指引没有一句话概况简单得很有底气双短期切坐城区逛逛到耍沙望线排一次游进去那川人就行就极扛双来好不则根本主往大西进呢不然就去生凉建议加偏远的再北冰那选择取深圳秒了跑九站看却死走但按行得开刚下山河两淡闲散跟收山廊压赶并走得来的挑巴决定拉去必还要继续来回兜圈反复拼接没有意义的收尾内容
咋再看你这么从结尾读就有丈拿定的版结。为了让样例达到流式检查的最小观察窗口，这里补充一段正常、有标点的背景说明。正常回答可以包含多段内容，也可以列出景点、预算、交通和季节建议，只要句子完整且不会陷入无意义续写即可。
${Array.from(
  { length: 24 },
  (_, index) => `补充背景第${index + 1}项有完整句号，用于验证长回答本身不会因为总长度而被误判。`,
).join('')}`;

const NORMAL_LONG_CHINESE_SAMPLE = [
  '结论：只有三四天并且偏爱城市海滨，可以优先去深圳；拥有一周以上且重视自然山水，更推荐选择四川。',
  '行程长度方面，深圳的主要景点集中在城市交通网络周边，短假期也能安排得从容，不必频繁更换住宿地点。',
  '四川的目的地跨度明显更大，成都、乐山、九寨沟与川西并不在同一片区域，需要为长途交通预留充足时间。',
  '交通方式方面，深圳地铁覆盖成熟，机场和高铁站衔接方便，不自驾也可以完成大部分常见的观光路线。',
  '如果前往川西高海拔地区，自驾虽然自由，但要提前考虑山路驾驶、天气变化、车辆状态和同行人的适应情况。',
  '自然景观方面，深圳拥有海岸线、红树林和城市公园，优势在于轻松可达，适合把休息与逛街放在同一天。',
  '四川的雪山、峡谷、湖泊和森林更有层次，景观震撼程度通常更高，不过旺季预约和路途成本也随之增加。',
  '人文体验方面，深圳更能体现年轻城市、科技产业与大湾区生活节奏，南头古城等区域适合慢慢散步。',
  '四川的人文内容从古蜀文化延伸到三国遗迹、古镇、寺院与民族地区，不同线路之间的气质差异很明显。',
  '美食偏好也会影响选择：深圳菜系丰富、选择国际化，四川则以火锅、串串、川菜和地方小吃形成鲜明主题。',
  '预算方面，深圳住宿在节假日和核心商圈可能偏高，但市内移动成本可控，行程结构也比较容易临时调整。',
  '四川市区消费相对灵活，真正增加预算的通常是景区门票、跨城交通、包车以及热门区域的旺季住宿。',
  '带儿童或长辈出行时，深圳的平缓路线和稳定配套更省心；去四川则宜优先选择成都周边的低强度组合。',
  '喜欢摄影的人可以把四川放在天气稳定、能见度较好的季节，提前查询景区开放状态，并准备保暖和防晒用品。',
  '如果旅行目标只是换个环境休息，不想每天收拾行李，深圳更容易做成一个固定酒店加周边散步的假期。',
  '如果期待一次记忆鲜明的远途旅行，也愿意为风景承担更长路程，那么四川提供的路线选择会更加丰富。',
  '最终决定前，再核对出发月份、可用天数、预算上限和同行人数，这四项比单纯比较两个地名更有判断价值。',
  '在没有更多条件时，我会把深圳定义为轻松短途方案，把四川定义为内容更丰富但准备要求更高的长途方案。',
].join('\n');

describe('generateFinalReply', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.looksLikeLeakedToolCall.mockReturnValue(false);
  });

  it('把供应商的多个真实增量原样推送给调用方', async () => {
    mocks.stream.mockImplementation(async (_messages, options) => {
      options.onDelta('第一段');
      options.onDelta('第二段');
      return {
        content: '第一段第二段',
        leakedToolCall: false,
        usage: { promptTokens: 10, completionTokens: 4, totalTokens: 14 },
        usageStatus: 'reported',
        finishReason: 'stop',
      };
    });
    const chunks = [];

    const result = await generateFinalReply({
      messages: [{ role: 'user', content: '测试' }],
      stream: true,
      onDelta: (chunk) => chunks.push(chunk),
    });

    expect(chunks).toEqual(['第一段', '第二段']);
    expect(result).toEqual(
      expect.objectContaining({
        content: '第一段第二段',
        apiCalls: 1,
        finishReason: 'stop',
        usageStatus: 'reported',
        usage: { promptTokens: 10, completionTokens: 4, totalTokens: 14 },
      }),
    );
  });

  it('流中泄漏工具协议时用禁用工具的请求恢复回答并累计用量', async () => {
    mocks.stream.mockImplementation(async (_messages, options) => {
      options.onDelta('临时前缀');
      return {
        content: '临时前缀',
        leakedToolCall: true,
        usage: { promptTokens: 8, completionTokens: 2, totalTokens: 10 },
        usageStatus: 'reported',
        finishReason: 'stop',
      };
    });
    mocks.request.mockResolvedValue({
      content: '恢复后的回答',
      usage: { promptTokens: 9, completionTokens: 3, totalTokens: 12 },
      usageStatus: 'reported',
      finishReason: 'stop',
    });
    const chunks = [];

    const result = await generateFinalReply({
      messages: [{ role: 'user', content: '测试' }],
      stream: true,
      onDelta: (chunk) => chunks.push(chunk),
    });

    expect(mocks.request).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ content: expect.stringContaining('禁止输出') })]),
      expect.objectContaining({ toolChoice: 'none' }),
    );
    expect(chunks).toEqual(['临时前缀']);
    expect(result).toEqual(
      expect.objectContaining({
        content: '恢复后的回答',
        apiCalls: 2,
        usage: { promptTokens: 17, completionTokens: 5, totalTokens: 22 },
      }),
    );
  });

  it('非流式请求也经过独立最终回答并过滤协议泄漏', async () => {
    mocks.request
      .mockResolvedValueOnce({
        content: '<tool_calls>bad</tool_calls>',
        usage: { promptTokens: 5, completionTokens: 1, totalTokens: 6 },
        usageStatus: 'reported',
        finishReason: 'stop',
      })
      .mockResolvedValueOnce({
        content: '恢复后的回答',
        usage: { promptTokens: 4, completionTokens: 2, totalTokens: 6 },
        usageStatus: 'reported',
        finishReason: 'stop',
      });
    mocks.looksLikeLeakedToolCall.mockReturnValue(true);

    const result = await generateFinalReply({ messages: [], stream: false });

    expect(result.content).toBe('抱歉，本次回答生成异常，请重新生成。');
    expect(result.apiCalls).toBe(2);
    expect(result.qualityRetried).toBe(true);
  });

  it('输出被模型上限截断时自动以低温短回答重试', async () => {
    mocks.request
      .mockResolvedValueOnce({
        content: '重复说明'.repeat(500),
        usage: { promptTokens: 5, completionTokens: 900, totalTokens: 905 },
        usageStatus: 'reported',
        finishReason: 'length',
      })
      .mockResolvedValueOnce({
        content: '没有找到符合条件的待办。',
        usage: { promptTokens: 8, completionTokens: 8, totalTokens: 16 },
        usageStatus: 'reported',
        finishReason: 'stop',
      });

    const result = await generateFinalReply({ messages: [{ role: 'user', content: '第一条待办' }], stream: false });

    expect(result).toMatchObject({
      content: '没有找到符合条件的待办。',
      apiCalls: 2,
      qualityRetried: true,
      qualityIssues: expect.arrayContaining(['truncated']),
    });
    expect(mocks.request.mock.calls[1][1]).toMatchObject({
      toolChoice: 'none',
      maxTokens: 900,
      temperature: 0.2,
    });
  });

  it('识别内部结束标记和长段重复退化', () => {
    expect(inspectFinalReplyQuality(`回答${'反复解释'.repeat(250)}\\end(END)`, 'stop')).toMatchObject({
      valid: false,
      issues: expect.arrayContaining(['internal_end_marker', 'unbroken_runaway']),
    });
  });

  it('识别线上样例中的长中文无断句语义退化，但不误伤代码块', () => {
    expect(inspectFinalReplyProgress(RUNAWAY_CHINESE_SAMPLE)).toMatchObject({
      valid: false,
      issues: expect.arrayContaining(['unbroken_runaway']),
    });

    const longCode = `下面是完整示例：\n\n\`\`\`text\n${'constValueWithoutSentencePunctuation'.repeat(40)}\n\`\`\``;
    expect(inspectFinalReplyProgress(longCode)).toEqual({ valid: true, issues: [] });
    expect(NORMAL_LONG_CHINESE_SAMPLE.length).toBeGreaterThan(800);
    expect(inspectFinalReplyProgress(NORMAL_LONG_CHINESE_SAMPLE)).toEqual({ valid: true, issues: [] });
  });

  it('流式回答退化时在异常增量公开前熔断，并用低温短回答恢复', async () => {
    const firstChunk = RUNAWAY_CHINESE_SAMPLE.slice(0, 620);
    const runawayChunk = RUNAWAY_CHINESE_SAMPLE.slice(620);
    mocks.stream.mockImplementation(async (_messages, options) => {
      let content = '';
      for (const delta of [firstChunk, runawayChunk]) {
        const candidate = `${content}${delta}`;
        const stopReason = options.shouldStop?.({ content: candidate, delta });
        if (stopReason) {
          return {
            content,
            leakedToolCall: false,
            consumerStopped: true,
            consumerStopReason: stopReason,
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            usageStatus: 'missing',
            finishReason: 'consumer_stop',
          };
        }
        content = candidate;
        options.onDelta(delta);
      }
      throw new Error('测试样例应触发流式质量熔断');
    });
    mocks.request.mockResolvedValue({
      content: '短途城市体验选深圳；时间充裕、偏爱自然人文选四川。',
      usage: { promptTokens: 20, completionTokens: 18, totalTokens: 38 },
      usageStatus: 'reported',
      finishReason: 'stop',
    });
    const chunks = [];

    const result = await generateFinalReply({
      messages: [{ role: 'user', content: '你觉得深圳和四川哪个适合旅游？' }],
      stream: true,
      onDelta: (chunk) => chunks.push(chunk),
    });

    expect(chunks).toEqual([firstChunk]);
    expect(result).toMatchObject({
      content: '短途城市体验选深圳；时间充裕、偏爱自然人文选四川。',
      apiCalls: 2,
      qualityRetried: true,
      qualityIssues: expect.arrayContaining(['unbroken_runaway']),
      usageStatus: 'missing',
    });
    expect(mocks.request).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ content: expect.stringContaining('重复或格式异常') })]),
      expect.objectContaining({ toolChoice: 'none', maxTokens: 900, temperature: 0.2 }),
    );
  });
});
