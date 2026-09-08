import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import * as manifest from './visitorExamples/manifest.mjs';
const apply = process.argv.includes('--apply');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? fallback : process.argv[i + 1];
};
const stateDir = path.resolve(
  arg('--state-dir', path.join(os.homedir(), '.local/state/light-note/visitor-resources-v1')),
);
const artifactDir = path.resolve(
  arg('--artifacts', fileURLToPath(new URL('./visitorExamples/assets', import.meta.url))),
);
process.env.ALLOW_REMOTE_DATABASE_READS = apply ? 'false' : 'true';
process.env.ALLOW_REMOTE_DATABASE_WRITES = apply ? 'true' : 'false';
const { default: pool } = await import('../db/index.js');
const { readVisitorSnapshot, snapshotHash, buildVisitorPlan, applyVisitorPlan } =
  await import('../util/services/visitorExampleMaintenanceService.js');
const { buildManagedCloudObjectKey } = await import('../util/services/managedCloudUploadService.js');
const { putObjectToObs, getObjectBufferFromObs } = await import('../util/obsClient.js');
const { getUserSpaceMb } = await import('../util/growth.js');
const { invalidatePersonalKnowledgeCache } = await import('../util/personalKnowledgeSearch.js');
async function save(name, data) {
  await fs.mkdir(stateDir, { recursive: true, mode: 0o700 });
  const temporary = path.join(stateDir, `${name}.${process.pid}.tmp`);
  await fs.writeFile(temporary, JSON.stringify(data, null, 2), { mode: 0o600 });
  await fs.rename(temporary, path.join(stateDir, name));
}
async function read(name) {
  try {
    return JSON.parse(await fs.readFile(path.join(stateDir, name), 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const contentHash = hash(
  JSON.stringify({
    notes: manifest.visitorNotes,
    files: manifest.files,
    associations: manifest.associations,
  }),
);
let connection;
try {
  const [users] = await pool.query(
    "SELECT id FROM user WHERE role='visitor' AND del_flag=0 ORDER BY create_time LIMIT 1",
  );
  assert.equal(users.length, 1);
  const owner = users[0].id;
  const current = await readVisitorSnapshot(pool, owner);
  let done = await read('completed.json');
  const candidate = await read('candidate.json');
  if (!done && candidate?.contentHash === contentHash && candidate.afterHash === snapshotHash(current)) {
    done = candidate;
    await save('completed.json', done);
  }
  if (done) {
    assert.equal(done.contentHash, contentHash, 'MANIFEST_CHANGED');
    const savedUploads = await read('uploads.json');
    for (const file of manifest.files)
      assert.equal(
        hash(await fs.readFile(path.join(artifactDir, file.name))),
        savedUploads?.find((x) => x.name === file.name)?.sha256,
        'ARTIFACT_CHANGED',
      );
    const before = await read('before.json');
    const expected = buildVisitorPlan(before, manifest);
    for (const b of expected.bookmarks) {
      const actual = current.tables.bookmark.find((x) => x.id === b.id);
      assert(
        actual &&
          Number(actual.del_flag) === 0 &&
          actual.name === b.name &&
          actual.url === b.url &&
          actual.description === b.description,
        'VISITOR_BOOKMARK_CHANGED',
      );
    }
    for (const n of expected.notes) {
      const actual = current.tables.note.find((x) => x.id === n.id);
      assert(
        actual && Number(actual.del_flag) === 0 && actual.title === n.title && actual.type === n.type,
        'VISITOR_NOTE_CHANGED',
      );
    }
    assert.equal(current.tables.bookmark.filter((x) => Number(x.del_flag) === 0).length, done.counts.bookmarks);
    assert.equal(current.tables.note.filter((x) => Number(x.del_flag) === 0).length, done.counts.notes);
    assert.equal(current.tables.files.filter((x) => Number(x.del_flag) === 0).length, done.counts.files);
    // A completed version never reapplies writes. Full backups remain available even if preview workers update derived metadata.
    console.log(JSON.stringify({ mode: 'verified-no-op', ...done.counts }));
  } else {
    const old = await read('before.json');
    if (!old)
      assert(
        !manifest.visitorNotes.some(
          (n) => !n.existing && current.tables.note.some((row) => row.id === manifest.stableId(`note:${n.key}`)),
        ),
        'EXISTING_VERSION_REQUIRES_ORIGINAL_STATE_DIRECTORY',
      );
    if (old) {
      if (!old.related) {
        const { related, ...core } = current;
        assert.equal(snapshotHash(old), snapshotHash(core), 'VISITOR_CHANGED_SINCE_BACKUP');
        await save('before.json', current);
      } else assert.equal(snapshotHash(old), snapshotHash(current), 'VISITOR_CHANGED_SINCE_BACKUP');
    } else await save('before.json', current);
    const plan = buildVisitorPlan(current, manifest);
    const summary = {
      mode: apply ? 'apply' : 'dry-run',
      bookmarks: plan.bookmarks.length + plan.retained.length,
      retainedReferenced: plan.retained.length,
      archiveBookmarks: plan.archive.length,
      notes: 16,
      newFiles: manifest.files.length,
    };
    console.log(JSON.stringify(summary));
    await save('plan.json', {
      contentHash,
      summary,
      bookmarks: plan.bookmarks.map((x) => ({ id: x.id, name: x.name, url: x.url })),
      archive: plan.archive.map((x) => ({ id: x.id, name: x.name })),
      retained: plan.retained.map((x) => ({ id: x.id, name: x.name })),
      notes: plan.notes.map((x) => ({ id: x.id, title: x.title })),
    });
    if (apply) {
      let uploads = (await read('uploads.json')) || [];
      for (const file of manifest.files) {
        const local = path.join(artifactDir, file.name);
        const bytes = await fs.readFile(local);
        const sha256 = hash(bytes);
        let upload = uploads.find((x) => x.name === file.name);
        if (!upload) {
          upload = {
            name: file.name,
            sha256,
            objectKey: buildManagedCloudObjectKey(owner, file.name),
            uploaded: false,
          };
          uploads.push(upload);
          await save('uploads.json', uploads);
        }
        assert.equal(upload.sha256, sha256, 'ARTIFACT_CHANGED');
        if (!upload.uploaded) {
          await putObjectToObs(upload.objectKey, local, file.type);
          upload.uploaded = true;
          await save('uploads.json', uploads);
        }
        const remote = await getObjectBufferFromObs(upload.objectKey, { maxBytes: bytes.length + 1 });
        assert.equal(hash(remote), sha256, 'UPLOAD_HASH_MISMATCH');
      }
      const quotaMB = await getUserSpaceMb(owner, 'visitor');
      connection = await pool.getConnection();
      await connection.beginTransaction();
      const counts = await applyVisitorPlan(connection, {
        snapshot: current,
        manifest,
        uploads,
        quotaMB,
        failBeforeCommit: process.argv.includes('--test-rollback'),
      });
      const after = await readVisitorSnapshot(connection, owner);
      // Save transaction candidate before commit so interrupted commits can be reconciled without repeating writes.
      await save('candidate.json', { contentHash, counts, afterHash: snapshotHash(after) });
      await connection.commit();
      connection.release();
      connection = null;
      await save('completed.json', { contentHash, counts, afterHash: snapshotHash(after) });
      await invalidatePersonalKnowledgeCache(owner, { persist: true });
      console.log(JSON.stringify({ mode: 'applied', ...counts }));
    }
  }
} catch (e) {
  if (connection) await connection.rollback();
  console.error('Visitor maintenance stopped:', e.code || e.message?.split('\n')[0] || 'ERROR');
  process.exitCode = 1;
} finally {
  if (connection) connection.release();
  await pool.end();
}
