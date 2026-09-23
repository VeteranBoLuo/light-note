import { execFileSync } from 'node:child_process';
import { existsSync, chmodSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
let configured = '';
try { configured = git('config', '--get', 'core.hooksPath'); } catch (error) {
  if (error.status !== 1) throw error;
}
if (configured && configured !== '.githooks') {
  throw new Error(`Existing core.hooksPath (${configured}) retained. Integrate .githooks/pre-commit into the existing hook before enabling this check.`);
}
if (!configured && existsSync(resolve(root, git('rev-parse', '--git-path', 'hooks/pre-commit')))) {
  throw new Error('Existing pre-commit hook retained. Integrate the density check into that hook; it will not be overwritten.');
}
chmodSync(resolve(root, '.githooks/pre-commit'), 0o755);
git('config', '--local', 'core.hooksPath', '.githooks');
console.log('Repository-local pre-commit density check enabled (staged files only).');
