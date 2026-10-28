import pool from '../db/index.js';
import {
  migrateSignupSourceSurveySchema,
  signupSourceSurveySchemaReady,
} from '../util/services/signupSourceSurveySchema.js';
import { activateSignupSourceSurvey } from '../util/services/signupSourceSurveyService.js';

try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--install-schema') {
    await migrateSignupSourceSurveySchema(pool);
    if (!(await signupSourceSurveySchemaReady(pool)))
      throw Object.assign(new Error(), { code: 'SIGNUP_SOURCE_SURVEY_SCHEMA_MISSING' });
    console.log('[signup-source-survey] structure installed; not activated');
  } else {
    if (args.some((arg) => arg !== '--apply' && !arg.startsWith('--form-id=')))
      throw Object.assign(new Error(), { code: 'INVALID_ARGUMENT' });
    const formId = args.find((arg) => arg.startsWith('--form-id='))?.slice('--form-id='.length);
    const result = await activateSignupSourceSurvey({ formId, apply: args.includes('--apply') });
    console.log(JSON.stringify(result));
  }
} catch (error) {
  console.error(
    '[signup-source-survey] configuration failed code=%s',
    /^[A-Z0-9_]+$/.test(error?.code) ? error.code : 'CONFIGURATION_FAILED',
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
