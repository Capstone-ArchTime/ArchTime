export interface IOtp {
  id: string;
  email: string;
  /** HMAC-SHA256 (hex) of "<email>:<code>" under a server secret. The code itself is never stored. */
  codeHash: string;
  /** How many guesses have been made against this code (correct or not). */
  attempts: number;
  expiresAt: Date;
  createdAt: Date;
}
