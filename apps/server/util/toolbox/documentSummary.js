import crypto from 'node:crypto';
import { insertData } from '../agent/data.js';
import pool from '../../db/index.js';
import { aiSkillError } from '../aiSkill/errors.js';

// Only validated summaries are persisted. No PDF, extracted text or model prompts enter these records.
export async function persistDocumentSummary({ userId, requestId, input, response, database = pool }) {
  if (
    !userId ||
    response.status !== 'completed' ||
    response.result?.kind !== 'grounded_markdown' ||
    !response.result.content?.trim()
  ) {
    throw aiSkillError('AI_SUMMARY_RESULT_INVALID', '总结成果无效');
  }
  const digest = crypto
    .createHash('sha256')
    .update(JSON.stringify([input.title, input.text]))
    .digest('hex');
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    const [owners] = await connection.query('SELECT id FROM user WHERE id = ? AND del_flag = 0 FOR UPDATE', [userId]);
    if (!owners.length) throw aiSkillError('AI_SUMMARY_USER_UNAVAILABLE', '账号不可用', 403);
    const completedAt = new Date();
    const expiresAt = new Date(completedAt.getTime() + 90 * 24 * 60 * 60 * 1000);
    const jobData = insertData({
      userId,
      clientRequestId: `summary:${requestId}`,
      toolId: 'pdf_text_extractor',
      billingMedium: 'ai_quota',
      inputDigest: digest,
      optionsJson: '{}',
      status: 'succeeded',
      billingStatus: 'settled',
      progress: 100,
      stage: 'completed',
      startedAt: completedAt,
      completedAt,
      expiresAt,
    });
    await connection.query('INSERT INTO toolbox_jobs SET ? ON DUPLICATE KEY UPDATE id=id', [jobData]);
    const [[job]] = await connection.query(
      'SELECT id,input_digest,artifact_id FROM toolbox_jobs WHERE user_id=? AND client_request_id=? FOR UPDATE',
      [userId, `summary:${requestId}`],
    );
    if (!job || job.input_digest !== digest)
      throw aiSkillError('AI_SUMMARY_REQUEST_CONFLICT', '请求标识已用于另一份文档', 409);
    let artifactId = job.artifact_id;
    let content = response.result.content;
    if (!artifactId) {
      const title = Array.from(`${input.title.replace(/\.pdf$/iu, '')} · AI 总结`)
        .slice(0, 255)
        .join('');
      const artifactData = insertData({
        jobId: job.id,
        userId,
        toolId: 'pdf_text_extractor',
        artifactType: 'document_summary',
        title,
        content,
        contentType: 'markdown',
        sourceJson: '[]',
        coverageJson: JSON.stringify(response.coverage || {}),
        metaJson: '{}',
        status: 'ready',
        expiresAt,
      });
      await connection.query('INSERT INTO toolbox_artifacts SET ?', [artifactData]);
      artifactId = artifactData.id;
      await connection.query('UPDATE toolbox_jobs SET artifact_id=? WHERE id=? AND user_id=?', [
        artifactId,
        job.id,
        userId,
      ]);
    } else {
      const [[artifact]] = await connection.query(
        "SELECT content FROM toolbox_artifacts WHERE id=? AND user_id=? AND status='ready' AND expires_at>NOW()",
        [artifactId, userId],
      );
      if (!artifact) throw aiSkillError('AI_SUMMARY_RESULT_EXPIRED', '原总结已过期，请重新生成', 409);
      content = artifact.content;
    }
    await connection.commit();
    return { toolboxJobId: job.id, toolboxArtifactId: artifactId, content };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
