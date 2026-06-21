const nodemailer = require('nodemailer');
const logger = require('../config/logger');

/**
 * Send an email using nodemailer or fallback to console print if SMTP configs are missing
 * @param {Object} options - Email options (email, subject, message, html)
 */
const sendEmail = async (options) => {
  const hasSMTPConfig = 
    process.env.SMTP_HOST && 
    process.env.SMTP_PORT && 
    process.env.SMTP_USER && 
    process.env.SMTP_PASS;

  if (!hasSMTPConfig) {
    // Development console fallback
    logger.warn('SMTP credentials not configured. Falling back to local logging.');
    logger.info(`
============================================================
📧 SIMULATED OUTGOING EMAIL
============================================================
To:      ${options.email}
Subject: ${options.subject}
Message:
${options.message}
============================================================
    `);
    return { status: 'simulated', messageId: `simulated-${Date.now()}` };
  }

  // Create transporter
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  // Define email options
  const mailOptions = {
    from: process.env.FROM_EMAIL || 'Talvion Support <noreply@talvion.com>',
    to: options.email,
    subject: options.subject,
    text: options.message,
    html: options.html || undefined
  };

  // Send email
  const info = await transporter.sendMail(mailOptions);
  logger.info(`Email sent successfully: ${info.messageId}`);
  return info;
};

module.exports = sendEmail;
