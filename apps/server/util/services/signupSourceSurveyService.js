import pool from '../../db/index.js';
import { createNotification } from '../notification.js';
import { notificationPresentation } from '@lightnote/shared/notification-presentation';
import { validateDefinition } from '@lightnote/shared/collection-forms';
import { notificationSchedulerEnabled } from '../notificationSchedulerPolicy.js';
import { signupSourceSurveySchemaReady } from './signupSourceSurveySchema.js';

const json = (value) => (typeof value === 'string' ? JSON.parse(value) : value);
const failure = (code) => Object.assign(new Error(code), { code });
const configurationSql = `SELECT form_id,UNIX_TIMESTAMP(eligible_from) AS eligible,
  UNIX_TIMESTAMP(after_create_time) AS after_time,after_user_id FROM signup_source_survey WHERE id=1`;

/** Explicit, idempotent data change. Keep the original form ID, answers and reward receipts. */
export async function activateSignupSourceSurvey({ db = pool, formId, apply = false } = {}) {
  if (!formId || typeof formId !== 'string' || formId.length > 36) throw failure('SURVEY_FORM_REQUIRED');
  if (!(await signupSourceSurveySchemaReady(db))) throw failure('SIGNUP_SOURCE_SURVEY_SCHEMA_MISSING');
  const connection = await db.getConnection();
  try {
    if (apply) {
      await connection.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
      await connection.beginTransaction();
    }
    const [[candidate]] = await connection.query('SELECT user_id FROM collection_forms WHERE id=?', [formId]);
    if (!candidate) throw failure('SURVEY_FORM_NOT_FOUND');
    const [[owner]] = await connection.query(
      'SELECT role,del_flag FROM user WHERE id=?' + (apply ? ' FOR UPDATE' : ''),
      [candidate.user_id],
    );
    const [[form]] = await connection.query(
      'SELECT * FROM collection_forms WHERE id=?' + (apply ? ' FOR UPDATE' : ''),
      [formId],
    );
    if (owner?.role !== 'root' || Number(owner.del_flag) !== 0 || !form) throw failure('SURVEY_ROOT_FORM_REQUIRED');
    const [[existing]] = await connection.query(configurationSql + (apply ? ' FOR UPDATE' : ''));
    if (existing) {
      if (existing.form_id !== formId) throw failure('SURVEY_ALREADY_CONFIGURED');
      if (apply) await connection.commit();
      return { active: true, eligibleFrom: Number(existing.eligible), formId };
    }
    const definition = validateDefinition(json(form.definition));
    if (
      !form.published ||
      !['collecting', 'paused'].includes(form.status) ||
      !definition.membersOnly ||
      definition.submissionPolicy !== 'replace' ||
      !definition.reward
    )
      throw failure('SURVEY_MEMBER_REWARD_REQUIRED');
    const [[awarded]] = await connection.query(
      `SELECT COUNT(*) AS total FROM points_grant_operations
      WHERE request_id=? AND operation_type='collection_form_reward' AND status='succeeded'`,
      [`collection-form:${formId}`],
    );
    if (
      form.status === 'paused' &&
      (definition.reward.maxRecipients === null || Number(awarded.total) < definition.reward.maxRecipients)
    )
      throw failure('SURVEY_MANUALLY_PAUSED');
    const previousLimit = definition.reward.maxRecipients;
    if (previousLimit !== null)
      definition.description = definition.description.replace(new RegExp(`前\\s*${previousLimit}\\s*名`, 'g'), '');
    definition.reward.maxRecipients = null;
    const result = {
      active: false,
      formId,
      points: definition.reward.points,
      previousLimit,
      description: definition.description,
    };
    if (!apply) return result;
    await connection.query(
      `UPDATE collection_forms SET definition=?,status='collecting',version=version+1,updated_at=UTC_TIMESTAMP(3) WHERE id=?`,
      [JSON.stringify(definition), formId],
    );
    // user.create_time has second precision. Activation starts at the next whole second,
    // so no account that exists at activation can fall into the eligible cohort.
    await connection.query(
      `INSERT INTO signup_source_survey
      (id,form_id,eligible_from,after_create_time,after_user_id)
      VALUES (1,?,DATE_ADD(CURRENT_TIMESTAMP,INTERVAL 1 SECOND),DATE_ADD(CURRENT_TIMESTAMP,INTERVAL 1 SECOND),'')`,
      [formId],
    );
    const [[saved]] = await connection.query(configurationSql);
    await connection.commit();
    return { ...result, active: true, eligibleFrom: Number(saved.eligible) };
  } catch (error) {
    if (apply) await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/** Production-only consumer. Cursor and notification commit together, surviving restarts and deletion. */
export async function runSignupSourceSurveyBatch({
  db = pool,
  env = process.env,
  batchSize = 50,
  notify = createNotification,
} = {}) {
  if (
    !notificationSchedulerEnabled(env) ||
    env.SIGNUP_SOURCE_SURVEY_ENABLED === 'false' ||
    env.COLLECTION_FORMS_ENABLED === 'false'
  )
    return { checked: 0, notified: 0, disabled: true };
  const connection = await db.getConnection();
  let locked = false;
  try {
    const [[lock]] = await connection.query(
      "SELECT GET_LOCK(CONCAT('ln:signup-survey:',LEFT(SHA2(DATABASE(),256),32)),0) AS acquired",
    );
    locked = Number(lock.acquired) === 1;
    if (!locked) return { checked: 0, notified: 0, busy: true };
    const [[config]] = await connection.query(configurationSql);
    if (!config) return { checked: 0, notified: 0, inactive: true };
    const [[candidateForm]] = await connection.query('SELECT user_id FROM collection_forms WHERE id=?', [
      config.form_id,
    ]);
    if (!candidateForm) return { checked: 0, notified: 0, inactive: true };
    const [users] = await connection.query(
      `SELECT id,UNIX_TIMESTAMP(create_time) AS registered FROM user
      WHERE del_flag=0 AND create_time>=FROM_UNIXTIME(?) AND create_time<=FROM_UNIXTIME(UNIX_TIMESTAMP()-86400)
      AND (create_time>FROM_UNIXTIME(?) OR (create_time=FROM_UNIXTIME(?) AND id>?))
      ORDER BY create_time,id LIMIT ?`,
      [
        config.eligible,
        config.after_time,
        config.after_time,
        config.after_user_id,
        Math.min(100, Math.max(1, Math.trunc(batchSize) || 50)),
      ],
    );
    let notified = 0,
      checked = 0;
    for (const candidate of users) {
      await connection.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
      await connection.beginTransaction();
      try {
        // Same owner -> form -> respondent lock order as public collection submissions.
        const [[owner]] = await connection.query('SELECT role,del_flag FROM user WHERE id=? FOR UPDATE', [
          candidateForm.user_id,
        ]);
        const [[form]] = await connection.query(
          'SELECT public_id,status,definition FROM collection_forms WHERE id=? FOR UPDATE',
          [config.form_id],
        );
        const definition = form && json(form.definition);
        if (
          owner?.role !== 'root' ||
          Number(owner.del_flag) !== 0 ||
          form?.status !== 'collecting' ||
          !definition?.membersOnly ||
          definition?.reward?.maxRecipients !== null
        ) {
          await connection.rollback();
          break;
        }
        const [[ownerRestricted]] = await connection.query(
          `SELECT user_id FROM security_account_restrictions
          WHERE user_id=? AND status='active' AND (expires_at IS NULL OR expires_at>NOW())
          AND restriction_type IN ('login_lock','full_lock','write_lock') LIMIT 1`,
          [candidateForm.user_id],
        );
        if (ownerRestricted) {
          await connection.rollback();
          break;
        }
        const [[user]] = await connection.query(
          `SELECT role,del_flag,preferences,
          create_time>=FROM_UNIXTIME(?) AND create_time<=FROM_UNIXTIME(UNIX_TIMESTAMP()-86400) AS eligible
          FROM user WHERE id=? FOR UPDATE`,
          [config.eligible, candidate.id],
        );
        const [[answered]] = await connection.query(
          'SELECT id FROM collection_submissions WHERE form_id=? AND respondent_user_id=? LIMIT 1',
          [config.form_id, candidate.id],
        );
        const [[awarded]] = await connection.query(
          `SELECT id FROM points_grant_operations WHERE user_id=? AND request_id=?
          AND operation_type='collection_form_reward' AND status='succeeded' LIMIT 1`,
          [candidate.id, `collection-form:${config.form_id}`],
        );
        const [[restricted]] = await connection.query(
          `SELECT user_id FROM security_account_restrictions
          WHERE user_id=? AND status='active' AND (expires_at IS NULL OR expires_at>NOW())
          AND restriction_type IN ('login_lock','full_lock','write_lock') LIMIT 1`,
          [candidate.id],
        );
        if (
          user?.role === 'user' &&
          Number(user.del_flag) === 0 &&
          Number(user.eligible) === 1 &&
          json(user.preferences)?.notificationsInApp !== false &&
          !answered &&
          !awarded &&
          !restricted
        ) {
          const notice = { type: 'signup_source_survey', meta: { points: definition.reward.points } };
          const id = await notify(
            candidate.id,
            {
              ...notice,
              ...notificationPresentation(notice),
              link: `/f/${form.public_id}`,
              sourceType: 'signup_source_survey',
              sourceId: config.form_id,
            },
            connection,
          );
          if (id) notified++;
        }
        await connection.query(
          'UPDATE signup_source_survey SET after_create_time=FROM_UNIXTIME(?),after_user_id=? WHERE id=1',
          [candidate.registered, candidate.id],
        );
        await connection.commit();
        checked++;
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    }
    return { checked, notified };
  } finally {
    if (locked)
      await connection
        .query("SELECT RELEASE_LOCK(CONCAT('ln:signup-survey:',LEFT(SHA2(DATABASE(),256),32)))")
        .catch(() => {});
    connection.release();
  }
}

export function startSignupSourceSurveyScheduler({ db = pool, env = process.env } = {}) {
  if (!notificationSchedulerEnabled(env) || env.SIGNUP_SOURCE_SURVEY_ENABLED === 'false') return () => {};
  let running = false;
  async function tick() {
    if (running) return;
    running = true;
    try {
      if (await signupSourceSurveySchemaReady(db)) await runSignupSourceSurveyBatch({ db, env });
    } catch (error) {
      console.warn(
        '[signup-source-survey] failed code=%s',
        /^[A-Z0-9_]+$/.test(error?.code) ? error.code : 'SURVEY_FAILED',
      );
    } finally {
      running = false;
    }
  }
  const timer = setInterval(tick, 60_000);
  timer.unref?.();
  void tick();
  return () => clearInterval(timer);
}
