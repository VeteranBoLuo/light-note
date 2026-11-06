import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { assertLocalTestEnvironment } from '../util/localTestEnvironment.js';

assertLocalTestEnvironment(process.env);
// 复用工具箱的真实解析器，在独立进程中使用自己的内存缓存；不改写工具箱仓库。
const { handle } = await import(pathToFileURL(process.env.LIGHTNOTE_LOCAL_FAVICON_ENTRY).href);
createServer(handle).listen(19003, '127.0.0.1', () => console.log('[local-favicon] ready'));
