import { effectScope, reactive, ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useToolboxPinnedTools } from './useToolboxPinnedTools';
import { toggleToolboxPinnedTool } from '@/utils/toolboxPinnedTools';
import { fetchToolboxPinnedTools, saveToolboxPinnedTools } from '@/api/toolbox';
vi.mock('@/api/toolbox', () => ({ fetchToolboxPinnedTools: vi.fn(), saveToolboxPinnedTools: vi.fn() }));
function setup(role = 'user') {
  const scope = effectScope();
  const user = reactive({ id: 'owner', role });
  const error = vi.fn();
  const pins = scope.run(() => useToolboxPinnedTools(user, ref(new Set(['pdf', 'image'])), error))!;
  return { ...pins, user, error, stop: () => scope.stop() };
}
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
});
describe('account/local pinned tools', () => {
  it('migrates only the current account legacy pins on first use', async () => {
    toggleToolboxPinnedTool({ id: 'owner', role: 'user' }, 'pdf');
    toggleToolboxPinnedTool({ id: 'other', role: 'user' }, 'image');
    vi.mocked(fetchToolboxPinnedTools).mockResolvedValue({ initialized: false, toolIds: [] });
    vi.mocked(saveToolboxPinnedTools).mockResolvedValue({ initialized: true, toolIds: ['pdf'] });
    const pins = setup();
    await pins.refresh();
    expect(saveToolboxPinnedTools).toHaveBeenCalledWith({ action: 'migrate', toolIds: ['pdf'] });
    expect(pins.toolIds.value).toEqual(['pdf']);
    pins.stop();
  });
  it('honors an explicitly cleared account and keeps the state on write failure', async () => {
    toggleToolboxPinnedTool({ id: 'owner', role: 'user' }, 'pdf');
    vi.mocked(fetchToolboxPinnedTools).mockResolvedValue({ initialized: true, toolIds: [] });
    const pins = setup();
    await pins.refresh();
    expect(saveToolboxPinnedTools).not.toHaveBeenCalled();
    vi.mocked(saveToolboxPinnedTools).mockRejectedValue(new Error('offline'));
    await pins.toggle('image');
    expect(pins.toolIds.value).toEqual([]);
    expect(pins.error).toHaveBeenCalledWith('save');
    expect(pins.savingToolId.value).toBe('');
    pins.stop();
  });
  it('keeps visitors local without account requests', async () => {
    const pins = setup('visitor');
    await pins.refresh();
    await pins.toggle('pdf');
    await pins.refresh();
    expect(pins.toolIds.value).toEqual(['pdf']);
    expect(fetchToolboxPinnedTools).not.toHaveBeenCalled();
    expect(saveToolboxPinnedTools).not.toHaveBeenCalled();
    pins.stop();
  });
  it('ignores an old identity response and does not migrate it into the new account', async () => {
    let resolve!: (value: { initialized: boolean; toolIds: string[] }) => void;
    vi.mocked(fetchToolboxPinnedTools).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const pins = setup();
    const pending = pins.refresh();
    pins.user.id = 'other';
    resolve({ initialized: false, toolIds: [] });
    await pending;
    expect(pins.toolIds.value).toEqual([]);
    expect(saveToolboxPinnedTools).not.toHaveBeenCalled();
    pins.stop();
  });
  it('keeps a pending save authoritative when the catalog asks for a refresh', async () => {
    vi.mocked(fetchToolboxPinnedTools).mockResolvedValue({ initialized: true, toolIds: [] });
    let resolve!: (value: { initialized: boolean; toolIds: string[] }) => void;
    vi.mocked(saveToolboxPinnedTools).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const pins = setup();
    await pins.refresh();
    const pending = pins.toggle('pdf');
    await pins.refresh();
    expect(fetchToolboxPinnedTools).toHaveBeenCalledOnce();
    expect(pins.savingToolId.value).toBe('pdf');
    resolve({ initialized: true, toolIds: ['pdf'] });
    await pending;
    expect(pins.toolIds.value).toEqual(['pdf']);
    expect(pins.savingToolId.value).toBe('');
    pins.stop();
  });
  it('ignores a pending save response after switching identity', async () => {
    vi.mocked(fetchToolboxPinnedTools).mockResolvedValue({ initialized: true, toolIds: [] });
    let resolve!: (value: { initialized: boolean; toolIds: string[] }) => void;
    vi.mocked(saveToolboxPinnedTools).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const pins = setup();
    await pins.refresh();
    const pending = pins.toggle('pdf');
    pins.user.id = 'other';
    resolve({ initialized: true, toolIds: ['pdf'] });
    await pending;
    expect(pins.toolIds.value).toEqual([]);
    expect(pins.savingToolId.value).toBe('');
    pins.stop();
  });
  it('retries a failed migration and blocks writes until account state is known', async () => {
    vi.mocked(fetchToolboxPinnedTools).mockResolvedValue({ initialized: false, toolIds: [] });
    vi.mocked(saveToolboxPinnedTools)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ initialized: true, toolIds: [] });
    const pins = setup();
    await pins.refresh();
    expect(pins.error).toHaveBeenCalledWith('load');
    await pins.toggle('pdf');
    expect(saveToolboxPinnedTools).toHaveBeenLastCalledWith({ action: 'migrate', toolIds: [] });
    await pins.toggle('pdf');
    expect(saveToolboxPinnedTools).toHaveBeenLastCalledWith({ toolId: 'pdf', pinned: true });
    pins.stop();
  });
});
