/** Explicit inspection profile: SQL allowlist plus MySQL session-level read-only transactions. */
function readOnlyError() {
  return Object.assign(new Error('当前数据库连接仅允许只读检查'), { code: 'DATABASE_READ_ONLY' });
}
export function assertReadOnlyQuery(input) {
  const sql = typeof input === 'string' ? input : input?.sql;
  if (typeof sql !== 'string') throw readOnlyError();
  const statement = sql.trim().replace(/;\s*$/, '');
  if (
    !/^(?:SELECT\b|SHOW\b|DESCRIBE\b|DESC\b|EXPLAIN\s+(?:FORMAT\s*=\s*JSON\s+)?SELECT\b)/i.test(statement) ||
    /;|\bINTO\s+(?:OUTFILE|DUMPFILE)\b|\bFOR\s+UPDATE\b|\bLOCK\s+IN\s+SHARE\s+MODE\b|\b(?:GET_LOCK|RELEASE_LOCK|RELEASE_ALL_LOCKS)\s*\(/i.test(
      statement,
    )
  )
    throw readOnlyError();
  return input;
}

export function createReadOnlyPool(pool) {
  async function getConnection() {
    const raw = await pool.getConnection();
    try {
      // Every checkout is initialized before exposing it, including reused pool connections.
      await raw.query('SET SESSION TRANSACTION READ ONLY');
    } catch (error) {
      raw.destroy();
      throw error;
    }
    let transactionOpen = false;
    return {
      query: (...args) => {
        assertReadOnlyQuery(args[0]);
        return raw.query(...args);
      },
      execute: (...args) => {
        assertReadOnlyQuery(args[0]);
        return raw.execute(...args);
      },
      beginTransaction: async () => {
        await raw.query('START TRANSACTION READ ONLY');
        transactionOpen = true;
      },
      commit: async () => {
        await raw.commit();
        transactionOpen = false;
      },
      rollback: async () => {
        await raw.rollback();
        transactionOpen = false;
      },
      release: () => {
        if (transactionOpen) raw.destroy();
        else raw.release();
      },
      destroy: () => raw.destroy(),
    };
  }
  const run = async (method, args) => {
    assertReadOnlyQuery(args[0]);
    const connection = await getConnection();
    try {
      return await connection[method](...args);
    } finally {
      connection.release();
    }
  };
  return {
    getConnection,
    query: (...args) => run('query', args),
    execute: (...args) => run('execute', args),
    end: () => pool.end(),
  };
}
