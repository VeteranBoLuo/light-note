import { beforeEach, describe, expect, it, vi } from 'vitest';
const record = vi.hoisted(() => vi.fn());
vi.mock('@/api/aiTelemetry', () => ({ recordAiSkillApplied: record }));
import { createBookmarkAiAdoption } from './bookmarkAiAdoption';
beforeEach(() => record.mockReset());
describe('bookmark AI adoption', () => {
  it('records draft separately and only records saved when generated values survive the submitted snapshot', () => {
    const tracker = createBookmarkAiAdoption('bookmark.form');
    const data = { name: 'Generated', description: '', relatedTags: ['generated-tag'] };
    tracker.filled('request-1', data, ['name'], ['generated-tag']);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'request-1', adoptionKind: 'draft' }));
    record.mockClear();
    tracker.saved({ name: 'User rewrite', description: '', relatedTags: [] });
    expect(record).not.toHaveBeenCalled();
    tracker.filled('request-2', data, ['name'], ['generated-tag']);
    record.mockClear();
    tracker.saved({ ...data });
    tracker.saved({ ...data });
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ requestId: 'request-2', adoptionKind: 'saved' }));
    expect(JSON.stringify(record.mock.calls)).not.toContain('Generated');
    expect(JSON.stringify(record.mock.calls)).not.toContain('generated-tag');
  });
  it('does not turn unchanged output, missing execution IDs or a changed target into adoption', () => {
    const tracker = createBookmarkAiAdoption('bookmark.form');
    tracker.filled('request-1', { name: 'Old' }, [], []);
    tracker.filled('', { name: 'Old' }, ['name'], []);
    expect(record).not.toHaveBeenCalled();
    tracker.filled('request-1', { name: 'Old' }, ['name'], []);
    tracker.reset();
    record.mockClear();
    tracker.saved({ name: 'Old' });
    expect(record).not.toHaveBeenCalled();
  });
});
