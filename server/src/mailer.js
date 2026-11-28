import nodemailer from 'nodemailer';

const CODE_EXPIRY_MINUTES = 10;

export function createEmailSender({ user, appPassword }) {
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user,
      pass: appPassword,
    },
  });

  return async function sendEmailCode({ to, code, purpose }) {
    const isPasswordReset = purpose === 'reset_password';
    const title = isPasswordReset ? 'Reset your KonnectX password' : 'Verify your KonnectX email';
    const action = isPasswordReset ? 'reset your password' : 'verify your email address';
    const text = [
      `Use this code to ${action}: ${code}`,
      `This code expires in ${CODE_EXPIRY_MINUTES} minutes.`,
      'If you did not request this, you can ignore this email.',
      'If you do not see this message in your inbox, check your spam or junk folder.',
    ].join('\n\n');

    await transporter.sendMail({
      from: { name: 'KonnectX', address: user },
      to,
      subject: title,
      text,
      html: `<div style="font-family:Arial,sans-serif;color:#111827;max-width:520px;margin:0 auto">
        <h1 style="color:#0B3B2E;font-size:22px">${title}</h1>
        <p>Use this code to ${action}:</p>
        <p style="font-size:30px;font-weight:700;letter-spacing:8px;color:#0B3B2E">${code}</p>
        <p>This code expires in ${CODE_EXPIRY_MINUTES} minutes.</p>
        <p>If you did not request this, you can ignore this email.</p>
        <p>If you do not see this message in your inbox, check your spam or junk folder.</p>
      </div>`,
    });
  };
}
