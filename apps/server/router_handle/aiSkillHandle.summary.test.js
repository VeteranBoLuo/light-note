import { beforeEach, it, expect, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), persist: vi.fn(), guard: vi.fn(() => true) }));
vi.mock('../util/auth.js', () => ({ ensureNotVisitor: mocks.guard }));
vi.mock('../util/toolbox/documentSummary.js', () => ({ persistDocumentSummary: mocks.persist }));
vi.mock('../util/aiSkill/runtime.js', () => ({ executeAiSkill: mocks.execute }));
vi.mock('../util/aiProductTelemetry.js', () => ({ recordAiProductEvent: vi.fn() }));
vi.mock('../util/requestAbort.js', () => ({
  createRequestAbortContext: () => ({ signal: new AbortController().signal, complete: vi.fn() }),
}));
import { executeAiSkillRequest } from './aiSkillHandle.js';
function res() {
  return { send: vi.fn(), status: vi.fn().mockReturnThis() };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.guard.mockReturnValue(true);
});
it('persists validated summaries using the resolved owner before returning success', async () => {
  const output = Object.freeze({
    status: 'completed',
    result: Object.freeze({ kind: 'grounded_markdown', content: 'new' }),
    receipt: {},
  });
  mocks.persist.mockResolvedValue({ toolboxJobId: 'job', toolboxArtifactId: 'artifact', content: 'stored' });
  mocks.execute.mockImplementation(async (_body, _req, deps) => {
    await deps.commitValidatedResult({
      response: output,
      input: { title: 'a', text: 'b' },
      request: { requestId: 'id' },
      context: { identity: { subjectUserId: 'owner' } },
    });
    return output;
  });
  const response = res();
  await executeAiSkillRequest({ body: { skillId: 'toolbox.summarize_text' } }, response);
  expect(mocks.persist).toHaveBeenCalledWith(expect.objectContaining({ userId: 'owner', requestId: 'id' }));
  expect(response.send).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        result: { kind: 'grounded_markdown', content: 'stored' },
        receipt: { toolboxJobId: 'job', toolboxArtifactId: 'artifact', writeCommitted: true },
      }),
    }),
  );
});
it('does not call a model or persist when the write guard rejects readonly access', async () => {
  mocks.guard.mockReturnValue(false);
  await executeAiSkillRequest({ body: { skillId: 'toolbox.summarize_text' } }, res());
  expect(mocks.execute).not.toHaveBeenCalled();
  expect(mocks.persist).not.toHaveBeenCalled();
});
it('does not add persistence to other skills', async () => {
  mocks.execute.mockResolvedValue({ status: 'completed' });
  await executeAiSkillRequest({ body: { skillId: 'help.answer' } }, res());
  expect(mocks.execute.mock.calls[0][2].commitValidatedResult).toBeUndefined();
  expect(mocks.guard).not.toHaveBeenCalled();
});
