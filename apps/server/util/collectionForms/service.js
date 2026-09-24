import crypto from 'node:crypto';
import { requireIdentityConfig, respondentHash } from './identity.js';
import { FormError, validateDefinition, validateAnswers } from '@lightnote/shared/collection-forms';
import { insertData } from '../agent/data.js';
const sqlDate = (d) => new Date(d).toISOString().slice(0, 23).replace('T', ' ');
const canonical = (value) =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, v[k]]),
        )
      : v,
  );
const json = (v) => (typeof v === 'string' ? JSON.parse(v) : v);
const view = (row) => ({ ...row, definition: json(row.definition), tagIds: row.tag_ids ? row.tag_ids.split(',') : [] });
const enabled = () => {
  if (process.env.COLLECTION_FORMS_ENABLED === 'false') throw new FormError('公开收集暂时停用', 503);
};
export function responseFilter(query = {}, alias = 's', statistics = false) {
  const clauses = [],
    params = [];
  if (query.from && query.to && query.from > query.to) throw new FormError('开始日期不能晚于结束日期');
  for (const [key, op] of [
    ['from', '>='],
    ['to', '<'],
  ]) {
    if (!query[key]) continue;
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(query[key]) ||
      !Number.isFinite(Date.parse(query[key])) ||
      new Date(query[key]).toISOString().slice(0, 10) !== query[key]
    )
      throw new FormError('日期范围无效');
    const date = new Date(`${query[key]}T00:00:00+08:00`);
    if (key === 'to') date.setUTCDate(date.getUTCDate() + 1);
    clauses.push(`${alias}.created_at ${op} ?`);
    params.push(sqlDate(date));
  }
  if (!statistics) {
    if (query.state === 'unread') clauses.push(`${alias}.is_read = 0`);
    if (query.state === 'processed') clauses.push(`${alias}.processed = 1`);
    if (query.state === 'pending') clauses.push(`${alias}.processed = 0`);
    if (query.state === 'spam') clauses.push(`${alias}.spam = 1`);
    else if (query.state !== 'all') clauses.push(`${alias}.spam = 0`);
  }
  return { sql: clauses.length ? ' AND ' + clauses.join(' AND ') : '', params };
}
export function createFormsService(pool) {
  const rows = async (db, sql, values = []) => (await db.query(sql, values))[0];
  async function transaction(fn) {
    const db = await pool.getConnection();
    try {
      await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      await db.beginTransaction();
      const result = await fn(db);
      await db.commit();
      return result;
    } catch (e) {
      await db.rollback();
      throw e;
    } finally {
      db.release();
    }
  }
  async function activeOwner(db, userId, lock = false) {
    const [user] = await rows(db, 'SELECT id, role, del_flag FROM user WHERE id = ?' + (lock ? ' FOR UPDATE' : ''), [
      userId,
    ]);
    if (!user || Number(user.del_flag) !== 0 || ['visitor', 'deleted'].includes(user.role))
      throw new FormError('收集页面不可用', 404);
    const restrictions = await rows(
      db,
      `SELECT restriction_type FROM security_account_restrictions WHERE user_id=? AND status='active' AND (expires_at IS NULL OR expires_at>NOW()) AND restriction_type IN (?) LIMIT 1`,
      [userId, lock ? ['login_lock', 'full_lock', 'write_lock'] : ['login_lock', 'full_lock']],
    );
    if (restrictions.length) throw new FormError('收集页面不可用', 404);
  }
  async function owned(db, userId, id, lock = false) {
    if (lock) await activeOwner(db, userId, true);
    const [form] = await rows(
      db,
      'SELECT * FROM collection_forms WHERE id = ? AND user_id = ?' + (lock ? ' FOR UPDATE' : ''),
      [id, userId],
    );
    if (!form) throw new FormError('表单不存在', 404);
    return view(form);
  }
  async function setTags(db, userId, formId, tagIds = []) {
    if (!Array.isArray(tagIds) || tagIds.length > 30 || tagIds.some((t) => typeof t !== 'string' || t.length > 255))
      throw new FormError('标签无效');
    const unique = [...new Set(tagIds)];
    if (unique.length) {
      const tags = await rows(db, 'SELECT id FROM tag WHERE user_id = ? AND del_flag = 0 AND id IN (?) FOR UPDATE', [
        userId,
        unique,
      ]);
      if (tags.length !== unique.length) throw new FormError('标签不存在');
    }
    await db.query('DELETE FROM collection_form_tags WHERE form_id = ?', [formId]);
    for (const tagId of unique)
      await db.query('INSERT INTO collection_form_tags SET ?', [insertData({ formId, tagId, userId })]);
  }
  async function list(userId, query = {}) {
    const params = [userId],
      clauses = [];
    if (query.tagId) {
      clauses.push(
        'EXISTS (SELECT 1 FROM collection_form_tags ft INNER JOIN tag t ON t.id=ft.tag_id AND t.del_flag=0 WHERE ft.form_id=f.id AND ft.tag_id=?)',
      );
      params.push(query.tagId);
    }
    if (['draft', 'collecting', 'paused', 'ended'].includes(query.status)) {
      clauses.push('f.status=?');
      params.push(query.status);
    }
    if (query.search) {
      clauses.push('f.title LIKE ?');
      params.push('%' + String(query.search).slice(0, 200) + '%');
    }
    return rows(
      pool,
      `SELECT f.id,f.title,f.status,f.version,f.updated_at,
      (SELECT COUNT(*) FROM collection_submissions s WHERE s.form_id=f.id) AS total,
      (SELECT COUNT(*) FROM collection_submissions s WHERE s.form_id=f.id AND s.is_read=0 AND s.spam=0) AS unread
      FROM collection_forms f WHERE f.user_id=? ${clauses.length ? 'AND ' + clauses.join(' AND ') : ''} ORDER BY f.updated_at DESC, f.id LIMIT 500`,
      params,
    );
  }
  async function get(userId, id) {
    const form = await owned(pool, userId, id);
    form.tagIds = (
      await rows(
        pool,
        'SELECT ft.tag_id FROM collection_form_tags ft INNER JOIN tag t ON t.id=ft.tag_id AND t.del_flag=0 WHERE ft.form_id=?',
        [id],
      )
    ).map((x) => x.tag_id);
    return form;
  }
  async function create(userId, input) {
    enabled();
    const definition = validateDefinition(input.definition);
    definition.submissionPolicy = 'replace';
    return transaction(async (db) => {
      await activeOwner(db, userId, true);
      const [{ total }] = await rows(db, 'SELECT COUNT(*) total FROM collection_forms WHERE user_id=?', [userId]);
      if (total >= 500) throw new FormError('最多保留 500 个表单');
      const data = insertData({
        userId,
        publicId: crypto.randomBytes(24).toString('hex'),
        title: definition.title,
        definition: JSON.stringify(definition),
        createdAt: sqlDate(new Date()),
        updatedAt: sqlDate(new Date()),
      });
      await db.query('INSERT INTO collection_forms SET ?', [data]);
      await setTags(db, userId, data.id, input.tagIds);
      return { id: data.id };
    });
  }
  async function update(userId, id, input) {
    return transaction(async (db) => {
      const form = await owned(db, userId, id, true);
      if (input.version !== form.version) throw new FormError('表单已更新，请重新加载后操作', 409);
      const definition = validateDefinition(input.definition);
      if (!form.published) definition.submissionPolicy = 'replace';
      if (form.published && canonical(definition.questions) !== canonical(form.definition.questions))
        throw new FormError('发布后题目已锁定，请复制为新表单', 409);
      if (
        form.published &&
        (definition.submissionPolicy ?? 'multiple') !== (form.definition.submissionPolicy ?? 'multiple')
      )
        throw new FormError('发布后重复提交规则已锁定，请复制为新表单', 409);
      await db.query(
        'UPDATE collection_forms SET definition=?, title=?, version=version+1, updated_at=UTC_TIMESTAMP(3) WHERE id=?',
        [JSON.stringify(definition), definition.title, id],
      );
      await setTags(db, userId, id, input.tagIds);
      return { version: form.version + 1 };
    });
  }
  async function action(userId, id, input) {
    if (input.action === 'copy') {
      const form = await get(userId, id);
      return create(userId, {
        definition: { ...form.definition, title: form.title.slice(0, 190) + '（副本）' },
        tagIds: form.tagIds,
      });
    }
    return transaction(async (db) => {
      const form = await owned(db, userId, id, true);
      if (input.version !== form.version) throw new FormError('表单已更新，请重新加载', 409);
      if (input.action === 'delete') {
        if (form.status === 'collecting') throw new FormError('请先暂停或结束收集');
        await db.query('DELETE FROM collection_forms WHERE id=?', [id]);
        return { deleted: true };
      }
      const next = { publish: 'collecting', pause: 'paused', resume: 'collecting', end: 'ended' }[input.action];
      const allowed = { draft: ['publish'], collecting: ['pause', 'end'], paused: ['resume', 'end'], ended: [] };
      if (!allowed[form.status]?.includes(input.action)) throw new FormError('当前状态不支持此操作', 409);
      if (input.action === 'publish' && !form.published) {
        form.definition.submissionPolicy = 'replace';
        await db.query('UPDATE collection_forms SET definition=? WHERE id=?', [JSON.stringify(form.definition), id]);
      }
      if (next === 'collecting') {
        enabled();
        if (form.definition.submissionPolicy === 'replace') requireIdentityConfig();
        if (!form.definition.questions.length) throw new FormError('请至少添加一道题');
      }
      await db.query(
        'UPDATE collection_forms SET status=?,published=1,version=version+1,updated_at=UTC_TIMESTAMP(3) WHERE id=?',
        [next, id],
      );
      return { status: next };
    });
  }
  async function publicForm(publicId, identity = null) {
    const [form] = await rows(pool, 'SELECT * FROM collection_forms WHERE public_id=? AND published=1', [publicId]);
    if (!form) throw new FormError('收集页面不存在', 404);
    await activeOwner(pool, form.user_id);
    const definition = json(form.definition);
    let mySubmission = null;
    if (definition.submissionPolicy === 'replace') {
      requireIdentityConfig();
      if (identity) {
        const [prior] = await rows(
          pool,
          'SELECT id,answers FROM collection_submissions WHERE form_id=? AND respondent_hash=?',
          [form.id, respondentHash(form.id, identity)],
        );
        if (prior) mySubmission = { receipt: prior.id, answers: json(prior.answers) };
      }
    }
    return {
      submissionPolicy: definition.submissionPolicy ?? 'multiple',
      mySubmission,
      status: process.env.COLLECTION_FORMS_ENABLED === 'false' && form.status === 'collecting' ? 'paused' : form.status,
      definition,
    };
  }
  async function submit(publicId, input, identity = null) {
    if (!input || typeof input.requestKey !== 'string' || !/^[a-zA-Z0-9_-]{16,64}$/.test(input.requestKey))
      throw new FormError('提交凭证无效');
    const [candidate] = await rows(pool, 'SELECT id,user_id FROM collection_forms WHERE public_id=?', [publicId]);
    if (!candidate) throw new FormError('收集页面不存在', 404);
    return transaction(async (db) => {
      const form = await owned(db, candidate.user_id, candidate.id, true);
      const replace = form.definition.submissionPolicy === 'replace';
      if (replace) {
        requireIdentityConfig();
        if (!identity) throw new FormError('请允许本站 Cookie 后重新打开表单再提交', 400);
      }
      const browserHash = replace ? respondentHash(form.id, identity) : null;
      const answers = validateAnswers(form.definition, input.answers);
      const hash = crypto.createHash('sha256').update(canonical(answers)).digest('hex');
      const [prior] = await rows(
        db,
        'SELECT submission_id,payload_hash,respondent_hash,outcome FROM collection_submission_requests WHERE form_id=? AND request_key=? FOR UPDATE',
        [form.id, input.requestKey],
      );
      if (prior) {
        if (prior.respondent_hash !== browserHash) throw new FormError('提交凭证无效', 409);
        if (prior.payload_hash !== hash) throw new FormError('此凭证已提交其他内容', 409);
        return { receipt: prior.submission_id, outcome: prior.outcome };
      }
      enabled();
      if (form.status !== 'collecting')
        throw new FormError(form.status === 'ended' ? '收集已结束' : '暂未开放收集', 409);
      const [previous] = replace
        ? await rows(
            db,
            'SELECT id,payload_hash FROM collection_submissions WHERE form_id=? AND respondent_hash=? FOR UPDATE',
            [form.id, browserHash],
          )
        : [];
      if (input.expectedReceipt != null && (!replace || previous?.id !== input.expectedReceipt))
        throw new FormError('未能识别之前的提交，请使用原浏览器和原填写地址重新打开', 409);
      const changed = previous && previous.payload_hash !== hash;
      const outcome = previous ? (changed ? 'updated' : 'unchanged') : 'created';
      const data =
        previous ||
        insertData({
          formId: form.id,
          requestKey: input.requestKey,
          payloadHash: hash,
          respondentHash: browserHash,
          answers: JSON.stringify(answers),
          createdAt: sqlDate(new Date()),
          updatedAt: sqlDate(new Date()),
        });
      if (!previous) await db.query('INSERT INTO collection_submissions SET ?', [data]);
      else if (changed) {
        await db.query(
          'UPDATE collection_submissions SET answers=?,payload_hash=?,updated_at=UTC_TIMESTAMP(3),is_read=0,processed=0 WHERE id=?',
          [JSON.stringify(answers), hash, data.id],
        );
        await db.query('DELETE FROM collection_answers WHERE submission_id=?', [data.id]);
      }
      if (!previous || changed) {
        for (const q of form.definition.questions) {
          const value = answers[q.id];
          if (value === undefined) continue;
          const answer = insertData({
            submissionId: data.id,
            formId: form.id,
            questionId: q.id,
            textValue: typeof value === 'string' ? value : null,
            numberValue: typeof value === 'number' ? value : null,
          });
          await db.query('INSERT INTO collection_answers SET ?', [answer]);
          if (q.type === 'single' || q.type === 'multiple')
            for (const optionId of Array.isArray(value) ? value : [value])
              await db.query('INSERT INTO collection_choices SET ?', [insertData({ answerId: answer.id, optionId })]);
        }
      }
      await db.query('INSERT INTO collection_submission_requests SET ?', [
        insertData({
          formId: form.id,
          submissionId: data.id,
          requestKey: input.requestKey,
          payloadHash: hash,
          respondentHash: browserHash,
          outcome,
        }),
      ]);
      return { receipt: data.id, outcome };
    });
  }
  async function responses(userId, id, query = {}) {
    const watermark = new Date().toISOString();
    await owned(pool, userId, id);
    const filter = responseFilter(query),
      page = Math.max(1, Math.min(100000, Math.floor(Number(query.page) || 1)));
    const [{ total }] = await rows(
      pool,
      'SELECT COUNT(*) total FROM collection_submissions s WHERE s.form_id=?' + filter.sql,
      [id, ...filter.params],
    );
    const items = await rows(
      pool,
      "SELECT s.id,s.form_id,s.answers,s.is_read,s.processed,s.spam,s.private_note,DATE_FORMAT(s.created_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS created_at,DATE_FORMAT(COALESCE(s.updated_at,s.created_at),'%Y-%m-%dT%H:%i:%s.%fZ') AS updated_at FROM collection_submissions s WHERE s.form_id=?" +
        filter.sql +
        ' ORDER BY s.created_at DESC,s.id DESC LIMIT 30 OFFSET ?',
      [id, ...filter.params, (page - 1) * 30],
    );
    return {
      items: items.map(({ request_key, payload_hash, ...s }) => ({ ...s, answers: json(s.answers) })),
      total,
      page,
      watermark,
    };
  }
  async function mark(userId, id, input) {
    return transaction(async (db) => {
      await owned(db, userId, id, true);
      if (input.action === 'readAll') {
        const before = new Date(input.before);
        if (!Number.isFinite(+before)) throw new FormError('时间无效');
        await db.query(
          'UPDATE collection_submissions SET is_read=1 WHERE form_id=? AND created_at<=? AND COALESCE(updated_at,created_at)<=?',
          [id, sqlDate(before), sqlDate(before)],
        );
        return {};
      }
      if (
        !Array.isArray(input.ids) ||
        !input.ids.length ||
        input.ids.length > 100 ||
        input.ids.some((x) => typeof x !== 'string' || x.length > 36)
      )
        throw new FormError('请选择提交记录');
      const fields = {
        read: 'is_read',
        unread: 'is_read',
        processed: 'processed',
        pending: 'processed',
        spam: 'spam',
        restore: 'spam',
        note: 'private_note',
      };
      const field = Object.hasOwn(fields, input.action) ? fields[input.action] : null;
      if (!field) throw new FormError('操作无效');
      let value = ['unread', 'pending', 'restore'].includes(input.action) ? 0 : 1;
      if (input.action === 'note') {
        if (typeof input.note !== 'string' || input.note.length > 5000) throw new FormError('备注最多 5000 字');
        value = input.note;
      }
      await db.query(`UPDATE collection_submissions SET ${field}=? WHERE form_id=? AND id IN (?)`, [
        value,
        id,
        input.ids,
      ]);
      return {};
    });
  }
  async function statistics(userId, id, query = {}) {
    return transaction(async (db) => {
      const form = await owned(db, userId, id),
        f = responseFilter(query, 's', true),
        args = [id, ...f.params];
      const where = 's.form_id=?' + f.sql;
      const [summary] = await rows(
        db,
        `SELECT COUNT(*) total,COALESCE(SUM(s.spam=0),0) valid,COALESCE(SUM(s.spam=1),0) spam FROM collection_submissions s WHERE ${where}`,
        args,
      );
      const trend = await rows(
        db,
        `SELECT DATE_FORMAT(DATE_ADD(s.created_at,INTERVAL 8 HOUR),'%Y-%m-%d') day,COUNT(*) count FROM collection_submissions s WHERE ${where} AND s.spam=0 GROUP BY day ORDER BY day`,
        args,
      );
      const aggregates = await rows(
        db,
        `SELECT a.question_id,COUNT(*) answered,MIN(a.number_value) minimum,MAX(a.number_value) maximum,AVG(a.number_value) average FROM collection_answers a INNER JOIN collection_submissions s ON s.id=a.submission_id WHERE ${where} AND s.spam=0 GROUP BY a.question_id`,
        args,
      );
      const choices = await rows(
        db,
        `SELECT a.question_id,c.option_id,COUNT(*) count FROM collection_choices c INNER JOIN collection_answers a ON a.id=c.answer_id INNER JOIN collection_submissions s ON s.id=a.submission_id WHERE ${where} AND s.spam=0 GROUP BY a.question_id,c.option_id`,
        args,
      );
      const values = await rows(
        db,
        `SELECT a.question_id,COALESCE(CAST(a.number_value AS CHAR),a.text_value) value,COUNT(*) count FROM collection_answers a INNER JOIN collection_submissions s ON s.id=a.submission_id WHERE ${where} AND s.spam=0 AND a.question_id IN (?) GROUP BY a.question_id,value ORDER BY value`,
        [
          ...args,
          form.definition.questions
            .filter((q) => ['rating', 'date'].includes(q.type))
            .map((q) => q.id)
            .concat('__none__'),
        ],
      );
      return {
        summary,
        trend,
        questions: form.definition.questions.map((q) => ({
          ...q,
          ...aggregates.find((a) => a.question_id === q.id),
          answered: Number(aggregates.find((a) => a.question_id === q.id)?.answered || 0),
          choices: choices.filter((a) => a.question_id === q.id),
          values: values.filter((a) => a.question_id === q.id),
        })),
      };
    });
  }
  async function textAnswers(userId, id, query) {
    const form = await owned(pool, userId, id);
    if (!form.definition.questions.some((q) => q.id === query.questionId && ['short', 'long'].includes(q.type)))
      throw new FormError('题目无效');
    const f = responseFilter(query, 's', true),
      page = Math.max(1, Math.min(100000, Math.floor(Number(query.page) || 1)));
    return rows(
      pool,
      `SELECT a.text_value,s.created_at FROM collection_answers a INNER JOIN collection_submissions s ON s.id=a.submission_id WHERE s.form_id=? AND s.spam=0 AND a.question_id=?${f.sql} AND a.text_value LIKE ? ORDER BY s.created_at DESC,s.id DESC LIMIT 30 OFFSET ?`,
      [id, query.questionId, ...f.params, '%' + String(query.search || '').slice(0, 200) + '%', (page - 1) * 30],
    );
  }
  async function* exportRows(userId, id, query) {
    await owned(pool, userId, id);
    const db = await pool.getConnection();
    try {
      // One repeatable-read snapshot keeps CSV consistent while owners moderate responses.
      await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      await db.beginTransaction();
      const f = responseFilter(query);
      let cursor = null;
      while (true) {
        const extra = cursor ? ' AND (s.created_at>? OR (s.created_at=? AND s.id>?))' : '';
        const chunk = await rows(
          db,
          `SELECT s.id,s.form_id,s.answers,s.is_read,s.processed,s.spam,s.private_note,DATE_FORMAT(s.created_at,'%Y-%m-%dT%H:%i:%s.%fZ') AS created_at,DATE_FORMAT(COALESCE(s.updated_at,s.created_at),'%Y-%m-%dT%H:%i:%s.%fZ') AS updated_at FROM collection_submissions s WHERE s.form_id=?${f.sql}${extra} ORDER BY s.created_at,s.id LIMIT 500`,
          [id, ...f.params, ...(cursor ? [sqlDate(cursor.created_at), sqlDate(cursor.created_at), cursor.id] : [])],
        );
        if (!chunk.length) break;
        for (const row of chunk) yield { ...row, answers: json(row.answers) };
        cursor = chunk.at(-1);
      }
      await db.commit();
    } finally {
      await db.rollback();
      db.release();
    }
  }
  return {
    list,
    get,
    create,
    update,
    action,
    publicForm,
    submit,
    responses,
    mark,
    statistics,
    textAnswers,
    exportRows,
  };
}
