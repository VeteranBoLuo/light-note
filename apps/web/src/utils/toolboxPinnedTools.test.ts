import { describe, expect, it } from 'vitest';
import { readToolboxPinnedTools, toggleToolboxPinnedTool, TOOLBOX_PINNED_TOOL_LIMIT } from './toolboxPinnedTools';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) || null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe('toolbox pinned tools', () => {
  it('keeps pinned tools isolated by identity and toggles them deterministically', () => {
    const storage = memoryStorage();
    const owner = { id: 'owner', role: 'user' };
    const other = { id: 'other', role: 'user' };
    expect(toggleToolboxPinnedTool(owner, 'text_diff', { storage }).toolIds).toEqual(['text_diff']);
    expect(readToolboxPinnedTools(other, { storage })).toEqual([]);
    expect(toggleToolboxPinnedTool(owner, 'text_diff', { storage }).toolIds).toEqual([]);
  });

  it('同一账号的普通身份、访客工作区和代管身份分别存储', () => {
    const storage = memoryStorage();
    const owner = { id: 'owner', role: 'user' };
    const visitorWorkspace = { id: 'owner', role: 'user', visitorWorkspace: true };
    const managedOwner = {
      id: 'admin',
      role: 'root',
      adminContext: { subjectUserId: 'owner', mode: 'readonly' },
    };

    expect(toggleToolboxPinnedTool(owner, 'text_diff', { storage }).toolIds).toEqual(['text_diff']);
    expect(readToolboxPinnedTools(visitorWorkspace, { storage })).toEqual([]);
    expect(readToolboxPinnedTools(managedOwner, { storage })).toEqual([]);
  });

  it('filters unavailable ids and enforces the six-tool limit', () => {
    const storage = memoryStorage();
    const owner = { id: 'owner', role: 'user' };
    const allowed = new Set(Array.from({ length: TOOLBOX_PINNED_TOOL_LIMIT + 1 }, (_, index) => `tool-${index}`));
    for (let index = 0; index < TOOLBOX_PINNED_TOOL_LIMIT; index += 1) {
      toggleToolboxPinnedTool(owner, `tool-${index}`, { storage, allowedToolIds: allowed });
    }
    expect(
      toggleToolboxPinnedTool(owner, `tool-${TOOLBOX_PINNED_TOOL_LIMIT}`, { storage, allowedToolIds: allowed }),
    ).toMatchObject({ changed: false, limitReached: true });
    expect(readToolboxPinnedTools(owner, { storage, allowedToolIds: new Set(['tool-0']) })).toEqual(['tool-0']);
  });

  it('达到上限后仍允许取消固定，且不可用工具不能写入', () => {
    const storage = memoryStorage();
    const owner = { id: 'owner', role: 'user' };
    const allowed = new Set(Array.from({ length: TOOLBOX_PINNED_TOOL_LIMIT }, (_, index) => `tool-${index}`));
    for (const toolId of allowed) toggleToolboxPinnedTool(owner, toolId, { storage, allowedToolIds: allowed });

    expect(toggleToolboxPinnedTool(owner, 'tool-0', { storage, allowedToolIds: allowed })).toMatchObject({
      changed: true,
      limitReached: false,
    });
    expect(toggleToolboxPinnedTool(owner, 'tool-not-allowed', { storage, allowedToolIds: allowed })).toMatchObject({
      changed: false,
      limitReached: false,
    });
    expect(readToolboxPinnedTools(owner, { storage, allowedToolIds: allowed })).toHaveLength(
      TOOLBOX_PINNED_TOOL_LIMIT - 1,
    );
  });
});
