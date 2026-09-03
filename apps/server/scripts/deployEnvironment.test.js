import { execFileSync } from 'node:child_process';
import { access, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDir, '../../..');
const helperPath = path.resolve(repositoryRoot, 'scripts/lib/deploy-environment.sh');
const webInstallerPath = path.resolve(repositoryRoot, 'scripts/lib/install-web-release.sh');

const pathExists = async (targetPath) => {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
};

const createWebReleaseArchive = async (workspace, releaseName, assetName) => {
  const packageRoot = path.join(workspace, `package-${releaseName}`);
  const distRoot = path.join(packageRoot, 'dist');
  const archivePath = path.join(workspace, `${releaseName}.tgz`);

  await mkdir(path.join(distRoot, 'assets'), { recursive: true });
  await writeFile(path.join(distRoot, 'index.html'), `<main>${releaseName}</main>\n`);
  await writeFile(path.join(distRoot, 'assets', assetName), `${releaseName}\n`);
  await writeFile(path.join(distRoot, '.lightnote-release-assets'), `assets/${assetName}\n`);
  execFileSync('tar', ['czf', archivePath, '-C', packageRoot, 'dist']);

  return archivePath;
};

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

  it('Web 发布先 staging 再切换，并只继承上一版清单资源', async () => {
    const source = await readFile(path.resolve(repositoryRoot, 'scripts/deploy-web.sh'), 'utf8');
    const installer = await readFile(webInstallerPath, 'utf8');
    const legacyEntry = await readFile(path.resolve(repositoryRoot, 'apps/web/deploy.sh'), 'utf8');

    expect(source).toContain('< "$DEPLOY_SCRIPT_DIR/lib/install-web-release.sh"');
    expect(installer).toContain('dist_stage_$RELEASE_TS');
    expect(installer).toContain('done < dist/.lightnote-release-assets');
    expect(installer).toContain('tar xzf "$ARCHIVE_PATH"');
    expect(installer).toContain('mv dist "dist_bak_$RELEASE_TS"');
    expect(installer.indexOf('tar xzf "$ARCHIVE_PATH"')).toBeLessThan(
      installer.indexOf('mv dist "dist_bak_$RELEASE_TS"'),
    );
    expect(legacyEntry).toContain('../../scripts/deploy-web.sh');
    expect(legacyEntry).not.toContain('root@');
  });

  it('连续发布只继承紧邻上一版自己的资源，不让旧哈希文件跨代累积', async () => {
    const workspace = await mkdtemp(path.join(os.tmpdir(), 'light-note-web-release-'));
    const remoteRoot = path.join(workspace, 'remote');

    try {
      await mkdir(path.join(remoteRoot, 'dist', 'assets'), { recursive: true });
      await writeFile(path.join(remoteRoot, 'dist', 'index.html'), '<main>v1</main>\n');
      await writeFile(path.join(remoteRoot, 'dist', 'assets', 'v1-current.js'), 'v1\n');
      await writeFile(path.join(remoteRoot, 'dist', 'assets', 'v0-inherited.js'), 'v0\n');
      await writeFile(path.join(remoteRoot, 'dist', '.lightnote-release-assets'), 'assets/v1-current.js\n');

      const v2Archive = await createWebReleaseArchive(workspace, 'v2', 'v2-current.js');
      execFileSync('bash', [webInstallerPath, remoteRoot, '20260903010102', v2Archive], { encoding: 'utf8' });

      expect((await readdir(path.join(remoteRoot, 'dist', 'assets'))).sort()).toEqual([
        'v1-current.js',
        'v2-current.js',
      ]);
      expect(await readFile(path.join(remoteRoot, 'dist', '.lightnote-release-assets'), 'utf8')).toBe(
        'assets/v2-current.js\n',
      );
      expect(await pathExists(v2Archive)).toBe(false);

      const v3Archive = await createWebReleaseArchive(workspace, 'v3', 'v3-current.js');
      execFileSync('bash', [webInstallerPath, remoteRoot, '20260903010103', v3Archive], { encoding: 'utf8' });

      expect((await readdir(path.join(remoteRoot, 'dist', 'assets'))).sort()).toEqual([
        'v2-current.js',
        'v3-current.js',
      ]);
      expect(await pathExists(path.join(remoteRoot, 'dist', 'assets', 'v1-current.js'))).toBe(false);
      expect(await pathExists(path.join(remoteRoot, 'dist', 'assets', 'v0-inherited.js'))).toBe(false);
      expect(await pathExists(v3Archive)).toBe(false);

      const backups = (await readdir(remoteRoot)).filter((name) => name.startsWith('dist_bak_'));
      expect(backups).toEqual(['dist_bak_20260903010103']);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
