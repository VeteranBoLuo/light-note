import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../util/aiSkill/runtime.js', () => ({ executeAiSkill: vi.fn() }));
vi.mock('../util/aiSkill/model.js', () => ({ callGroundedSkillModelStream: vi.fn() }));

const { executeAiSkill } = await import('../util/aiSkill/runtime.js');
const { callGroundedSkillModelStream } = await import('../util/aiSkill/model.js');
const { executeAiSkillStreamRequest } = await import('./aiSkillHandle.js');

function createRequest(skillId = 'note.transform_text') {
  const request = new EventEmitter();
  request.body = {
    requestId: '123e4567-e89b-42d3-a456-426614174000',
    skillId,
  };
  request.aborted = false;
  return request;
}

function createResponse() {
  const response = new EventEmitter();
  response.statusCode = 200;
  response.headers = {};
  response.frames = [];
  response.writableEnded = false;
  response.destroyed = false;
  response.status = vi.fn((status) => {
    response.statusCode = status;
    return response;
  });
  response.set = vi.fn((headers) => {
    Object.assign(response.headers, headers);
    return response;
  });
  response.send = vi.fn((payload) => {
    response.body = payload;
    response.writableEnded = true;
    return response;
  });
  response.flushHeaders = vi.fn();
  response.write = vi.fn((frame) => {
    response.frames.push(frame);
    return true;
  });
  response.end = vi.fn(() => {
    response.writableEnded = true;
  });
  return response;
}

function eventNames(frames) {
  return frames.map((frame) => frame.match(/^event: ([^\n]+)/u)?.[1]);
}

describe('executeAiSkillStreamRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('只为纯文本变换建立 SSE，并按 start/delta/reset/complete 顺序透传', async () => {
    const request = createRequest();
    const response = createResponse();
    const completed = {
      protocolVersion: 1,
      requestId: request.body.requestId,
      skillId: request.body.skillId,
      skillVersion: 1,
      status: 'completed',
      result: { kind: 'text', content: '最终正文' },
      sources: [],
      availableActions: [],
    };
    callGroundedSkillModelStream.mockImplementation(async (options) => {
      options.onDelta('首段');
      options.onReset();
      options.onDelta('修复段');
      return { content: '最终正文' };
    });
    executeAiSkill.mockImplementation(async (_raw, _req, dependencies) => {
      await dependencies.callModel({ messages: [] });
      return completed;
    });

    await executeAiSkillStreamRequest(request, response);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.headers).toMatchObject({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'X-Accel-Buffering': 'no',
    });
    expect(eventNames(response.frames)).toEqual(['start', 'delta', 'reset', 'delta', 'complete']);
    expect(response.frames.at(-1)).toContain('最终正文');
    expect(response.end).toHaveBeenCalledOnce();
  });

  it('拒绝把结构化或写入预览 Skill 伪装成通用流式接口', async () => {
    const request = createRequest('note.create_from_sources');
    const response = createResponse();

    await executeAiSkillStreamRequest(request, response);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.send).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400, data: { code: 'AI_SKILL_STREAM_UNSUPPORTED' } }),
    );
    expect(executeAiSkill).not.toHaveBeenCalled();
  });
});
