import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const checkScript = new URL('./check-deploy-release.sh', import.meta.url);
const entryPoints = ['deploy.sh', 'deploy-web.sh', 'deploy-server.sh', 'deploy-host-agent.sh'];

function fixture(t) {
  const repo = mkdtempSync(path.join(tmpdir(), 'lightnote-deploy-gate-'));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '--initial-branch=main');
  git('config', 'user.email', 'fixtures@example.invalid');
  git('config', 'user.name', 'Release gate fixture');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'core.hooksPath', path.join(repo, '.git/hooks'));
  git('remote', 'add', 'origin', 'git@github.com:veteranboluo/light-note.git');
  mkdirSync(path.join(repo, 'scripts'));
  copyFileSync(checkScript, path.join(repo, 'scripts/check-deploy-release.sh'));
  for (const file of entryPoints) copyFileSync(new URL(file, import.meta.url), path.join(repo, 'scripts', file));
  writeFileSync(path.join(repo, 'source.txt'), 'tracked build source');
  git('add', '.');
  git('commit', '-m', 'fixture');
  const sha = git('rev-parse', 'HEAD');

  const mockDir = path.join(repo, '.git/commands');
  const calls = path.join(repo, '.git/api-calls');
  mkdirSync(mockDir);
  writeFileSync(calls, '');
  const gh = path.join(mockDir, 'gh');
  writeFileSync(gh, [
    '#!/bin/sh',
    'case "$*" in',
    '  *repos/veteranboluo/light-note/git/ref/heads/main*)',
    '    printf "main\\n" >> "$RELEASE_FIXTURE_CALLS"',
    '    printf "%s\\n" "$RELEASE_FIXTURE_REMOTE"',
    '    ;;',
    '  *repos/veteranboluo/light-note/actions/workflows/ci.yml/runs*)',
    '    printf "ci\\n" >> "$RELEASE_FIXTURE_CALLS"',
    '    case "$*" in *"--method GET"*branch=main*event=push*"head_sha=$RELEASE_FIXTURE_HEAD"*) ;; *) exit 89 ;; esac',
    '    printf "%s\\t%s\\t%s\\n" "$RELEASE_FIXTURE_CI_SHA" "$RELEASE_FIXTURE_STATUS" "$RELEASE_FIXTURE_CONCLUSION"',
    '    ;;',
    '  *) exit 90 ;;',
    'esac',
    '',
  ].join('\n'));
  chmodSync(gh, 0o755);

  function run(script = 'check-deploy-release.sh', options = {}, args = []) {
    return spawnSync('bash', [path.join(repo, 'scripts', script), ...args], {
      cwd: repo,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: [mockDir, process.env.PATH].join(path.delimiter),
        GITHUB_ACTIONS: '',
        GITHUB_REF: '',
        GITHUB_SHA: '',
        RELEASE_FIXTURE_CALLS: calls,
        RELEASE_FIXTURE_HEAD: sha,
        RELEASE_FIXTURE_REMOTE: sha,
        RELEASE_FIXTURE_CI_SHA: sha,
        RELEASE_FIXTURE_STATUS: 'completed',
        RELEASE_FIXTURE_CONCLUSION: 'success',
        ...options,
      },
    });
  }
  return { repo, git, run, sha, calls: () => readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean) };
}

test('returns the verified main commit and checks the CI for that exact commit', (t) => {
  const ctx = fixture(t);
  const result = ctx.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), ctx.sha);
  assert.deepEqual(ctx.calls(), ['main', 'ci']);
});

test('every production entry exits before delivery on the wrong branch', (t) => {
  const ctx = fixture(t);
  ctx.git('switch', '-c', 'develop');
  for (const entryPoint of entryPoints) {
    const result = ctx.run(entryPoint);
    assert.equal(result.status, 1, entryPoint);
    assert.match(result.stderr, /只能从 main/);
  }
  assert.deepEqual(ctx.calls(), []);
});

test('rejects tracked and untracked changes before any remote checks', (t) => {
  const ctx = fixture(t);
  writeFileSync(path.join(ctx.repo, 'source.txt'), 'changed during build');
  assert.match(ctx.run().stderr, /干净的 main/);
  ctx.git('checkout', '--', 'source.txt');
  writeFileSync(path.join(ctx.repo, 'untracked.txt'), 'uncommitted release content');
  assert.match(ctx.run().stderr, /干净的 main/);
  assert.deepEqual(ctx.calls(), []);
});

test('a GitHub fork cannot authorize a production release', (t) => {
  const ctx = fixture(t);
  ctx.git('remote', 'set-url', 'origin', 'https://github.com/another-org/light-note.git');
  assert.equal(ctx.run().status, 1);
  assert.match(ctx.run().stderr, /生产源码仓库/);
  assert.deepEqual(ctx.calls(), []);
});

test('rejects an out-of-date main and a changed build commit', (t) => {
  const ctx = fixture(t);
  const different = 'b'.repeat(40);
  assert.match(ctx.run(undefined, {}, [different]).stderr, /准备期间发生变化/);
  assert.deepEqual(ctx.calls(), []);
  assert.match(ctx.run(undefined, { RELEASE_FIXTURE_REMOTE: different }).stderr, /与远程 main 不一致/);
  assert.deepEqual(ctx.calls(), ['main']);
});

test('rejects a pending, failed or unrelated CI run', (t) => {
  const ctx = fixture(t);
  for (const options of [
    { RELEASE_FIXTURE_STATUS: 'in_progress', RELEASE_FIXTURE_CONCLUSION: '' },
    { RELEASE_FIXTURE_CONCLUSION: 'failure' },
    { RELEASE_FIXTURE_CI_SHA: 'c'.repeat(40) },
  ]) {
    const result = ctx.run(undefined, options);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /main CI 尚未成功/);
  }
});

test('accepts detached checkout only for the matching main Actions run', (t) => {
  const ctx = fixture(t);
  ctx.git('checkout', '--detach');
  assert.equal(ctx.run().status, 1);
  const actions = { GITHUB_ACTIONS: 'true', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: ctx.sha };
  assert.equal(ctx.run(undefined, { ...actions, GITHUB_REF: 'refs/heads/develop' }).status, 1);
  const result = ctx.run(undefined, actions);
  assert.equal(result.status, 0, result.stderr);
});
