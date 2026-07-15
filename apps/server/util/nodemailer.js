import nodemailer from 'nodemailer';

export const smtpUser = process.env.SMTP_USER || '1902013368@qq.com';

const nodeMail = nodemailer.createTransport({
  service: 'qq',
  port: 465,
  secure: true,
  auth: {
    user: smtpUser,
    pass: process.env.SMTP_PASS,
  },
  logger: true,
});

export default nodeMail;
