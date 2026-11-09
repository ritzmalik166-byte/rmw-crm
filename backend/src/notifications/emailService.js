import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { enqueue } from '../workers/queues.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const layout = (title, inner) => `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f6f7f9;padding:24px">
<div style="max-width:560px;margin:auto;background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:24px">
<h2 style="margin:0 0 16px;font-size:18px;color:#111827">${esc(title)}</h2>${inner}
<p style="color:#6b7280;font-size:12px;margin-top:24px">RMW CRM. This is an automated message.</p></div></body></html>`;

const button = (href, label) => `<p><a href="${esc(href)}" style="display:inline-block;background:#111827;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">${esc(label)}</a></p>`;

export const TEMPLATES = {
  passwordReset: (d) => ({
    subject: 'Reset your RMW CRM password',
    html: layout('Reset your password', `<p>Hi ${esc(d.name)},</p><p>Use the button below to set a new password. The link expires in ${esc(d.minutes)} minutes and works once.</p>${button(d.link, 'Reset password')}<p>If you did not request this, ignore this email.</p>`),
  }),
  accountApproved: (d) => ({
    subject: 'Your RMW CRM account is approved',
    html: layout('Account approved', `<p>Hi ${esc(d.name)},</p><p>Your CRM account has been approved. You can now sign in.</p>${button(`${env.APP_URL}/login`, 'Sign in')}`),
  }),
  accountRejected: (d) => ({
    subject: 'Your RMW CRM account request',
    html: layout('Account request not approved', `<p>Hi ${esc(d.name)},</p><p>Your CRM account request was not approved.${d.reason ? ` Reason: ${esc(d.reason)}` : ''}</p>`),
  }),
  notification: (d) => ({
    subject: d.title,
    html: layout(d.title, `<p>${esc(d.body || '')}</p>${d.link ? button(`${env.APP_URL}${d.link}`, 'Open in CRM') : ''}`),
  }),
};

let transporter = null;
function getTransport() {
  if (!env.SMTP_HOST) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    });
  }
  return transporter;
}

export const emailService = {
  /** Queue an email (non-blocking). */
  send: (template, data) => enqueue('email', 'template', { template, data }),

  /** Deliver now. Called by the email worker. */
  async deliver(template, data) {
    const t = getTransport();
    if (!t) {
      logger.warn({ template }, 'SMTP is not configured; email not sent');
      return;
    }
    const { subject, html } = TEMPLATES[template](data);
    await t.sendMail({ from: env.MAIL_FROM, to: data.to, subject, html });
  },
};
