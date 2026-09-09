#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import pool from '../db/index.js';
import { NOTE_IMAGE_DIR } from '../util/noteImages.js';
import { invalidatePersonalKnowledgeCache } from '../util/personalKnowledgeSearch.js';
import * as definitions from './visitorExamples/manifestV2.mjs';
import {
  readVisitorV2Snapshot,
  describeVisitorV2,
  applyVisitorV2,
  visitorChanges,
  restoreVisitorV2,
  verifyVisitorRestore,
} from '../util/services/visitorExampleV2Service.js';
import {
  assertVisitorOwner,
  exampleHash,
  exampleError,
  parseExampleManifest,
} from '../util/services/visitorExampleScheduleService.js';

const args = process.argv.slice(2),
  apply = args.includes('--apply'),
  restore = args.includes('--restore'),
  disable = args.includes('--disable');
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const stateDir = path.resolve(
  option('--state-dir', path.join(os.homedir(), '.local/state/light-note/visitor-resources-v2')),
);
async function save(name, data) {
  await fs.mkdir(stateDir, { recursive: true, mode: 0o700 });
  await fs.chmod(stateDir, 0o700);
  const tmp = path.join(stateDir, `${name}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  await fs.rename(tmp, path.join(stateDir, name));
}
async function read(name) {
  try {
    return JSON.parse(await fs.readFile(path.join(stateDir, name), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}
const digest = (buffer) => createHash('sha256').update(buffer).digest('hex');
let connection;
try {
  if (restore && disable) throw exampleError('VISITOR_MODE_INVALID');
  const [users] = await pool.query(
    "SELECT id FROM user WHERE role='visitor' AND del_flag=0 ORDER BY create_time LIMIT 2",
  );
  const owner = option('--owner', users.length === 1 ? String(users[0].id) : null);
  if (!owner) throw exampleError('VISITOR_OWNER_REQUIRED');
  await assertVisitorOwner(pool, owner);
  const [[state]] = await pool.query('SELECT * FROM visitor_example_maintenance WHERE user_id=?', [owner]);
  if (disable) {
    if (apply) await pool.query('UPDATE visitor_example_maintenance SET enabled=0 WHERE user_id=?', [owner]);
    console.log(JSON.stringify({ mode: apply ? 'disabled' : 'dry-run-disable' }));
  } else if (restore) {
    const receipt = (await read('completed.json')) || (await read('candidate.json'));
    if (!state || !receipt || receipt.owner !== owner || receipt.version !== state.version)
      throw exampleError('VISITOR_RESTORE_RECEIPT_MISSING');
    const manifest = parseExampleManifest(state.manifest_json);
    if (manifest.restored) console.log(JSON.stringify({ mode: 'restored-no-op' }));
    else {
      const restored = await read('restored.json');
      if (restored?.owner === owner && restored.version === state.version)
        throw exampleError('VISITOR_ALREADY_RESTORED');
      verifyVisitorRestore(await readVisitorV2Snapshot(pool, owner), receipt.changes, manifest);
      if (apply) {
        connection = await pool.getConnection();
        await connection.beginTransaction();
        await assertVisitorOwner(connection, owner, true);
        const [[locked]] = await connection.query(
          'SELECT manifest_json FROM visitor_example_maintenance WHERE user_id=? FOR UPDATE',
          [owner],
        );
        await restoreVisitorV2(connection, {
          owner,
          changes: receipt.changes,
          manifest: parseExampleManifest(locked.manifest_json),
        });
        await connection.commit();
        connection.release();
        connection = null;
        await invalidatePersonalKnowledgeCache(owner, { persist: true }).catch(() => {});
        await save('restored.json', { owner, version: state.version, restoredAt: new Date().toISOString() });
      }
      console.log(JSON.stringify({ mode: apply ? 'restored' : 'dry-run-restore', changes: receipt.changes.length }));
    }
  } else {
    const imageRoot = fileURLToPath(new URL('./visitorExamples/', import.meta.url));
    const images = [];
    for (const image of definitions.images) {
      const bytes = await fs.readFile(path.resolve(imageRoot, image.path));
      const sha256 = digest(bytes);
      images.push({
        ...image,
        bytes,
        sha256,
        size: bytes.length,
        locator: `note-visitor-${exampleHash(owner).slice(0, 12)}-${sha256.slice(0, 24)}.png`,
      });
    }
    const definitionHash = exampleHash({
      notes: definitions.noteThemes,
      todos: definitions.todos,
      files: definitions.filePlacement,
      folders: definitions.folders,
      pending: definitions.pendingNotes,
      pinned: definitions.pinnedNotes,
      bodies: definitions.buildNoteBodies({ welcome: 'welcome', weekend: 'weekend', inspiration: 'inspiration' }),
      images: images.map(({ key, sha256 }) => ({ key, sha256 })),
    });
    if (state) {
      const manifest = parseExampleManifest(state.manifest_json);
      if (manifest.definitionHash !== definitionHash) throw exampleError('VISITOR_MANIFEST_CHANGED');
      const candidate = await read('candidate.json');
      if (
        apply &&
        candidate?.owner === owner &&
        candidate.version === state.version &&
        candidate.definitionHash === definitionHash &&
        !(await read('completed.json'))
      )
        await save('completed.json', candidate);
      console.log(JSON.stringify({ mode: 'installed-no-op', enabled: Boolean(state.enabled) }));
    } else {
      const snapshot = await readVisitorV2Snapshot(pool, owner),
        plan = await describeVisitorV2(pool, snapshot);
      await save('plan.json', plan);
      console.log(
        JSON.stringify({
          mode: apply ? 'apply' : 'dry-run',
          planFile: path.join(stateDir, 'plan.json'),
          notes: plan.notes.length,
          todos: plan.todos.length,
          filesMoved: plan.files.filter((f) => f.placement).length,
          filesRetained: plan.files.filter((f) => !f.placement).length,
        }),
      );
      if (apply) {
        await save('before.json', snapshot);
        await fs.mkdir(NOTE_IMAGE_DIR, { recursive: true });
        for (const image of images) {
          const target = path.join(NOTE_IMAGE_DIR, image.locator);
          try {
            await fs.writeFile(target, image.bytes, { flag: 'wx', mode: 0o644 });
          } catch (error) {
            if (error.code !== 'EEXIST' || digest(await fs.readFile(target)) !== image.sha256)
              throw exampleError('VISITOR_IMAGE_CONFLICT');
          }
        }
        await save(
          'images.json',
          images.map(({ key, locator, sha256 }) => ({ key, locator, sha256 })),
        );
        connection = await pool.getConnection();
        await connection.beginTransaction();
        const result = await applyVisitorV2(connection, { snapshot, images });
        result.manifest.definitionHash = definitionHash;
        await connection.query('UPDATE visitor_example_maintenance SET manifest_json=? WHERE user_id=?', [
          JSON.stringify(result.manifest),
          owner,
        ]);
        const after = await readVisitorV2Snapshot(connection, owner);
        const receipt = {
          owner,
          version: definitions.version,
          definitionHash,
          changes: visitorChanges(snapshot, after),
        };
        await save('candidate.json', receipt);
        if (args.includes('--test-rollback')) throw exampleError('VISITOR_TEST_ROLLBACK');
        await connection.commit();
        connection.release();
        connection = null;
        await save('completed.json', receipt);
        await invalidatePersonalKnowledgeCache(owner, { persist: true }).catch(() => {});
        console.log(JSON.stringify({ mode: 'applied', changes: receipt.changes.length }));
      }
    }
  }
} catch (error) {
  if (connection) await connection.rollback();
  console.error(
    '[visitor-v2] stopped code=%s',
    /^[A-Z][A-Z0-9_]+$/.test(error?.code || '') ? error.code : 'VISITOR_MAINTENANCE_FAILED',
  );
  process.exitCode = 1;
} finally {
  if (connection) connection.release();
  await pool.end();
}
