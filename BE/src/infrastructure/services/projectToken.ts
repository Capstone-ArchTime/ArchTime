import { seal, unseal } from '../llm/secrets.js';

// A private repository's access token is stored encrypted (AES-256-GCM, same key as the model API keys) in one string:
// "enc:v1:<iv>:<tag>:<ciphertext>". Projects saved before encryption hold the bare token and are still read as-is.

const PREFIX = 'enc:v1:';

export function sealProjectToken(plain: string | undefined): string | undefined {
  if (!plain) return undefined;
  const { iv, tag, ciphertext } = seal(plain);
  return `${PREFIX}${iv}:${tag}:${ciphertext}`;
}

export function unsealProjectToken(stored: string | undefined | null): string | undefined {
  if (!stored) return undefined;
  if (!stored.startsWith(PREFIX)) return stored; // saved before tokens were encrypted
  const [iv, tag, ciphertext] = stored.slice(PREFIX.length).split(':');
  if (!iv || !tag || !ciphertext) throw new Error('The stored repository token is malformed. Enter the token again.');
  try {
    return unseal({ iv, tag, ciphertext });
  } catch {
    throw new Error('The stored repository token could not be decrypted (LLM_SECRET_KEY changed?). Enter the token again.');
  }
}
