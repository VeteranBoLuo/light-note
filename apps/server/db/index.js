// 引入mysql模块
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createReadOnlyPool } from '../util/readOnlyDatabase.js';
import { assertDatabaseConnectionSafety } from '../util/databaseConnectionSafety.js';

// 优先加载 .env（无论谁先导入本模块，都保证 env 已就绪）
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isTestRuntime = process.env.NODE_ENV === 'test';
if (!isTestRuntime) dotenv.config({ path: path.resolve(__dirname, '../.env') });
const databaseSafety = assertDatabaseConnectionSafety(process.env);

if (!isTestRuntime) {
  console.log(
    '[database-safety] runtime=%s source=%s database=%s remoteOverride=%s access=%s',
    databaseSafety.runtime,
    databaseSafety.runtimeSource,
    databaseSafety.databaseScope,
    databaseSafety.remoteWriteOverride ? 'enabled' : 'disabled',
    databaseSafety.readOnly ? 'read-only' : 'read-write',
  );
}

function testDatabaseDisabled() {
  const error = new Error('TEST_DATABASE_DISABLED: 测试必须显式 mock 数据库，禁止连接真实数据库');
  error.code = 'TEST_DATABASE_DISABLED';
  throw error;
}

const basePool = isTestRuntime
  ? {
      query: testDatabaseDisabled,
      execute: testDatabaseDisabled,
      getConnection: testDatabaseDisabled,
      end: async () => {},
    }
  : mysql.createPool({
      connectionLimit: 10, // 例如限制为10个连接
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || 'tag_db',
      namedPlaceholders: true,
      charset: 'utf8mb4',
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
    });

const pool = databaseSafety.readOnly && !isTestRuntime ? createReadOnlyPool(basePool) : basePool;

if (!isTestRuntime) {
  pool
    .getConnection()
    .then((connection) => {
      // 完成后释放连接
      connection.release();
    })
    .catch((err) => {
      if (err.code === 'PROTOCOL_CONNECTION_LOST') {
        console.error('Database connection was closed.');
      } else if (err.code === 'ER_CON_COUNT_ERROR') {
        console.error('Database has too many connections.');
      } else if (err.code === 'ECONNREFUSED') {
        console.error('Database connection was refused.');
      } else {
        console.error('Database connection failed code=%s', String(err?.code || 'DATABASE_UNAVAILABLE'));
      }
    });
}

export default pool;
