import { describe, expect, it } from 'vitest';
import { consumeAiSseChunk, flushAiSseBuffer, parseAiSseDataLine } from './aiSse';

describe('AI SSE v2 parser', () => {
  it('保持 start/tool/delta/heartbeat/usage/done 的到达顺序与完成原因', () => {
    const payload = [
      { event: 'start', requestId: 'r1' },
      { event: 'tool_start', tool: 'query_notes' },
      { event: 'tool_result', tool: 'query_notes', status: 'success' },
      { event: 'delta', output: { text: '答案' } },
      { event: 'heartbeat', elapsedMs: 12000, phase: 'waiting_first_token' },
      { event: 'done', usage: { totalTokens: 12 }, finishReason: 'length' },
    ].map((item) => `data: ${JSON.stringify(item)}\n\n`).join('');
    const result = consumeAiSseChunk('', payload);
    expect(result.events.map((item) => item.event)).toEqual([
      'start', 'tool_start', 'tool_result', 'delta', 'heartbeat', 'done',
    ]);
    expect(result.events.at(-1)).toMatchObject({ finishReason: 'length' });
  });

  it('保留回答完成后的动态追问可用标记与请求标识', () => {
    const result = consumeAiSseChunk(
      '',
      'data: {"event":"done","requestId":"r-follow-up","followUpAvailable":true}\n\n',
    );
    expect(result.events[0]).toMatchObject({
      event: 'done',
      requestId: 'r-follow-up',
      followUpAvailable: true,
    });
  });

  it('跨网络分片保留半行并在下一块完成解析', () => {
    const first = consumeAiSseChunk('', 'data: {"event":"delta","output":{"text":"你');
    expect(first.events).toEqual([]);
    const second = consumeAiSseChunk(first.buffer, '好"}}\n\n');
    expect(second.events[0]).toMatchObject({ event: 'delta', output: { text: '你好' } });
  });

  it('忽略坏 JSON、注释行和传输结束标志', () => {
    expect(parseAiSseDataLine('data: {broken')).toBeNull();
    expect(parseAiSseDataLine(': heartbeat')).toBeNull();
    expect(flushAiSseBuffer('data: [DONE]')).toEqual([]);
  });
});
