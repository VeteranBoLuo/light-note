import { execFileSync } from 'node:child_process';
import { describe, it, expect } from 'vitest';

describe('toolbox Schema standalone import', () => {
  it('exits naturally without opening provider or Redis connections', () => {
    const output = execFileSync(
      process.execPath,
      ['--input-type=module', '-e', "await import('./util/toolboxSchema.js'); console.log('SCHEMA_IMPORT_COMPLETE');"],
      {
        cwd: new URL('../', import.meta.url),
        env: { ...process.env, NODE_ENV: 'test' },
        timeout: 5000,
        encoding: 'utf8',
      },
    );
    expect(output.trim()).toBe('SCHEMA_IMPORT_COMPLETE');
  });
});
