import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDir, '../../..');
const helperPath = path.resolve(repositoryRoot, 'scripts/lib/deploy-environment.sh');

const resolveKey = (rawKey, userDirectory = '/Users/release-user') =>
  execFileSync(
    'bash',
    [
      '-c',
      'source "$1"; resolve_deploy_ssh_key "$2" "$3"',
      'deploy-environment-test',
      helperPath,
      rawKey,
      userDirectory,
    ],
    { encoding: 'utf8' },
  ).trim();

describe('部署环境解析', () => {
  it('只展开当前用户形式的波浪号私钥路径', () => {
    expect(resolveKey('~/.ssh/light-note')).toBe('/Users/release-user/.ssh/light-note');
    expect(resolveKey('/secure/keys/light-note')).toBe('/secure/keys/light-note');
    expect(resolveKey('~another/.ssh/light-note')).toBe('~another/.ssh/light-note');
  });

  it('所有独立发布入口复用同一个解析器', async () => {
    for (const fileName of ['deploy-host-agent.sh', 'deploy-server.sh', 'deploy-web.sh']) {
      const source = await readFile(path.resolve(repositoryRoot, 'scripts', fileName), 'utf8');
      expect(source).toContain('source "$DEPLOY_SCRIPT_DIR/lib/deploy-environment.sh"');
      expect(source).toContain('KEY="$(resolve_deploy_ssh_key');
    }
  });
});
