import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

describe('drawing thumbnail renderer contract', () => {
  it('渲染依赖变化时必须同步升级派生缓存版本', async () => {
    const { stdout } = await execFileAsync(process.execPath, ['scripts/drawing-thumbnail-renderer-contract.mjs'], {
      cwd: process.cwd(),
    });
    expect(stdout).toContain('[drawing-thumbnail-renderer] v3 sha256:');
  });
});
