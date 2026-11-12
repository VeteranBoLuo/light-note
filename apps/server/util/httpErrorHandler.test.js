import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./common.js', () => ({ L: (req, zh) => zh }));

const { httpErrorHandler } = await import('./httpErrorHandler.js');

function createRes({ headersSent = false } = {}) {
  const res = { headersSent };
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

afterEach(() => vi.restoreAllMocks());

describe('httpErrorHandler', () => {
  it('Body 解析失败与超限返回 400/413 JSON，不带堆栈和原文', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const parseError = Object.assign(new SyntaxError('Unexpected token } in JSON at /www/secret.js'), {
      status: 400,
      type: 'entity.parse.failed',
    });
    const res = createRes();
    httpErrorHandler(parseError, { requestId: 'req-12345678' }, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ status: 400, msg: '请求格式或参数不正确', data: null });
    expect(JSON.stringify(res.json.mock.calls)).not.toMatch(/secret|Unexpected|at /);
    expect(log.mock.calls[0].slice(1)).toEqual([400, 'entity.parse.failed', 'req-12345678', '-']);

    const tooLarge = createRes();
    httpErrorHandler({ status: 413, type: 'entity.too.large' }, {}, tooLarge, vi.fn());
    expect(tooLarge.json).toHaveBeenCalledWith({ status: 413, msg: '提交内容过大', data: null });
  });

  it('未声明状态的异常按 500 处理，日志只记类名和第一帧位置', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new TypeError("Cannot read properties of undefined (reading 'token-abc')");
    const res = createRes();
    httpErrorHandler(error, {}, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ status: 500, msg: '', data: null });
    const [, status, code, requestId, where] = log.mock.calls[0];
    expect([status, code, requestId]).toEqual([500, 'TypeError', '-']);
    expect(where).toMatch(/^at .*httpErrorHandler\.test\.js/);
    expect(log.mock.calls[0].join(' ')).not.toContain('token-abc');
  });

  it('非法状态码回落到 500，响应已开始写出时交回 Express', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = createRes();
    httpErrorHandler({ status: 302, code: 'bad code!' }, {}, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(500);

    const streaming = createRes({ headersSent: true });
    const next = vi.fn();
    const error = new Error('stream broken');
    httpErrorHandler(error, {}, streaming, next);
    expect(next).toHaveBeenCalledWith(error);
    expect(streaming.status).not.toHaveBeenCalled();
  });
});
