import { describe, it, expect, vi } from 'vitest';
vi.mock('../../db/index.js', () => ({ default: {} }));
import { persistDocumentSummary } from './documentSummary.js';
import crypto from 'node:crypto';
const input = { title: 'demo.pdf', text: 'private original extraction' };
const digest = crypto
  .createHash('sha256')
  .update(JSON.stringify([input.title, input.text]))
  .digest('hex');
function setup(existing = null, fail = false, ownerActive = true) {
  const connection = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    query: vi.fn(async (sql) => {
      if (sql.includes('FROM user')) return [ownerActive ? [{ id: 'owner' }] : []];
      if (sql.startsWith('SELECT id')) return [[{ id: 'job', input_digest: digest, artifact_id: existing }]];
      if (sql.startsWith('SELECT content')) return [[{ content: 'saved summary' }]];
      if (sql.includes('INSERT INTO toolbox_artifacts') && fail) throw new Error('database unavailable');
      return [{}];
    }),
  };
  return { connection, database: { getConnection: async () => connection } };
}
const response = () => ({
  status: 'completed',
  result: { kind: 'grounded_markdown', content: 'summary' },
  coverage: { complete: true },
});
describe('document summary artifacts', () => {
  it('does not recreate artifacts after the owner has been deleted', async () => {
    const { connection, database } = setup(null, false, false);
    await expect(
      persistDocumentSummary({ userId: 'owner', requestId: 'request', input, response: response(), database }),
    ).rejects.toMatchObject({ code: 'AI_SUMMARY_USER_UNAVAILABLE' });
    expect(connection.query.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
    expect(connection.rollback).toHaveBeenCalledOnce();
  });
  it('atomically stores only the summary and metadata, scoped to the owner', async () => {
    const { connection, database } = setup();
    const receipt = await persistDocumentSummary({
      userId: 'owner',
      requestId: 'request',
      input,
      response: response(),
      database,
    });
    expect(receipt.toolboxJobId).toBe('job');
    expect(receipt.toolboxArtifactId).toBeTruthy();
    expect(connection.commit).toHaveBeenCalledOnce();
    const calls = JSON.stringify(connection.query.mock.calls);
    expect(calls).not.toContain(input.text);
    expect(calls).toContain('owner');
    expect(calls).toContain('summary:request');
    expect(calls).toContain('document_summary');
  });
  it('returns the existing artifact for the same request without adding another result', async () => {
    const { connection, database } = setup('existing');
    const value = response();
    expect(
      await persistDocumentSummary({ userId: 'owner', requestId: 'request', input, response: value, database }),
    ).toEqual({ toolboxJobId: 'job', toolboxArtifactId: 'existing', content: 'saved summary' });
    expect(value.result.content).toBe('summary');
    expect(connection.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO toolbox_artifacts'))).toBe(false);
  });
  it('rolls back on a persistence failure so execution cannot return success', async () => {
    const { connection, database } = setup(null, true);
    await expect(
      persistDocumentSummary({ userId: 'owner', requestId: 'request', input, response: response(), database }),
    ).rejects.toThrow('database unavailable');
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.release).toHaveBeenCalledOnce();
  });
  it('rejects reuse with different source input', async () => {
    const { connection, database } = setup('existing');
    await expect(
      persistDocumentSummary({
        userId: 'owner',
        requestId: 'request',
        input: { ...input, text: 'other' },
        response: response(),
        database,
      }),
    ).rejects.toMatchObject({ code: 'AI_SUMMARY_REQUEST_CONFLICT' });
    expect(connection.rollback).toHaveBeenCalledOnce();
  });
});
