import nodemailer from 'nodemailer';

const nodeMail = nodemailer.createTransport({
  service: 'qq',
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER || '1902013368@qq.com',
    pass: process.env.SMTP_PASS,
  },
  logger: true,
});

export default nodeMail;
