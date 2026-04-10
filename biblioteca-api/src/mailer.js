const nodemailer = require('nodemailer');

function toBool(value, fallback = false) {
  if (value === undefined) return fallback;
  return String(value).toLowerCase() === 'true';
}

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = toBool(process.env.SMTP_SECURE, false);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

async function sendRecoveryCode({ to, code, expiresInMinutes }) {
  const transporter = getTransporter();
  const from = process.env.MAIL_FROM || 'Biblioteca Escolar <nao-responder@escola.local>';

  const subject = 'Codigo de recuperacao de senha';
  const text = [
    'Voce solicitou a recuperacao da sua senha da Biblioteca Escolar.',
    '',
    `Codigo: ${code}`,
    `Validade: ${expiresInMinutes} minutos`,
    '',
    'Se voce nao solicitou, ignore este e-mail.',
  ].join('\n');

  if (!transporter) {
    return { sent: false };
  }

  await transporter.sendMail({ from, to, subject, text });
  return { sent: true };
}

module.exports = {
  sendRecoveryCode,
};
