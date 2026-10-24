import pool from '../../db/index.js';
import { PUBLIC_RESOURCE_LIMITS } from '@lightnote/shared/public-resources';
import {
  access,
  digest,
  fail,
  fields,
  first,
  PublicResourceError,
  ready,
  receiptValue,
  transaction,
  uuid,
  write,
} from './core.js';
import { publicMaterial, sourceInput } from './material.js';
import { submit, withdraw } from './publications.js';
import { decide } from './moderation.js';

function bounded(items, key) {
  if (
    !Array.isArray(items) ||
    !items.length ||
    items.length > PUBLIC_RESOURCE_LIMITS.selection ||
    new Set(items.map(key)).size !== items.length
  )
    fail('INVALID_INPUT');
}

/** Read complete selected materials in bounded queries; never return the batch's private bodies. */
export async function prepareBatch({ user, input, db = pool, env = process.env }) {
  await access(db, user);
  await ready(db, env, 'submit');
  fields(input, ['items']);
  bounded(input.items, (item) => `${item?.kind}:${item?.sourceId}`);
  input.items.forEach((item) => {
    fields(item, ['kind', 'sourceId']);
    sourceInput(item);
  });
  const sources = new Map(),
    publications = new Map();
  for (const kind of ['note', 'bookmark']) {
    const ids = input.items.filter((item) => item.kind === kind).map((item) => item.sourceId);
    for (let offset = 0; offset < ids.length; offset += 20) {
      const chunk = ids.slice(offset, offset + 20),
        marks = chunk.map(() => '?').join(',');
      const [rows] = await db.query(
        kind === 'note'
          ? `SELECT id,title,type,CASE WHEN OCTET_LENGTH(content)<=200000 THEN content ELSE NULL END AS content,
           OCTET_LENGTH(content)>200000 AS too_large FROM note WHERE create_by=? AND del_flag=0 AND id IN (${marks})`
          : `SELECT id,name AS title,url,description FROM bookmark WHERE user_id=? AND del_flag=0 AND id IN (${marks})`,
        [user.id, ...chunk],
      );
      rows.forEach((row) => sources.set(`${kind}:${row.id}`, row));
      const [published] = await db.query(
        `SELECT source_id,version,removed FROM public_resource_publications WHERE owner_id=? AND kind=? AND source_id IN (${marks})`,
        [user.id, kind, ...chunk],
      );
      published.forEach((row) => publications.set(`${kind}:${row.source_id}`, row));
    }
  }
  return {
    items: input.items.map((item) => {
      const key = `${item.kind}:${item.sourceId}`,
        source = sources.get(key),
        publication = publications.get(key);
      try {
        if (!source) fail('SOURCE_UNAVAILABLE', 404);
        if (Number(publication?.removed)) fail('REMOVED', 423);
        if (source.too_large) fail('TOO_LARGE');
        const material = publicMaterial(item.kind, source);
        return {
          ...item,
          title: material.title,
          fingerprint: material.fingerprint,
          expectedVersion: Number(publication?.version || 0),
          code: '',
        };
      } catch (error) {
        if (!(error instanceof PublicResourceError)) throw error;
        return { ...item, code: error.code };
      }
    }),
  };
}

/** One admission per intent, independent item transactions and receipts, no background batch lifecycle. */
async function performBatch({ user, input, db = pool, env = process.env }, root) {
  fields(input, ['requestId', 'action', 'items']);
  uuid(input.requestId);
  if (!(root ? ['approve', 'reject'] : ['submit', 'withdraw']).includes(input.action)) fail('INVALID_INPUT');
  bounded(input.items, (item) => item?.requestId);
  bounded(input.items, (item) => (input.action === 'submit' ? `${item?.kind}:${item?.sourceId}` : item?.publicId));
  for (const item of input.items) {
    fields(
      item,
      input.action === 'submit'
        ? ['requestId', 'kind', 'sourceId', 'fingerprint', 'expectedVersion', 'confirmed']
        : ['requestId', 'publicId', 'expectedVersion', ...(root ? ['reason'] : [])],
    );
    uuid(item.requestId);
    if (item.requestId === input.requestId) fail('INVALID_INPUT');
    if (input.action === 'submit') sourceInput(item);
    else uuid(item.publicId);
    if (!Number.isSafeInteger(item.expectedVersion) || item.expectedVersion < 0) fail('INVALID_INPUT');
  }
  const mode = input.action === 'submit' ? 'submit' : 'safety';
  // Admission binds the complete immutable intent. Reusing its ID with changed material is a conflict.
  const admission = await write(
    {
      user,
      input,
      action: 'batch',
      root,
      mode,
      db,
      env,
      batchId: input.requestId,
    },
    async () => ({ __publicResourcePendingBatch: true }),
  );
  if (Array.isArray(admission?.items)) return admission;
  if (admission?.__publicResourcePendingBatch !== true) fail('REQUEST_REUSED', 409);
  const items = [];
  let fatal = null;
  for (const item of input.items) {
    const { publicId, ...body } = item;
    try {
      if (fatal) throw fatal;
      const options = {
        user,
        input: root ? { ...body, action: input.action } : body,
        id: publicId,
        db,
        env,
        batchId: input.requestId,
      };
      const result = await (root ? decide : input.action === 'submit' ? submit : withdraw)(options);
      items.push({ requestId: item.requestId, state: result.reused ? 'reused' : 'success', result });
    } catch (error) {
      const known = error instanceof PublicResourceError;
      const noWrite =
        known &&
        ['CLOSED', 'READ_ONLY', 'RATE_LIMITED', 'ACCOUNT_UNAVAILABLE', 'FORBIDDEN', 'LOGIN_REQUIRED'].some(
          (code) => error.code === `PUBLIC_RESOURCE_${code}`,
        );
      items.push({
        requestId: item.requestId,
        state: known && (error.status < 500 || noWrite) ? 'failed' : 'unknown',
        code: known ? error.code : 'PUBLIC_RESOURCE_UNAVAILABLE',
        status: known ? error.status : 503,
      });
      if (
        known &&
        ['LOGIN_REQUIRED', 'ACCOUNT_UNAVAILABLE', 'FORBIDDEN', 'CLOSED', 'READ_ONLY', 'RATE_LIMITED'].some(
          (code) => error.code === `PUBLIC_RESOURCE_${code}`,
        )
      )
        fatal = error;
    }
  }
  // The aggregate receipt is only a transport convenience; item receipts remain authoritative.
  return transaction(db, async (c) => {
    await access(c, user, { lock: true, root });
    const row = await first(
      c,
      'SELECT request_hash,result FROM public_resource_receipts WHERE actor_id=? AND request_id=? FOR UPDATE',
      [user.id, input.requestId],
    );
    if (!row || row.request_hash !== digest({ action: 'batch', input })) fail('REQUEST_REUSED', 409);
    const saved = receiptValue(row.result);
    if (Array.isArray(saved?.items)) return saved;
    if (saved?.__publicResourcePendingBatch !== true) fail('REQUEST_REUSED', 409);
    const result = { items };
    await c.query('UPDATE public_resource_receipts SET result=? WHERE actor_id=? AND request_id=?', [
      JSON.stringify({ __publicResourceBatch: input.requestId, value: result }),
      user.id,
      input.requestId,
    ]);
    return result;
  });
}
export const authorBatch = (options) => performBatch(options, false);
export const moderationBatch = (options) => performBatch(options, true);
