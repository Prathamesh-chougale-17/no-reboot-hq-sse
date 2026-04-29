import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';

const WEBHOOK_SECRET_PREFIX = 'acme_whsec_';
const WEBHOOK_SIGNATURE_PREFIX = 'v1=';

const deriveEncryptionKey = (seed: string): Buffer => createHash('sha256').update(seed).digest();

export const generateWebhookSecret = (): string =>
  `${WEBHOOK_SECRET_PREFIX}${randomBytes(24).toString('base64url')}`;

export const hashWebhookSecret = (secret: string): string =>
  createHash('sha256').update(secret).digest('hex');

export const encryptWebhookSecret = (secret: string, seed: string): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveEncryptionKey(seed), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString('base64url'),
    authTag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
};

export const decryptWebhookSecret = (ciphertext: string, seed: string): string => {
  const [ivValue, authTagValue, encryptedValue] = ciphertext.split('.');

  if (!ivValue || !authTagValue || !encryptedValue) {
    throw new Error('Webhook secret ciphertext is invalid.');
  }

  const decipher = createDecipheriv(
    'aes-256-gcm',
    deriveEncryptionKey(seed),
    Buffer.from(ivValue, 'base64url'),
  );

  decipher.setAuthTag(Buffer.from(authTagValue, 'base64url'));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64url')),
    decipher.final(),
  ]);

  return plaintext.toString('utf8');
};

export const createWebhookSignature = ({
  secret,
  timestamp,
  payload,
}: {
  secret: string;
  timestamp: string;
  payload: string;
}): string =>
  `${WEBHOOK_SIGNATURE_PREFIX}${createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex')}`;

export const getWebhookAttemptDelayMs = (attemptCount: number): number =>
  Math.min(15_000 * 2 ** Math.max(attemptCount - 1, 0), 5 * 60_000);
