import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import pool from '../db/index.js';
import { assertLocalTestEnvironment } from '../util/localTestEnvironment.js';
import { hasLoginPassword } from '../util/loginPasswordState.js';
import { verifyPassword } from '../util/password.js';
import { putObjectBodyToObs, getObjectBufferFromObs, getObjectMetadataFromObs, copyObjectInObs, deleteObjectFromObs, createDownloadSignedUrl, createUploadSignedUrl, getObjectRangeFromObs } from '../util/obsClient.js';
import { initiateCloudMultipart, signCloudMultipartPart, listCloudMultipartParts, completeCloudMultipart, abortCloudMultipart } from '../util/cloudMultipartObs.js';
import { sendTrackedEmail } from '../util/emailDelivery.js';

assertLocalTestEnvironment(process.env);
const id = randomUUID();
const key = `local-environment-check/${id}.bin`;
const copyKey = `${key}.copy`;
const multipartKey = `${key}.multipart`;
let uploadId;
let phase = 'database';
try {
  const [[row]] = await pool.query('SELECT VERSION() AS version, DATABASE() AS name');
  assert.match(row.version, /^5\.7\./);
  assert.equal(row.name, 'lightnote_local');
  console.log('[local-check] isolated MySQL 5.7 verified');
  execFileSync(process.execPath, ['scripts/checkSchemaAssertions.js'], { env: process.env, stdio: 'inherit' });
  for (const script of ['checkImagePreviewRuntime.js', 'checkFilePreviewRuntime.js', 'checkOcrRuntime.js', 'checkNoteImportRuntime.js', 'checkDataExportRuntime.js']) {
    execFileSync(process.execPath, [`scripts/${script}`], { env: process.env, stdio: 'inherit' });
  }
  const bytes = Buffer.from([0, 128, 255, 10, 13, 37, 64, 127]);
  await putObjectBodyToObs(key, bytes);
  assert.deepEqual(await getObjectBufferFromObs(key), bytes);
  const metadata = await getObjectMetadataFromObs(key);
  assert.equal(metadata.contentLength, bytes.length);
  await copyObjectInObs(key, copyKey, { sourceEtag: metadata.etag });
  assert.deepEqual(await getObjectBufferFromObs(copyKey), bytes);
  assert.deepEqual(await getObjectRangeFromObs(key, 2, 5), bytes.subarray(2, 6));
  const signed = createDownloadSignedUrl({ objectKey: key });
  const unsigned = new URL(signed.url); unsigned.search = '';
  const denied = await fetch(unsigned, { signal: AbortSignal.timeout(5000) });
  assert.equal(denied.status, 403);
  await denied.body?.cancel();
  const put = createUploadSignedUrl({ objectKey: key, contentType: 'application/octet-stream' });
  const putResult = await fetch(put.url, { method: 'PUT', headers: put.headers, body: bytes });
  assert.equal(putResult.status, 200);
  console.log('[local-check] private object storage, binary, signed upload/download, copy and range verified');
  phase = 'multipart-init';
  const multipart = await initiateCloudMultipart(multipartKey, id, 'application/octet-stream');
  uploadId = multipart.UploadId;
  const part = signCloudMultipartPart(multipartKey, uploadId, 1, 'application/octet-stream');
  const partResult = await fetch(part.uploadUrl, { method: 'PUT', headers: part.headers, body: bytes });
  assert.equal(partResult.status, 200);
  phase = 'multipart-list';
  const parts = await listCloudMultipartParts(multipartKey, uploadId);
  assert.equal(parts.length, 1);
  phase = 'multipart-complete';
  await completeCloudMultipart(multipartKey, uploadId, parts);
  uploadId = null;
  assert.deepEqual(await getObjectBufferFromObs(multipartKey), bytes);
  console.log('[local-check] multipart initiate/upload/list/complete verified');
  phase = 'mail';
  await sendTrackedEmail({ emailType: 'local_test', recipient: 'check@lightnote.test', subject: `本地环境检查 ${id}`, text: '这封邮件仅进入本机 Mailpit。' });
  const inbox = await fetch('http://127.0.0.1:18025/api/v1/messages').then(r => r.json());
  assert.ok(inbox.messages.some(message => message.Subject.includes(id)));
  console.log('[local-check] SMTP capture verified; no external mail sent');
  phase = 'login';
  const accounts = JSON.parse(await fs.readFile(`${process.env.LIGHTNOTE_LOCAL_TEST_DIR}/accounts.json`, 'utf8'));
  let account;
  // 初始化凭据可能已被用户修改；选用仍有效的测试账号，不重置现有密码。
  for (const role of ['test', 'user', 'root']) {
    const candidate = accounts.find(item => item.role === role);
    if (!candidate) continue;
    const [users] = await pool.query('SELECT password, role, del_flag, login_password_set FROM user WHERE id=? AND email=?', [candidate.id, candidate.email]);
    const user = users[0];
    if (!user || Number(user.del_flag) !== 0 || !hasLoginPassword(user) || !(await verifyPassword(candidate.password, user.password))) continue;
    account = { ...candidate, role: user.role };
    break;
  }
  assert.ok(account, 'LOCAL_TEST_SAVED_LOGIN_CREDENTIALS_UNAVAILABLE');
  const login = await fetch('http://127.0.0.1:15173/api/user/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: account.email, password: account.password }) }).then(r => r.json());
  assert.equal(login.status, 200);
  assert.equal(login.data.role, account.role);
  assert.ok(login.data.sid);
  phase = 'workers';
  const state = JSON.parse(await fs.readFile(`${process.env.LIGHTNOTE_LOCAL_TEST_DIR}/processes.json`, 'utf8'));
  for (const child of state.children.filter(child => child.label.endsWith('-worker'))) process.kill(child.pid, 0);
  assert.equal(state.children.filter(child => child.label.endsWith('-worker')).length, 6);
  console.log('[local-check] frontend proxy, local login and six Workers verified');
} catch (error) {
  console.error('[local-check] failed phase=%s code=%s obsStatus=%s obsCode=%s', phase, error?.code || 'LOCAL_CHECK_FAILED', Number(error?.obsStatus) || '', /^[A-Za-z0-9_]+$/.test(error?.obsCode || '') ? error.obsCode : '');
  if (error?.name === 'AssertionError') console.error('[local-check] assertion:', String(error.message).slice(0, 300));
  process.exitCode = 1;
} finally {
  if (uploadId) await abortCloudMultipart(multipartKey, uploadId).catch(() => {});
  for (const objectKey of [key, copyKey, multipartKey]) await deleteObjectFromObs(objectKey).catch(() => {});
  await pool.end();
  process.exit(process.exitCode || 0);
}
