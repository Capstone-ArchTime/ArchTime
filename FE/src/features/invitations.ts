import { API_BASE_URL } from '../auth/session.ts';

/** What happened to a workspace invitation (BE: POST /api/invitations/:token/accept | decline). */
export type InvitationResult = { projectId: string; role: string };

export class InvitationError extends Error {
  status: number;
  /** The invited email has no account yet, or the person has to sign in with it first. */
  needsAccount: boolean;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.needsAccount = status === 400 && /register|log in|sign in/i.test(message);
  }
}

async function post(token: string, action: 'accept' | 'decline', signal?: AbortSignal): Promise<unknown> {
  if (!token.trim()) throw new InvitationError('This invitation link is incomplete. Open it again from your email.', 400);
  const timeout = AbortSignal.timeout(15_000);
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/invitations/${encodeURIComponent(token)}/${action}`, {
      method: 'POST', signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timeout.aborted) throw new Error('The request timed out. Check your connection and try again.');
    throw new Error('Cannot reach the server. Check your connection and try again.');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = typeof body?.error === 'object' && body?.error ? body.error.message : body?.message;
    throw new InvitationError(typeof detail === 'string' && detail.trim() ? detail : response.status === 404
      ? 'This invitation was not found. It may have been accepted, declined or cancelled already.'
      : `Request failed (${response.status}). Please try again.`, response.status);
  }
  return body?.data;
}

export async function acceptInvitation(token: string, signal?: AbortSignal): Promise<InvitationResult> {
  const data = await post(token, 'accept', signal) as Partial<InvitationResult> | null | undefined;
  if (!data || typeof data.projectId !== 'string' || typeof data.role !== 'string') throw new Error('The server returned an invalid response. Please try again.');
  return { projectId: data.projectId, role: data.role };
}

export async function declineInvitation(token: string, signal?: AbortSignal): Promise<void> {
  await post(token, 'decline', signal);
}
