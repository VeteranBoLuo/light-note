import { afterEach, describe, expect, it, vi } from 'vitest';
import { discardRepairOutputs, emptyRepairHistory, recordRepairEdit, type RepairOutput } from './imageRepairHistory';
import type { RepairSelection } from './imageRepairSelection';

const selection: RepairSelection = { kind: 'rectangle', x: 4, y: 5, width: 8, height: 9 };
const output = (name: string, size = 10): RepairOutput => ({ url: `blob:${name}`, blob: { size } as Blob });
afterEach(() => vi.restoreAllMocks());

describe('image repair undo history', () => {
  it('restores the selection before a repair and discards only the superseded redo result', () => {
    const first = output('first');
    const second = output('second');
    let history = recordRepairEdit(emptyRepairHistory(), { selections: [selection] });
    history = recordRepairEdit(history, { selections: [], output: first });
    history = recordRepairEdit(history, { selections: [selection], output: first });
    const beforeSecond = history.index;
    history = recordRepairEdit(history, { selections: [], output: second });

    expect(history.edits[beforeSecond]).toEqual({ selections: [selection], output: first });
    expect(history.edits[beforeSecond + 1]).toEqual({ selections: [], output: second });

    const branch = recordRepairEdit({ ...history, index: beforeSecond }, { selections: [], output: first });
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    discardRepairOutputs(history, branch);
    expect(revoke.mock.calls).toEqual([['blob:second']]);
  });

  it('bounds undo history and counts a result shared by multiple selections once', () => {
    const first = output('first', 32 * 1024 * 1024);
    const second = output('second', 32 * 1024 * 1024);
    let history = recordRepairEdit(emptyRepairHistory(), { selections: [], output: first });
    history = recordRepairEdit(history, { selections: [selection], output: first });
    history = recordRepairEdit(history, { selections: [], output: second });
    expect(history.edits.filter((edit) => edit.output === first)).toHaveLength(2);

    const third = output('third');
    history = recordRepairEdit(history, { selections: [], output: third });
    expect(history.edits.map((edit) => edit.output)).toEqual([second, third]);
    for (let step = 0; step < 40; step++)
      history = recordRepairEdit(history, { selections: [selection], output: third });
    expect(history.index).toBe(32);
    expect(history.edits).toHaveLength(33);
  });
});
