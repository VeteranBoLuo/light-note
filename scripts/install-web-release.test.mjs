import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, statSync, existsSync, utimesSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
const installer = fileURLToPath(new URL('./lib/install-web-release.sh', import.meta.url));
function fixture(t, changed = false, revision = 'r1') {
  const root = mkdtempSync(join(tmpdir(), 'ln-manor-release-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, value) => { mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), value); };
  write('dist/index.html', 'old');
  write('dist/assets/old-hash.js', 'previous lazy chunk');
  write('dist/.lightnote-release-assets', 'assets/old-hash.js\n');
  write('dist/manor/scene-r1.webp', 'same art');
  write('dist/manor/sprite.webp', 'stable sprite');
  const old = new Date('2026-01-01T00:00:00Z');
  for (const name of ['scene-r1.webp', 'sprite.webp']) utimesSync(join(root, 'dist/manor', name), old, old);
  write('package/dist/index.html', 'new');
  write('package/dist/.lightnote-release-assets', 'assets/new-hash.js\n');
  write('package/dist/assets/new-hash.js', 'new lazy chunk');
  write(`package/dist/manor/scene-${revision}.webp`, changed ? 'new art' : 'same art');
  write('package/dist/manor/sprite.webp', 'stable sprite');
  const archive = join(root, 'release.tgz');
  execFileSync('tar', ['czf', archive, '-C', join(root, 'package'), 'dist'], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
  const run = () => spawnSync('bash', [installer, root, '20261025000100', archive], { encoding: 'utf8' });
  return { root, run, old };
}
test('unchanged manor bytes retain validators; previous lazy assets remain usable', t => {
  const { root, run, old } = fixture(t);
  const result = run(); assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(join(root, 'dist/index.html'), 'utf8'), 'new');
  for (const name of ['scene-r1.webp', 'sprite.webp']) assert.equal(statSync(join(root, 'dist/manor', name)).mtimeMs, old.getTime());
  assert.equal(readFileSync(join(root, 'dist/assets/old-hash.js'), 'utf8'), 'previous lazy chunk');
  assert.equal(readFileSync(join(root, 'dist/.lightnote-release-assets'), 'utf8'), 'assets/new-hash.js\n');
});
test('changed immutable revision fails before live replacement', t => {
  const { root, run } = fixture(t, true);
  const result = run(); assert.notEqual(result.status, 0);
  assert.match(result.stderr, /scene-r1.webp/);
  assert.equal(readFileSync(join(root, 'dist/index.html'), 'utf8'), 'old');
  assert.equal(existsSync(join(root, 'dist_bak_20261025000100')), false);
});
test('new revision can ship without replacing already cached art', t => {
  const { root, run } = fixture(t, true, 'r2');
  const result = run(); assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(join(root, 'dist/manor/scene-r2.webp'), 'utf8'), 'new art');
});
