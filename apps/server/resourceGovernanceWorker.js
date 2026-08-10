#!/usr/bin/env node

import os from 'node:os';
import pool from './db/index.js';
import { ensureResourceGovernanceSchema } from './util/resourceGovernanceSchema.js';
import { claimGovernanceScan, runGovernanceScan } from './util/resourceGovernance/scanService.js';
import { claimCleanupJob, runCleanupJob } from './util/resourceGovernance/jobService.js';
import { resourceGovernanceCleanupEnabled, resourceGovernanceScanEnabled } from './util/resourceGovernance/registry.js';
import { stableAgentErrorCode } from './util/agent/logSafety.js';

const workerId = `${os.hostname()}:${process.pid}`;
const pollMs = Math.max(500, Number.parseInt(process.env.RESOURCE_GOVERNANCE_WORKER_POLL_MS || '1500', 10));
let stopping = false;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  await ensureResourceGovernanceSchema();
  console.log(
    '[resource-governance-worker] started id=%s scan=%s cleanup=%s',
    workerId,
    resourceGovernanceScanEnabled(),
    resourceGovernanceCleanupEnabled(),
  );
  while (!stopping) {
    try {
      let handled = false;
      if (resourceGovernanceScanEnabled()) {
        const scan = await claimGovernanceScan(workerId);
        if (scan) {
          handled = true;
          await runGovernanceScan(scan, workerId);
        }
      }
      if (resourceGovernanceCleanupEnabled()) {
        const job = await claimCleanupJob(workerId);
        if (job) {
          handled = true;
          await runCleanupJob(job, workerId);
        }
      }
      if (!handled) await wait(pollMs);
    } catch (error) {
      console.error('[resource-governance-worker] loop failed code=%s', stableAgentErrorCode(error));
      await wait(pollMs * 2);
    }
  }
  console.log('[resource-governance-worker] stopped');
}

function stop() {
  stopping = true;
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);

run()
  .catch((error) => {
    console.error('[resource-governance-worker] startup failed code=%s', stableAgentErrorCode(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await pool.end();
    } catch (error) {
      console.error('[resource-governance-worker] shutdown failed code=%s', stableAgentErrorCode(error));
      process.exitCode = 1;
    }
  });
