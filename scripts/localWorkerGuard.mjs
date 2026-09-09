import { execFileSync } from 'node:child_process';

export function findLocalDocumentWorkers(serverDirectory, run = (file, args) => execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })) {
  const rows = run('ps', ['-axo', 'pid=,comm=,args=']).split('\n');
  const found = [];
  for (const row of rows) {
    const match = row.trim().match(/^(\d+)\s+(\S+)\s+(.+)$/);
    if (!match || !/(^|\/)node$/.test(match[2]) || !/(?:^|\s)(?:\S*\/)?documentWorker\.js(?:\s|$)/.test(match[3])) continue;
    try {
      const cwd = run('lsof', ['-a', '-p', match[1], '-d', 'cwd', '-Fn']).split('\n').find(line => line.startsWith('n'))?.slice(1);
      if (cwd === serverDirectory) found.push(Number(match[1]));
    } catch {
      // 进程可能已经退出。
    }
  }
  return found;
}
