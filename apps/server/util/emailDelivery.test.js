import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupEmailDeliveryLogs, sendTrackedEmail } from './emailDelivery.js';

describe('sendTrackedEmail', () => {
  const db = { query: vi.fn() };
  const transport = { sendMail: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    db.query.mockResolvedValue([{ affectedRows: 1 }]);
    transport.sendMail.mockResolvedValue({ messageId: 'message-1', response: '250 accepted' });
  });

  it('SMTP 受理后记录 accepted，且不保存邮件正文', async () => {
    await sendTrackedEmail(
      {
        emailType: 'verification',
        recipient: 'person@example.com',
        subject: '验证邮件',
        html: '<p>验证码 123456</p>',
      },
      { db, transport },
    );

    expect(db.query).toHaveBeenCalledTimes(2);
    const [, [insertRow]] = db.query.mock.calls[0];
    expect(insertRow).toMatchObject({
      email_type: 'verification',
      recipient_email: 'person@example.com',
      subject: '验证邮件',
      status: 'sending',
    });
    expect(insertRow).not.toHaveProperty('html');
    expect(insertRow).not.toHaveProperty('text');
    expect(db.query.mock.calls[1][0]).toContain("status = 'accepted'");
  });

  it('SMTP 失败时记录脱敏错误并继续抛给业务', async () => {
    const error = Object.assign(new Error('send to person@example.com failed'), { code: 'EAUTH' });
    transport.sendMail.mockRejectedValue(error);

    await expect(
      sendTrackedEmail(
        { emailType: 'verification', recipient: 'person@example.com', subject: '验证邮件' },
        { db, transport },
      ),
    ).rejects.toBe(error);

    const updateParams = db.query.mock.calls[1][1];
    expect(updateParams[0]).toBe('EAUTH');
    expect(updateParams[1]).not.toContain('person@example.com');
    expect(db.query.mock.calls[1][0]).toContain("status = 'failed'");
  });

  it('追踪表暂不可用时仍发送核心邮件', async () => {
    db.query.mockRejectedValueOnce(new Error('table unavailable'));

    const result = await sendTrackedEmail(
      { emailType: 'verification', recipient: 'person@example.com', subject: '验证邮件' },
      { db, transport },
    );

    expect(result.messageId).toBe('message-1');
    expect(transport.sendMail).toHaveBeenCalledTimes(1);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('SMTP 已受理后的日志回写失败不会误报发送失败', async () => {
    db.query.mockResolvedValueOnce([{ affectedRows: 1 }]).mockRejectedValueOnce(new Error('write failed'));

    await expect(
      sendTrackedEmail(
        { emailType: 'verification', recipient: 'person@example.com', subject: '验证邮件' },
        { db, transport },
      ),
    ).resolves.toMatchObject({ messageId: 'message-1' });
  });

  it('按保留期小批量清理历史邮件记录', async () => {
    db.query.mockResolvedValueOnce([{ affectedRows: 500 }]);
    const now = new Date('2026-07-26T12:00:00Z');

    const result = await cleanupEmailDeliveryLogs({
      db,
      retentionDays: 180,
      batchSize: 500,
      now,
    });

    expect(db.query.mock.calls[0][0]).toContain('DELETE FROM email_delivery_logs');
    expect(db.query.mock.calls[0][1][0]).toEqual(new Date('2026-01-27T12:00:00.000Z'));
    expect(db.query.mock.calls[0][1][1]).toBe(500);
    expect(result).toEqual({ deleted: 500, backlogPossible: true, retentionDays: 180 });
  });
});
