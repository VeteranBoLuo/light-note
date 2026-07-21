// 引入mysql模块
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// 优先加载 .env（无论谁先导入本模块，都保证 env 已就绪）
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isTestRuntime = process.env.NODE_ENV === 'test';
if (!isTestRuntime) dotenv.config({ path: path.resolve(__dirname, '../.env') });

function testDatabaseDisabled() {
  const error = new Error('TEST_DATABASE_DISABLED: 测试必须显式 mock 数据库，禁止连接真实数据库');
  error.code = 'TEST_DATABASE_DISABLED';
  throw error;
}

const pool = isTestRuntime
  ? {
      query: testDatabaseDisabled,
      execute: testDatabaseDisabled,
      getConnection: testDatabaseDisabled,
      end: async () => {},
    }
  : mysql.createPool({
      connectionLimit: 10, // 例如限制为10个连接
      host: process.env.DB_HOST || '139.9.83.16',
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'boluo',
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || 'tag_db',
      namedPlaceholders: true,
      charset: 'utf8mb4',
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
    });

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
        console.error(err.message);
      }
    });
}

export default pool;
