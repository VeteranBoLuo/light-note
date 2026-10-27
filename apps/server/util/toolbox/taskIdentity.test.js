import { describe, expect, it, vi } from 'vitest';
const metadata = vi.hoisted(() => vi.fn());
vi.mock('../personalKnowledgeSearch.js', () => ({ resolvePersonalKnowledgeResourceMetadata: metadata }));
import { taskIdentity, hydrateTaskIdentities, readTaskInputs } from './taskIdentity.js';

describe('task identity without a successful artifact', () => {
  it('keeps authoritative names and an explicit goal independently of results', () => {
    expect(
      taskIdentity({ options_json: { taskMaterials: [{ title: '阅读摘记' }], question: '解释观点' } }),
    ).toMatchObject({ title: '阅读摘记', materialCount: 1 });
    expect(taskIdentity({ options_json: { question: '比较两份材料的判断依据' } }).title).toBe('比较两份材料的判断依据');
    expect(taskIdentity({ options_json: '{bad json' })).toMatchObject({ title: '', materialCount: 0 });
    expect(taskIdentity({ options_json: { homeDismissed: true } }).dismissed).toBe(true);
  });
  it('resolves legacy materials in an owner-scoped batch and marks missing input explicitly', async () => {
    metadata.mockResolvedValue([{ type: 'note', id: 'owned-note', title: '当前标题', version: 'v2' }]);
    const database = {
      query: vi.fn().mockResolvedValueOnce([
        [
          { job_id: 'old', input_type: 'resource', resource_type: 'note', resource_id: 'owned-note' },
          { job_id: 'old', input_type: 'resource', resource_type: 'file', resource_id: 'missing' },
        ],
      ]),
    };
    const [row] = await hydrateTaskIdentities(database, 'owner', [{ id: 'old', options_json: '{}' }]);
    expect(taskIdentity(row)).toMatchObject({ title: '当前标题', materialCount: 2 });
    expect(row.options_json.taskMaterials[1]).toMatchObject({ id: 'missing', title: '', available: false });
    expect(database.query.mock.calls[0][1]).toEqual(['owner', 'old']);
    expect(metadata).toHaveBeenCalledWith(expect.objectContaining({ userId: 'owner' }));
  });
  it('never treats an expired temporary upload as a recoverable input', async () => {
    const database = {
      query: vi
        .fn()
        .mockResolvedValueOnce([[{ job_id: 'job', input_type: 'document_source', document_source_id: 'upload' }]])
        .mockResolvedValueOnce([[{ id: 'upload', file_name: '材料.pdf', expires_at: '2000-01-01' }]]),
    };
    expect(await readTaskInputs(database, 'owner', ['job'])).toMatchObject([
      { type: 'document_source', title: '材料.pdf', available: false },
    ]);
    expect(database.query.mock.calls[1][1]).toEqual(['owner', 'upload']);
  });
});
