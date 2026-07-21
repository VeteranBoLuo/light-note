import { beforeEach, describe, expect, it, vi } from 'vitest';

const recordAiProductEvent = vi.fn();
const resolveAiConversationIdentity = vi.fn();

vi.mock('../util/aiProductTelemetry.js', () => ({ recordAiProductEvent }));
vi.mock('../util/aiConversationService.js', () => ({ resolveAiConversationIdentity }));

const { recordAiEvent } = await import('./aiTelemetryHandle.js');

function response() {
  return {
    statusCode: 200,
    status: vi.fn(function status(code) {
      this.statusCode = code;
      return this;
    }),
    send: vi.fn(),
  };
}

describe('aiTelemetryHandle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveAiConversationIdentity.mockReturnValue({ actorUserId: 'a', subjectUserId: 's' });
  });

  it('records an event under the resolved AI identity', async () => {
    recordAiProductEvent.mockResolvedValue({ id: 'event-id', accepted: true });
    const req = { body: { event: 'ai_entry_opened', dimensions: { surface: 'edge' } } };
    const res = response();
    await recordAiEvent(req, res);
    expect(recordAiProductEvent).toHaveBeenCalledWith({ actorUserId: 'a', subjectUserId: 's' }, req.body);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 200 }));
  });

  it('returns a stable client error without echoing dimensions', async () => {
    const error = new Error('AI_EVENT_UNSUPPORTED: unsupported private payload');
    error.code = 'AI_EVENT_UNSUPPORTED';
    error.status = 400;
    recordAiProductEvent.mockRejectedValue(error);
    const res = response();
    await recordAiEvent({ body: { event: 'bad', dimensions: { query: 'secret' } } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({ status: 400, data: { code: 'AI_EVENT_UNSUPPORTED' } }),
    );
    expect(JSON.stringify(res.send.mock.calls)).not.toContain('secret');
  });
});
