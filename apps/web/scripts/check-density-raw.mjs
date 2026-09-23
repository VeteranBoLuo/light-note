import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addedFixedDimensions } from './density-raw-audit.mjs';
const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) => execFileSync('git', args, { cwd: webRoot, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const root = git('rev-parse', '--show-toplevel').trim();
const args = process.argv.slice(2);
const staged = args.length === 1 && args[0] === '--staged';
if (args.length && !staged && (args.length !== 2 || args[0] !== '--base'))
  throw new Error('Usage: check-density-raw.mjs [--base <git ref> | --staged]');
const base = git('rev-parse', '--verify', `${args[1] || 'HEAD'}^{commit}`).trim();
const prefix = relative(root, webRoot).replaceAll('\\', '/');
const tracked = git('diff', ...(staged ? ['--cached'] : []), '--name-only', '--diff-filter=ACMR', '-z', base, '--', 'src');
const untracked = staged ? '' : git('ls-files', '--others', '--exclude-standard', '--full-name', '-z', '--', 'src');
const files = [...new Set((tracked + untracked).split('\0').filter(Boolean))].filter(
  (file) => /\.(vue|less|css)$/.test(file) && !file.includes('/e2e/'),
);
const baselineFiles = new Set(git('ls-tree', '-r', '--full-tree', '--name-only', '-z', base).split('\0'));
let issues = 0;
for (const file of files) {
  // diff uses repo-root names; --full-name makes untracked names identical.
  const path = file.startsWith(prefix + '/') ? file : `${prefix}/${file}`;
  const before = baselineFiles.has(path) ? git('show', `${base}:${path}`) : '';
  // A fixed working tree must not hide an unfixed version already staged for commit.
  const after = staged ? git('show', `:${path}`) : await readFile(resolve(root, path), 'utf8');
  for (const item of addedFixedDimensions(before, after, path.endsWith('.vue'))) {
    console.error(`${path}:${item.line} ${item.property}: ${item.value}`);
    issues++;
  }
}
if (issues) {
  console.error(
    `${issues} new fixed CSS dimensions require density tokens or an adjacent /* ui-density-fixed: reason */ exception.`,
  );
  process.exitCode = 1;
} else console.log(`No new unreviewed fixed CSS dimensions in ${files.length} changed style files.`);
