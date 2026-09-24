import { describe, expect, it, vi, beforeEach } from 'vitest';
import { effectScope } from 'vue';
const execute = vi.hoisted(() => vi.fn());
vi.mock('@/api/aiSkillApi', () => ({
  createAiSkillRequest: (v: unknown) => v,
  executeAiSkill: execute,
  getAiSkillPublicErrorMessage: () => '',
}));
import { useDocumentSummary } from './useDocumentSummary';
const response = (content: string) => ({
  receipt: { toolboxJobId: 'job', toolboxArtifactId: 'artifact' },
  status: 'completed',
  result: { kind: 'grounded_markdown', content },
});
const setup = () => {
  const scope = effectScope();
  return { scope, summary: scope.run(() => useDocumentSummary((k) => k))! };
};
beforeEach(() => {
  execute.mockReset();
});
describe('document summaries', () => {
  it('retains results by file identity, and reading does not execute AI', async () => {
    execute.mockResolvedValueOnce(response('A')).mockResolvedValueOnce(response('B'));
    const { summary, scope } = setup();
    const a = new File(['A'], 'same.pdf'),
      b = new File(['B'], 'same.pdf');
    await summary.generate(a, 'A');
    await summary.generate(b, 'B');
    expect(summary.state(a)).toMatchObject({ content: 'A', jobId: 'job', artifactId: 'artifact' });
    expect(summary.state(b).content).toBe('B');
    expect(execute).toHaveBeenCalledTimes(2);
    scope.stop();
  });
  it('deduplicates running clicks and ignores late responses after reset', async () => {
    let resolve!: (v: unknown) => void;
    execute.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const { summary, scope } = setup();
    const file = new File(['A'], 'a.pdf');
    const run = summary.generate(file, 'A');
    await summary.generate(file, 'A');
    expect(execute).toHaveBeenCalledTimes(1);
    const signal = execute.mock.calls[0][1].signal;
    summary.reset();
    expect(signal.aborted).toBe(true);
    resolve(response('stale'));
    await run;
    expect(summary.state(file).content).toBe('');
    scope.stop();
  });
  it('preserves the delivered result if regeneration fails, and rejects oversized input locally', async () => {
    execute.mockResolvedValueOnce(response('good')).mockRejectedValueOnce(new Error('failed'));
    const { summary, scope } = setup();
    const file = new File(['A'], 'a.pdf');
    await summary.generate(file, 'A');
    await summary.generate(file, 'A');
    expect(summary.state(file)).toMatchObject({
      content: 'good',
      loading: false,
      error: 'toolbox.documentSummary.failed',
    });
    await summary.generate(file, 'a'.repeat(100001));
    expect(execute).toHaveBeenCalledTimes(2);
    scope.stop();
  });
});
