import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = dirname(fileURLToPath(import.meta.url));
function fixture(t) {
  const root = mkdtempSync(resolve(tmpdir(), 'density-git-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const scripts = resolve(root, 'apps/web/scripts');
  mkdirSync(scripts, { recursive: true });
  mkdirSync(resolve(root, 'apps/web/src'), { recursive: true });
  for (const name of ['check-density-raw.mjs', 'density-raw-audit.mjs'])
    copyFileSync(resolve(source, name), resolve(scripts, name));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init');
  git('config', 'user.name', 'Density Test');
  git('config', 'user.email', 'density@example.invalid');
  // Isolate temporary test commits from any machine-wide hooks or signing policy.
  git('config', 'core.hooksPath', 'disabled-hooks');
  git('config', 'commit.gpgsign', 'false');
  git('add', '.');
  git('commit', '-m', 'test baseline');
  const path = 'apps/web/src/space name.vue';
  const write = css => writeFileSync(resolve(root, path), `<template><div /></template><style>${css}</style>`);
  const run = (...args) => spawnSync(process.execPath, [resolve(scripts, 'check-density-raw.mjs'), ...args], { cwd: root, encoding: 'utf8' });
  return { root, git, path, write, run };
}

test('staged violation cannot be hidden by an unstaged fix', t => {
  const f = fixture(t);
  f.write('.a { width: 60px; }'); f.git('add', f.path);
  f.write('.a { width: var(--ui-layout-60, 60px); }');
  const result = f.run('--staged');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /space name\.vue:1 width: 60px/);
  assert.equal(f.run().status, 0);
});

test('unstaged violations do not block a correctly staged change', t => {
  const f = fixture(t);
  f.write('.a { width: var(--ui-layout-60, 60px); }'); f.git('add', f.path);
  f.write('.a { width: 61px; }');
  assert.equal(f.run('--staged').status, 0);
  assert.equal(f.run().status, 1);
});

test('changed existing dimensions are caught and deletions are allowed', t => {
  const f = fixture(t);
  f.write('.a { width: 60px; }'); f.git('add', f.path); f.git('commit', '-m', 'legacy fixture');
  f.write('.a { width: 61px; }'); f.git('add', f.path);
  assert.equal(f.run('--staged').status, 1);
  f.git('rm', '-f', f.path);
  assert.equal(f.run('--staged').status, 0);
});

test('the actual pre-commit hook rejects a staged violation', t => {
  const f = fixture(t);
  mkdirSync(resolve(f.root, '.githooks'));
  const hook = resolve(f.root, '.githooks/pre-commit');
  copyFileSync(resolve(source, '../../../.githooks/pre-commit'), hook);
  chmodSync(hook, 0o755);
  f.git('config', 'core.hooksPath', '.githooks');
  f.write('.a { height: 53px; }'); f.git('add', f.path);
  const result = spawnSync('git', ['commit', '-m', 'must reject'], { cwd: f.root, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /height: 53px/);
});

test('hook installation is idempotent and preserves existing configuration', t => {
  const f = fixture(t);
  mkdirSync(resolve(f.root, 'scripts'));
  mkdirSync(resolve(f.root, '.githooks'));
  const installer = resolve(f.root, 'scripts/installGitHooks.mjs');
  copyFileSync(resolve(source, '../../../scripts/installGitHooks.mjs'), installer);
  copyFileSync(resolve(source, '../../../.githooks/pre-commit'), resolve(f.root, '.githooks/pre-commit'));
  const install = () => spawnSync(process.execPath, [installer], { cwd: f.root, encoding: 'utf8' });
  assert.notEqual(install().status, 0);
  assert.equal(f.git('config', '--get', 'core.hooksPath').trim(), 'disabled-hooks');
  f.git('config', '--unset', 'core.hooksPath');
  const original = resolve(f.root, '.git/hooks/pre-commit');
  writeFileSync(original, '#!/bin/sh\nexit 0\n');
  assert.notEqual(install().status, 0);
  rmSync(original);
  assert.equal(install().status, 0);
  assert.equal(install().status, 0);
  assert.equal(f.git('config', '--get', 'core.hooksPath').trim(), '.githooks');
});
