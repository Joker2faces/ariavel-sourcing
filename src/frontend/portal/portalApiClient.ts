import type { InvitationPublicDTO } from '../../server/types/invitation';
import type { QuoteInput, QuotePublicDTO } from '../../server/types/quote';

export interface PortalApiClient {
  getInvitation(token: string): Promise<InvitationPublicDTO>;
  getQuote(token: string): Promise<QuotePublicDTO | null>;
  saveDraft(token: string, input: QuoteInput): Promise<QuotePublicDTO>;
  submit(token: string): Promise<Pick<QuotePublicDTO, 'status' | 'submittedAt'>>;
}

export class PortalApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

// Public, token-authenticated client for the supplier portal — no monday
// session, no Authorization header. The raw invitation token IS the
// credential, carried in the URL path exactly as the buyer's invite link
// contains it.
export function createPortalApiClient(baseUrl = ''): PortalApiClient {
  async function req<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new PortalApiError(res.status, body.error ?? `Request failed (${res.status})`);
    }
    return res.json() as Promise<T>;
  }

  return {
    async getInvitation(token) {
      const data = await req<{ invitation: InvitationPublicDTO }>(`/api/portal/invitations/${encodeURIComponent(token)}`);
      return data.invitation;
    },
    async getQuote(token) {
      const data = await req<{ quote: QuotePublicDTO | null }>(`/api/portal/invitations/${encodeURIComponent(token)}/quote`);
      return data.quote;
    },
    async saveDraft(token, input) {
      const data = await req<{ quote: QuotePublicDTO }>(`/api/portal/invitations/${encodeURIComponent(token)}/quote`, {
        method: 'PUT',
        body: JSON.stringify(input),
      });
      return data.quote;
    },
    async submit(token) {
      const data = await req<{ quote: Pick<QuotePublicDTO, 'status' | 'submittedAt'> }>(`/api/portal/invitations/${encodeURIComponent(token)}/submit`, {
        method: 'POST',
      });
      return data.quote;
    },
  };
}
