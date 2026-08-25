#!/usr/bin/env node

import pool from '../db/index.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';
import { reconcileHistoricalAiExecutionBilling } from '../util/aiExecution/reconciliation.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const allUsers = args.includes('--all');

function argument(name) {
  const prefix = `--${name}=`;
  return args.find((value) => value.startsWith(prefix))?.slice(prefix.length) || '';
}

async function main() {
  const userId = argument('user-id').trim();
  const limit = Number(argument('limit') || 5_000);
  if (apply && !allUsers && !userId) {
    const error = new Error('apply 必须明确传入 --user-id=<id> 或 --all');
    error.code = 'AI_EXECUTION_RECONCILIATION_SCOPE_REQUIRED';
    throw error;
  }
  const summary = await reconcileHistoricalAiExecutionBilling({ apply, userId, limit });
  console.log('[ai-execution-reconciliation] %s', JSON.stringify(summary));
}

main()
  .catch((error) => {
    console.error('[ai-execution-reconciliation] failed code=%s', stableAgentErrorCode(error));
    process.exitCode = 1;
  })
  .finally(() => pool.end());
