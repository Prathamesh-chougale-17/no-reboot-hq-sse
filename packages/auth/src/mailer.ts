import dns from 'node:dns';

import nodemailer from 'nodemailer';
import { Resend } from 'resend';

import type { BetterAuthEnv } from '@acme/config';
import { APP_NAME } from '@acme/shared';

type AuthEmailType = 'invitation' | 'password-reset' | 'verification';
type AuthEmailProvider = 'resend' | 'smtp' | 'capture';
type AuthEmailPayload = Pick<AuthEmailRecord, 'subject' | 'html' | 'text'> & {
  from: string;
  to: string;
};

export type AuthEmailRecord = {
  type: AuthEmailType;
  to: string;
  subject: string;
  html: string;
  text: string;
};

const capturedEmails: AuthEmailRecord[] = [];

const recordCapturedEmail = (email: AuthEmailRecord) => {
  capturedEmails.push(email);
};

type ResendClient = {
  emails: {
    send(payload: AuthEmailPayload): Promise<unknown>;
  };
};
type SmtpClient = {
  sendMail(payload: AuthEmailPayload): Promise<unknown>;
};

type AuthMailerDependencies = {
  resendClient?: ResendClient;
  smtpClient?: SmtpClient;
};

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string,
  family: number,
) => void;
type LookupOptions = {
  family?: number;
  hints?: number;
  all?: boolean;
};

const SMTP_CONNECTION_TIMEOUT_MS = 20_000;
const SMTP_DNS_TIMEOUT_MS = 10_000;

const lookupIpv4Address = (
  hostname: string,
  options: LookupOptions | number,
  callback: LookupCallback,
): void => {
  const normalizedOptions =
    typeof options === 'number'
      ? {
          family: options,
        }
      : (options ?? {});

  dns.lookup(
    hostname,
    {
      ...normalizedOptions,
      family: 4,
      all: false,
    },
    callback,
  );
};

const createResendClient = (apiKey?: string): ResendClient | undefined =>
  apiKey ? new Resend(apiKey) : undefined;

const hasCompleteSmtpConfig = (env: BetterAuthEnv) =>
  Boolean(env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASSWORD);

const createSmtpClient = (env: BetterAuthEnv): SmtpClient | undefined => {
  if (!hasCompleteSmtpConfig(env)) {
    return undefined;
  }

  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
    greetingTimeout: SMTP_CONNECTION_TIMEOUT_MS,
    dnsTimeout: SMTP_DNS_TIMEOUT_MS,
    tls: {
      servername: env.SMTP_HOST,
    },
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASSWORD,
    },
    lookup: lookupIpv4Address as never,
  } as never);
};

const getMissingEmailProviderMessage = (env: BetterAuthEnv) => {
  const missingSmtpFields = [
    env.SMTP_HOST ? undefined : 'SMTP_HOST',
    env.SMTP_PORT ? undefined : 'SMTP_PORT',
    env.SMTP_USER ? undefined : 'SMTP_USER',
    env.SMTP_PASSWORD ? undefined : 'SMTP_PASSWORD',
  ].filter(Boolean);

  return `Auth email provider is not configured. Set RESEND_API_KEY or complete SMTP settings (${missingSmtpFields.join(', ') || 'SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD'}).`;
};

export const resolveAuthEmailProvider = (env: BetterAuthEnv): AuthEmailProvider => {
  if (env.RESEND_API_KEY) {
    return 'resend';
  }

  if (hasCompleteSmtpConfig(env)) {
    return 'smtp';
  }

  if (env.NODE_ENV !== 'production') {
    return 'capture';
  }

  throw new Error(getMissingEmailProviderMessage(env));
};

const sanitizeRecipient = (to: string) => to.trim().toLowerCase();

const supportCopy = 'If you did not request this email, you can safely ignore it.';

const renderShell = (title: string, intro: string, actionLabel: string, actionUrl: string) => {
  const escapedUrl = actionUrl.replace(/"/g, '&quot;');

  return {
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
        <p style="font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; color: #0891b2;">
          ${APP_NAME}
        </p>
        <h1 style="font-size: 28px; margin-bottom: 12px;">${title}</h1>
        <p style="margin-bottom: 16px;">${intro}</p>
        <p style="margin: 24px 0;">
          <a
            href="${escapedUrl}"
            style="display: inline-block; padding: 12px 20px; border-radius: 999px; background: #06b6d4; color: #082f49; text-decoration: none; font-weight: 700;"
          >
            ${actionLabel}
          </a>
        </p>
        <p style="word-break: break-all; color: #475569;">${actionUrl}</p>
        <p style="margin-top: 24px; color: #64748b;">${supportCopy}</p>
      </div>
    `.trim(),
    text: `${APP_NAME}\n\n${title}\n\n${intro}\n\n${actionLabel}: ${actionUrl}\n\n${supportCopy}`,
  };
};

const dispatchEmail = async (
  env: BetterAuthEnv,
  email: AuthEmailRecord,
  dependencies: AuthMailerDependencies = {},
): Promise<{ provider: AuthEmailProvider }> => {
  const provider = resolveAuthEmailProvider(env);

  if (provider === 'capture') {
    recordCapturedEmail(email);
    console.info('[auth-email]', { type: email.type, to: email.to, provider });
    return { provider };
  }

  if (provider === 'resend') {
    const resend = dependencies.resendClient ?? createResendClient(env.RESEND_API_KEY);

    if (!resend) {
      throw new Error('Resend client could not be initialized.');
    }

    await resend.emails.send({
      from: env.AUTH_FROM_EMAIL,
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });

    console.info('[auth-email]', { type: email.type, to: email.to, provider });
    return { provider };
  }

  const smtpClient = dependencies.smtpClient ?? createSmtpClient(env);

  if (!smtpClient) {
    throw new Error('SMTP client could not be initialized.');
  }

  await smtpClient.sendMail({
    from: env.AUTH_FROM_EMAIL,
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });

  console.info('[auth-email]', { type: email.type, to: email.to, provider });

  return { provider };
};

export const clearCapturedAuthEmails = () => {
  capturedEmails.length = 0;
};

export const getCapturedAuthEmails = () => [...capturedEmails];

export const createAuthMailer = (
  env: BetterAuthEnv,
  dependencies: AuthMailerDependencies = {},
) => ({
  async sendPasswordReset(input: { email: string; name?: string | null; url: string }) {
    const content = renderShell(
      'Reset your password',
      `A password reset was requested${input.name ? ` for ${input.name}` : ''}.`,
      'Reset password',
      input.url,
    );

    await dispatchEmail(
      env,
      {
        type: 'password-reset',
        to: sanitizeRecipient(input.email),
        subject: `${APP_NAME}: reset your password`,
        ...content,
      },
      dependencies,
    );
  },

  async sendVerification(input: { email: string; name?: string | null; url: string }) {
    const content = renderShell(
      'Verify your email address',
      `Confirm this address${input.name ? ` for ${input.name}` : ''} so teammates can trust your access.`,
      'Verify email',
      input.url,
    );

    await dispatchEmail(
      env,
      {
        type: 'verification',
        to: sanitizeRecipient(input.email),
        subject: `${APP_NAME}: verify your email`,
        ...content,
      },
      dependencies,
    );
  },

  async sendInvitation(input: {
    email: string;
    inviterName?: string | null;
    organizationName: string;
    role: string;
    url: string;
  }) {
    const content = renderShell(
      `Join ${input.organizationName}`,
      `${input.inviterName ?? 'A teammate'} invited you to join ${input.organizationName} as ${input.role}. Sign in or create an account, then accept the invitation.`,
      'Review invitation',
      input.url,
    );

    await dispatchEmail(
      env,
      {
        type: 'invitation',
        to: sanitizeRecipient(input.email),
        subject: `${APP_NAME}: invitation to ${input.organizationName}`,
        ...content,
      },
      dependencies,
    );
  },
});
