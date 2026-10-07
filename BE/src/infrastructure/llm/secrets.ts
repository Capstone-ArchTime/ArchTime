import crypto from 'node:crypto';

/**
 * API keys for models added by an administrator are stored encrypted (AES-256-GCM). The key comes from LLM_SECRET_KEY,
 * or JWT_SECRET when that is not set; changing it makes stored API keys unreadable, so they have to be entered again.
 */
export interface SealedSecret { ciphertext: string; iv: string; tag: string; last4: string }

function key(): Buffer {
  const secret = process.env.LLM_SECRET_KEY || process.env.JWT_SECRET;
  if (!secret) throw new Error('LLM_SECRET_KEY (or JWT_SECRET) must be set to store model API keys.');
  return crypto.createHash('sha256').update(secret).digest();
}

export function seal(plain: string): SealedSecret {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), last4: plain.slice(-4) };
}

export function unseal(sealed: Pick<SealedSecret, 'ciphertext' | 'iv' | 'tag'>): string {
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(sealed.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('The stored API key could not be decrypted (LLM_SECRET_KEY changed?). Enter the key again.');
  }
}
